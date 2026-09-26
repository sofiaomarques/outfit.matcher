"""Fine-tuning do encoder visual do CLIP pro classificador de categoria.

Treina as ultimas camadas do CLIP + uma cabeca linear com as fotos do Kaggle
(`dados/fashion-dataset-roupas`), e compara no mesmo conjunto de teste com o
classificador atual (CLIP congelado + `model/categoria_model.pt`), em fotos
inteiras e em cortes apertados.

O conjunto de teste so tem fotos fora de `dados/styles_resumido.csv`, que e
de onde o classificador atual tirou o treino dele — assim os dois sao
avaliados em fotos que nenhum viu.
"""

from __future__ import annotations

import argparse
import math
import random
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image
from torch import nn
from torch.utils.data import DataLoader, Dataset
from transformers import CLIPImageProcessorPil, CLIPModel, CLIPTokenizer, CLIPVisionModelWithProjection

from model.categoria_classificador import NUM_CATEGORIAS
from model.categoria_classificador import load_model as load_probe
from model.clip_categoria import BASE_MODEL, DEFAULT_OUTPUT, ClipCategoriaNet
from model.treinar_categoria import ARTICLE_TYPE_PARA_CATEGORIA, corte_apertado

DEFAULT_DATASET = Path("dados/fashion-dataset-roupas")
DEFAULT_RESUMIDO = Path("dados/styles_resumido.csv")
DEFAULT_PROBE = Path("model/categoria_model.pt")
DEFAULT_HISTORY = Path("model/historico_categoria_clip.csv")

# Mesmos textos do zero-shot de features/categoria.py, na ordem dos codigos
# 1-10. Inicializam a cabeca: o treino parte do zero-shot, nao de pesos
# aleatorios, e regata/casaco (sem exemplo no Kaggle) continuam com um
# prototipo razoavel.
PROMPTS_CATEGORIA = [
    "pants or trousers",
    "shorts",
    "a skirt",
    "a dress",
    "a top or crop top",
    "a t-shirt",
    "a tank top or sleeveless",
    "a jacket",
    "a coat or overcoat",
    "a long sleeve blouse or shirt",
]

# categoria (1-10) -> 0 baixo, 1 unico, 2 cima. E o nivel que o app usa pra
# montar os pares de outfit.
NIVEL_TIPO = np.array([0, 0, 0, 1, 2, 2, 2, 2, 2, 2])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tuning do CLIP pra classificar categoria de roupa.")
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--resumido", type=Path, default=DEFAULT_RESUMIDO)
    parser.add_argument("--probe", type=Path, default=DEFAULT_PROBE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--history", type=Path, default=DEFAULT_HISTORY)
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr-encoder", type=float, default=1e-5)
    parser.add_argument("--lr-cabeca", type=float, default=1e-3)
    parser.add_argument("--camadas-treinaveis", type=int, default=4, help="Quantas das 12 camadas do encoder treinar.")
    parser.add_argument("--test-size", type=int, default=2000)
    parser.add_argument("--val-size", type=float, default=0.1)
    parser.add_argument("--max-itens", type=int, default=0, help="Limita o treino (0 = tudo). Pra teste rapido.")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", default="auto")
    return parser.parse_args()


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def escolher_device(nome: str) -> torch.device:
    if nome != "auto":
        return torch.device(nome)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def carregar_itens(dataset_dir: Path) -> pd.DataFrame:
    styles = pd.read_csv(dataset_dir / "styles.csv", on_bad_lines="skip")
    styles = styles[styles["articleType"].isin(ARTICLE_TYPE_PARA_CATEGORIA)]
    styles = styles[styles["subCategory"] != "Loungewear and Nightwear"].copy()
    styles["id"] = styles["id"].astype(int).astype(str)
    styles["caminho"] = [str(dataset_dir / "images" / f"{item_id}.jpg") for item_id in styles["id"]]
    styles = styles[[Path(c).exists() for c in styles["caminho"]]]
    styles["rotulo"] = styles["articleType"].map(ARTICLE_TYPE_PARA_CATEGORIA).astype(int) - 1
    return styles[["id", "caminho", "rotulo"]].reset_index(drop=True)


def dividir(itens: pd.DataFrame, resumido: Path, args: argparse.Namespace):
    from sklearn.model_selection import train_test_split

    ids_resumido = set(pd.read_csv(resumido)["id"].astype(int).astype(str))
    fora = itens[~itens["id"].isin(ids_resumido)]
    teste, _ = train_test_split(fora, train_size=args.test_size, random_state=args.seed, stratify=fora["rotulo"])
    resto = itens[~itens["id"].isin(set(teste["id"]))]
    treino, val = train_test_split(resto, test_size=args.val_size, random_state=args.seed, stratify=resto["rotulo"])
    if args.max_itens:
        treino = treino.sample(n=min(args.max_itens, len(treino)), random_state=args.seed)
    return treino.reset_index(drop=True), val.reset_index(drop=True), teste.reset_index(drop=True)


class FotosDataset(Dataset):
    """modo: "treino" (corte + espelho aleatorios), "inteira" ou "corte"
    (corte apertado deterministico por item, pra avaliacao)."""

    def __init__(self, itens: pd.DataFrame, processor: CLIPImageProcessorPil, modo: str, seed: int = 0) -> None:
        self.caminhos = itens["caminho"].tolist()
        self.rotulos = itens["rotulo"].tolist()
        self.processor = processor
        self.modo = modo
        self.seed = seed

    def __len__(self) -> int:
        return len(self.rotulos)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, int]:
        imagem = Image.open(self.caminhos[index]).convert("RGB")
        if self.modo == "treino":
            rng = np.random.default_rng()
            if rng.random() < 0.5:
                imagem = corte_apertado(imagem, rng, escala_min=0.4, escala_max=0.9)
            if rng.random() < 0.5:
                imagem = imagem.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        elif self.modo == "corte":
            imagem = corte_apertado(imagem, np.random.default_rng(self.seed + index))
        pixel_values = self.processor(images=imagem, return_tensors="pt")["pixel_values"][0]
        return pixel_values, self.rotulos[index]


def cabeca_zero_shot() -> torch.Tensor:
    """Embeddings de texto normalizados dos prompts * escala do CLIP (~100)."""
    clip = CLIPModel.from_pretrained(BASE_MODEL)
    tokenizer = CLIPTokenizer.from_pretrained(BASE_MODEL)
    with torch.no_grad():
        inputs = tokenizer(PROMPTS_CATEGORIA, padding=True, return_tensors="pt")
        texto = clip.get_text_features(**inputs)
        if hasattr(texto, "pooler_output"):
            texto = texto.pooler_output
        texto = texto / texto.norm(dim=-1, keepdim=True)
        return texto * clip.logit_scale.exp()


@torch.no_grad()
def prever(prever_lote, loader: DataLoader, device: torch.device) -> tuple[np.ndarray, np.ndarray]:
    preds, rotulos = [], []
    for pixel_values, yb in loader:
        preds.append(prever_lote(pixel_values.to(device)).argmax(dim=1).cpu().numpy())
        rotulos.append(yb.numpy())
    return np.concatenate(preds), np.concatenate(rotulos)


def metricas(preds: np.ndarray, rotulos: np.ndarray) -> dict[str, float]:
    return {
        "acc": float((preds == rotulos).mean()),
        "acc_tipo": float((NIVEL_TIPO[preds] == NIVEL_TIPO[rotulos]).mean()),
    }


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    device = escolher_device(args.device)
    processor = CLIPImageProcessorPil.from_pretrained(BASE_MODEL)

    treino, val, teste = dividir(carregar_itens(args.dataset_dir), args.resumido, args)
    print(f"[finetune-clip] device={device} treino={len(treino)} val={len(val)} teste={len(teste)}")

    def loader(itens: pd.DataFrame, modo: str) -> DataLoader:
        return DataLoader(
            FotosDataset(itens, processor, modo, args.seed),
            batch_size=args.batch_size,
            shuffle=modo == "treino",
            num_workers=args.workers,
            persistent_workers=args.workers > 0,
        )

    treino_loader = loader(treino, "treino")
    val_loader = loader(val, "inteira")

    model = ClipCategoriaNet(BASE_MODEL, NUM_CATEGORIAS)
    with torch.no_grad():
        model.cabeca.weight.copy_(cabeca_zero_shot())
        model.cabeca.bias.zero_()
    model.liberar_camadas(args.camadas_treinaveis)
    model.to(device)

    # peso sqrt(1/frequencia): as classes pequenas (saia, 128 fotos) contam
    # mais sem o salto de 55x do inverso puro contra camiseta (7 mil), que
    # deixava o treino instavel. Regata/casaco nao tem exemplo -> peso 0.
    contagem = np.bincount(treino["rotulo"], minlength=NUM_CATEGORIAS).astype(np.float32)
    pesos = np.where(contagem > 0, 1.0 / np.sqrt(np.maximum(contagem, 1)), 0.0)
    pesos = pesos / pesos[pesos > 0].mean()
    criterion = nn.CrossEntropyLoss(weight=torch.tensor(pesos, dtype=torch.float32, device=device), label_smoothing=0.1)

    params_cabeca = list(model.cabeca.parameters())
    ids_cabeca = {id(p) for p in params_cabeca}
    params_encoder = [p for p in model.parameters() if p.requires_grad and id(p) not in ids_cabeca]
    optimizer = torch.optim.AdamW(
        [
            {"params": params_encoder, "lr": args.lr_encoder},
            {"params": params_cabeca, "lr": args.lr_cabeca},
        ],
        weight_decay=0.05,
    )
    passos_total = args.epochs * len(treino_loader)
    aquecimento = max(1, int(0.05 * passos_total))

    def fator_lr(passo: int) -> float:
        if passo < aquecimento:
            return (passo + 1) / aquecimento
        progresso = (passo - aquecimento) / max(1, passos_total - aquecimento)
        return 0.5 * (1 + math.cos(math.pi * progresso))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, fator_lr)

    print(f"[finetune-clip] parametros treinaveis: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")
    melhor_acc = -1.0
    historico = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        inicio = time.time()
        soma_loss, n_lotes = 0.0, 0
        for passo, (pixel_values, yb) in enumerate(treino_loader, start=1):
            optimizer.zero_grad(set_to_none=True)
            loss = criterion(model(pixel_values.to(device)), yb.to(device))
            loss.backward()
            optimizer.step()
            scheduler.step()
            soma_loss += loss.item()
            n_lotes += 1
            if passo % 50 == 0:
                print(f"  epoch {epoch} passo {passo}/{len(treino_loader)} loss {soma_loss / n_lotes:.4f}", flush=True)

        model.eval()
        resultado = metricas(*prever(model, val_loader, device))
        linha = {"epoch": epoch, "train_loss": soma_loss / max(1, n_lotes), **{f"val_{k}": v for k, v in resultado.items()}}
        historico.append(linha)
        print(f"[finetune-clip] epoch {epoch}: loss {linha['train_loss']:.4f} "
              f"val acc {resultado['acc']:.4f} (tipo {resultado['acc_tipo']:.4f}) "
              f"[{time.time() - inicio:.0f}s]", flush=True)

        if resultado["acc"] > melhor_acc:
            melhor_acc = resultado["acc"]
            args.output.parent.mkdir(parents=True, exist_ok=True)
            torch.save(
                {
                    "base_model": BASE_MODEL,
                    "num_classes": NUM_CATEGORIAS,
                    "camadas_treinaveis": args.camadas_treinaveis,
                    "estado_treinado": model.estado_treinado(),
                    "val_accuracy": resultado["acc"],
                    "epoch": epoch,
                },
                args.output,
            )

    pd.DataFrame(historico).to_csv(args.history, index=False)
    print(f"[finetune-clip] melhor val acc: {melhor_acc:.4f} — salvo em {args.output}")

    # Comparacao no teste: fine-tuned (melhor epoch) x CLIP congelado + MLP atual.
    from model.clip_categoria import load_model

    finetuned, _ = load_model(args.output, device)
    base = CLIPVisionModelWithProjection.from_pretrained(BASE_MODEL).to(device).eval()
    probe, probe_ckpt = load_probe(args.probe, device)
    mean = torch.tensor(probe_ckpt["mean"], dtype=torch.float32, device=device)
    std = torch.tensor(probe_ckpt["std"], dtype=torch.float32, device=device)

    def prever_probe(pixel_values: torch.Tensor) -> torch.Tensor:
        return probe((base(pixel_values=pixel_values).image_embeds - mean) / std)

    print("\n[finetune-clip] teste (fotos fora do treino dos dois modelos):")
    print(f"  {'modo':<8} {'modelo':<12} {'acc':>7} {'acc tipo':>9}")
    for modo in ("inteira", "corte"):
        teste_loader = loader(teste, modo)
        for nome, fn in (("atual", prever_probe), ("fine-tuned", finetuned)):
            resultado = metricas(*prever(fn, teste_loader, device))
            print(f"  {modo:<8} {nome:<12} {resultado['acc']:>7.4f} {resultado['acc_tipo']:>9.4f}")


if __name__ == "__main__":
    main()
