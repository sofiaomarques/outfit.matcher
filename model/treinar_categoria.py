from __future__ import annotations

import argparse
import random
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from model.categoria_classificador import CategoriaNet, DEFAULT_OUTPUT, NUM_CATEGORIAS

DEFAULT_STYLES = Path("dados/styles_resumido.csv")
DEFAULT_CACHE = Path("dados/embeddings_resumidos.npz")
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
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--history", type=Path, default=DEFAULT_HISTORY)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--val-size", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def carregar_dados(styles_path: Path, cache_path: Path) -> tuple[np.ndarray, np.ndarray, list[str]]:
    styles = pd.read_csv(styles_path)
    styles["articleType"] = styles["articleType"].astype(str)
    styles = styles[styles["articleType"].isin(ARTICLE_TYPE_PARA_CATEGORIA)].copy()
    styles["categoria"] = styles["articleType"].map(ARTICLE_TYPE_PARA_CATEGORIA)

    cache = np.load(cache_path, allow_pickle=False)
    ids = cache["ids"].astype(str)
    embeddings = cache["embeddings"].astype(np.float32)
    emb_by_id = {item_id: embeddings[index] for index, item_id in enumerate(ids)}

    xs: list[np.ndarray] = []
    ys: list[int] = []
    tipos: list[str] = []
    for _, row in styles.iterrows():
        item_id = str(int(row["id"]))
        embedding = emb_by_id.get(item_id)
        if embedding is None:
            continue
        # indices 0-10 sao as features manuais (cor/tonalidade/etc); 11 em
        # diante e o embedding visual puro do CLIP (512 numeros).
        clip_embedding = embedding[11:]
        xs.append(clip_embedding)
        ys.append(int(row["categoria"]) - 1)  # 0-indexado pro treino
        tipos.append(row["articleType"])

    if not xs:
        raise ValueError("Nenhum item com embedding em cache encontrado.")
    return np.stack(xs).astype(np.float32), np.asarray(ys, dtype=np.int64), tipos


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    device = torch.device("cpu")

    x, y, _ = carregar_dados(args.styles, args.cache)
    print(f"[treino-categoria] exemplos: {len(y)}")
    classes, contagens = np.unique(y, return_counts=True)
    for classe, contagem in zip(classes, contagens):
        print(f"  categoria {classe + 1}: {contagem} exemplos")

    from sklearn.model_selection import train_test_split

    train_idx, val_idx = train_test_split(
        np.arange(len(y)), test_size=args.val_size, random_state=args.seed, stratify=y
    )

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
