from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from model.categoria_classificador import CategoriaNet, DEFAULT_OUTPUT, NUM_CATEGORIAS

DEFAULT_STYLES = Path("dados/styles_resumido.csv")
DEFAULT_CACHE = Path("dados/embeddings_resumidos.npz")
DEFAULT_IMAGES_DIR = Path("dados/fashion-dataset-roupas/images")
DEFAULT_HISTORY = Path("model/historico_categoria.csv")

# articleType do Kaggle -> codigo de categoria do projeto (1-10). So mapeia
# articleType sem ambiguidade de tipo; itens que misturam pecas (Tracksuits,
# Apparel Set), acessorios (Belts, Suspenders, Dupatta) ou roupa de dormir
# (subCategory "Loungewear and Nightwear") ficam fora do treino.
#
# "regata" (7) e "casaco" (9) nao tem articleType equivalente neste dataset
# (o mais proximo de regata, Camisoles, e Innerwear e ja foi excluido do
# pipeline) — ficam sem exemplo de treino por enquanto. Isso nao quebra o
# agrupamento cima/baixo/unico usado pros pares de outfit, ja que todas as
# categorias de "cima" (5 a 10) caem no mesmo tipo.
ARTICLE_TYPE_PARA_CATEGORIA: dict[str, int] = {
    # calça (1)
    "Jeans": 1, "Trousers": 1, "Track Pants": 1, "Leggings": 1, "Capris": 1,
    "Patiala": 1, "Jeggings": 1, "Salwar": 1, "Churidar": 1, "Rain Trousers": 1,
    # short (2)
    "Shorts": 2,
    # saia (3)
    "Skirts": 3,
    # vestido (4)
    "Dresses": 4, "Jumpsuit": 4,
    # top (5)
    "Tops": 5,
    # camiseta (6)
    "Tshirts": 6,
    # jaqueta (8)
    "Jackets": 8, "Rain Jacket": 8, "Blazers": 8, "Nehru Jackets": 8, "Shrug": 8,
    # blusa de manga (10)
    "Shirts": 10, "Kurtas": 10, "Kurtis": 10, "Tunics": 10, "Sweaters": 10,
    "Sweatshirts": 10,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Treina um classificador de categoria em cima do embedding visual do CLIP."
    )
    parser.add_argument("--styles", type=Path, default=DEFAULT_STYLES)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--history", type=Path, default=DEFAULT_HISTORY)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--val-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--cortes-por-item",
        type=int,
        default=2,
        help="Quantos cortes apertados simulados adicionar por item, pra deixar "
        "o classificador robusto a fotos cortadas/com zoom (nao so o "
        "enquadramento completo tipico do catalogo).",
    )
    return parser.parse_args()


def corte_apertado(imagem: Image.Image, rng: np.random.Generator, escala_min: float = 0.45, escala_max: float = 0.75) -> Image.Image:
    """Simula uma foto cortada de perto: recorta uma sub-regiao aleatoria da
    imagem e reescala de volta ao tamanho original."""
    largura, altura = imagem.size
    escala = rng.uniform(escala_min, escala_max)
    nova_largura = max(1, int(largura * escala))
    nova_altura = max(1, int(altura * escala))
    x0 = int(rng.integers(0, max(1, largura - nova_largura + 1)))
    y0 = int(rng.integers(0, max(1, altura - nova_altura + 1)))
    corte = imagem.crop((x0, y0, x0 + nova_largura, y0 + nova_altura))
    return corte.resize((largura, altura))


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def carregar_dados(
    styles_path: Path,
    cache_path: Path,
    images_dir: Path,
    cortes_por_item: int = 0,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    styles = pd.read_csv(styles_path)
    styles["articleType"] = styles["articleType"].astype(str)
    styles = styles[styles["articleType"].isin(ARTICLE_TYPE_PARA_CATEGORIA)].copy()
    styles["categoria"] = styles["articleType"].map(ARTICLE_TYPE_PARA_CATEGORIA)

    cache = np.load(cache_path, allow_pickle=False)
    ids = cache["ids"].astype(str)
    embeddings = cache["embeddings"].astype(np.float32)
    emb_by_id = {item_id: embeddings[index] for index, item_id in enumerate(ids)}

    rng = np.random.default_rng(seed)
    extrair_embedding_clip = None
    if cortes_por_item > 0:
        # import tardio pra so carregar o CLIP quando a aumentacao esta ligada.
        from features.embedding_neural import extrair_vetor_clip, processor

        def extrair_embedding_clip(imagem: Image.Image) -> np.ndarray:
            inputs = processor(images=imagem, return_tensors="pt")
            return np.asarray(extrair_vetor_clip(inputs), dtype=np.float32)

    xs: list[np.ndarray] = []
    ys: list[int] = []
    grupos: list[str] = []
    processados = 0
    for _, row in styles.iterrows():
        item_id = str(int(row["id"]))
        embedding = emb_by_id.get(item_id)
        if embedding is None:
            continue
        # indices 0-10 sao as features manuais (cor/tonalidade/etc); 11 em
        # diante e o embedding visual puro do CLIP (512 numeros).
        categoria = int(row["categoria"]) - 1  # 0-indexado pro treino
        xs.append(embedding[11:])
        ys.append(categoria)
        grupos.append(item_id)  # "grupo" = mesma foto, usado no split treino/val

        if cortes_por_item > 0:
            caminho_imagem = images_dir / f"{item_id}.jpg"
            if caminho_imagem.exists():
                imagem = Image.open(caminho_imagem).convert("RGB")
                for _ in range(cortes_por_item):
                    corte = corte_apertado(imagem, rng)
                    xs.append(extrair_embedding_clip(corte))
                    ys.append(categoria)
                    grupos.append(item_id)

        processados += 1
        if cortes_por_item > 0 and processados % 200 == 0:
            print(f"[treino-categoria] cortes gerados: {processados}/{len(styles)}")

    if not xs:
        raise ValueError("Nenhum item com embedding em cache encontrado.")
    return (
        np.stack(xs).astype(np.float32),
        np.asarray(ys, dtype=np.int64),
        np.asarray(grupos, dtype=str),
    )


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    device = torch.device("cpu")

    x, y, grupos = carregar_dados(
        args.styles, args.cache, args.images_dir, args.cortes_por_item, args.seed
    )
    print(f"[treino-categoria] exemplos: {len(y)} ({len(np.unique(grupos))} fotos, "
          f"{args.cortes_por_item} cortes por foto)")
    classes, contagens = np.unique(y, return_counts=True)
    for classe, contagem in zip(classes, contagens):
        print(f"  categoria {classe + 1}: {contagem} exemplos")

    from sklearn.model_selection import train_test_split

    # split por foto (grupo), nao por linha: os cortes de uma foto tem que
    # ficar todos do mesmo lado, senao a validacao fica otimista (o modelo
    # veria um corte de uma foto que ja viu inteira no treino).
    grupos_unicos, primeira_ocorrencia = np.unique(grupos, return_index=True)
    categoria_por_grupo = y[primeira_ocorrencia]
    grupos_treino, grupos_val = train_test_split(
        grupos_unicos, test_size=args.val_size, random_state=args.seed, stratify=categoria_por_grupo
    )
    grupos_treino_set = set(grupos_treino)
    train_idx = np.array([i for i, g in enumerate(grupos) if g in grupos_treino_set])
    val_idx = np.array([i for i, g in enumerate(grupos) if g not in grupos_treino_set])

    mean = x[train_idx].mean(axis=0)
    std = x[train_idx].std(axis=0)
    std[std < 1e-6] = 1.0
    x_norm = (x - mean) / std

    train_ds = TensorDataset(torch.from_numpy(x_norm[train_idx]), torch.from_numpy(y[train_idx]))
    val_ds = TensorDataset(torch.from_numpy(x_norm[val_idx]), torch.from_numpy(y[val_idx]))
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False)

    model = CategoriaNet(input_dim=x.shape[1], num_classes=NUM_CATEGORIAS).to(device)

    # classes com poucos exemplos pesam mais na loss, pra nao serem ignoradas
    # pela classe majoritaria (blusa de manga).
    contagem_por_classe = np.bincount(y[train_idx], minlength=NUM_CATEGORIAS).astype(np.float32)
    pesos = np.where(contagem_por_classe > 0, 1.0 / np.maximum(contagem_por_classe, 1), 0.0)
    pesos = pesos / pesos[pesos > 0].mean()
    criterion = nn.CrossEntropyLoss(weight=torch.tensor(pesos, dtype=torch.float32))
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)

    melhor_acc = 0.0
    historico = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        for xb, yb in train_loader:
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(xb), yb)
            loss.backward()
            optimizer.step()

        model.eval()
        acertos = 0
        total = 0
        with torch.no_grad():
            for xb, yb in val_loader:
                preds = model(xb).argmax(dim=1)
                acertos += int((preds == yb).sum())
                total += len(yb)
        acc = acertos / max(1, total)
        historico.append({"epoch": epoch, "val_accuracy": acc})
        if acc > melhor_acc:
            melhor_acc = acc
            args.output.parent.mkdir(parents=True, exist_ok=True)
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "input_dim": model.input_dim,
                    "hidden_dim": model.hidden_dim,
                    "num_classes": model.num_classes,
                    "mean": mean,
                    "std": std,
                    "val_accuracy": acc,
                    "epoch": epoch,
                },
                args.output,
            )

    pd.DataFrame(historico).to_csv(args.history, index=False)
    print(f"[treino-categoria] melhor acuracia de validacao: {melhor_acc:.3f}")
    print(f"[treino-categoria] modelo salvo em {args.output}")


if __name__ == "__main__":
    main()
