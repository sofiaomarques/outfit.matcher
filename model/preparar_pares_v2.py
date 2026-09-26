"""Gera os pares de treino v2 do modelo de compatibilidade.

Diferencas em relacao ao preparar_dados.py:
- cima/baixo vem do articleType do dataset (no app, vem do rotulo do usuario),
  e nao do CLIP; o modelo so precisa aprender se duas pecas combinam;
- so roupas Women/Unisex ocidentais, ate N pecas por articleType;
- todo par e peca de cima + peca de baixo (short e saia contam como baixo);
- positivo = regra de cor/tom/estampa + ocasiao (usage) compativel + sem
  contraste esportivo x elegante (medido pelo CLIP, ver contraste_de_estilo);
- as pecas sao separadas em treino/validacao antes de montar os pares, para a
  validacao medir pares com pecas que o modelo nunca viu.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import pandas as pd

from model.preparar_dados import (
    PreparedItem,
    as_embedding,
    load_cache,
    resolve_embedding_function,
    save_cache,
    weak_compatibility,
)
from model.recomendar import probabilidades_contextos

DEFAULT_DATASET_DIR = Path("dados/fashion-dataset-roupas")
DEFAULT_OUTPUT = Path("dados/pares_outfits_v2.npz")
DEFAULT_CACHE = Path("dados/embeddings_v2.npz")
DEFAULT_CACHE_V1 = Path("dados/embeddings_resumidos.npz")
DEFAULT_STYLES_OUTPUT = Path("dados/styles_v2.csv")

# Substitui a checagem do codigo de formalidade (features/formalidade.py) na
# regra: ele quase sempre sai 0 e o 3 cai em tunica e calca de moletom, o que
# reprovava combinacoes classicas (tunica + legging, camisa + jeans). Conflito
# agora e uma peca esportiva com uma elegante, pelas probabilidades dos
# contextos do recomendador (blazer ~0.90 elegante, moletom ~0.64 esportivo).
LIMIAR_CONTRASTE = 0.4

# articleType -> categoria do app (app/lib/models/clothing_category.dart).
# Short fica em "bottom" (Calcas). Roupa etnica, pijama, vestido e acessorios ficam de fora.
CATEGORIA_APP = {
    "Tshirts": "top",
    "Shirts": "top",
    "Tops": "top",
    "Tunics": "top",
    "Sweatshirts": "top",
    "Sweaters": "top",
    "Jackets": "top",
    "Rain Jacket": "top",
    "Blazers": "top",
    "Shrug": "top",
    "Waistcoat": "top",
    "Jeans": "bottom",
    "Trousers": "bottom",
    "Track Pants": "bottom",
    "Capris": "bottom",
    "Leggings": "bottom",
    "Jeggings": "bottom",
    "Shorts": "bottom",
    "Rain Trousers": "bottom",
    "Skirts": "skirt",
}
CIMA = {"top"}
BAIXO = {"bottom", "skirt"}
GENEROS = {"Women", "Unisex"}

# Casual combina com tudo; Sports nao combina com Formal.
USAGE_COMPATIVEL = {
    "Casual": {"Casual", "Sports", "Formal", "Smart Casual", "Party"},
    "Sports": {"Sports", "Casual"},
    "Formal": {"Formal", "Casual", "Smart Casual", "Party"},
    "Smart Casual": {"Smart Casual", "Casual", "Formal", "Party"},
    "Party": {"Party", "Casual", "Formal", "Smart Casual"},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gera pares cima+baixo v2 para treino.")
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--cache-v1", type=Path, default=DEFAULT_CACHE_V1)
    parser.add_argument("--styles-output", type=Path, default=DEFAULT_STYLES_OUTPUT)
    parser.add_argument("--items-per-article-type", type=int, default=300)
    parser.add_argument("--train-pairs", type=int, default=16000)
    parser.add_argument("--val-pairs", type=int, default=4000)
    parser.add_argument("--val-items", type=float, default=0.2)
    parser.add_argument("--positive-ratio", type=float, default=0.5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--embedding-function",
        default="features.embedding_neural.gerar_embedding_completo",
    )
    return parser.parse_args()


def load_styles(dataset_dir: Path) -> pd.DataFrame:
    styles = pd.read_csv(dataset_dir / "styles.csv", on_bad_lines="skip")
    styles = styles.dropna(subset=["id"]).copy()
    styles["id"] = styles["id"].astype(int)
    styles = styles[styles["gender"].isin(GENEROS)]
    styles = styles[styles["articleType"].isin(CATEGORIA_APP)]
    styles = styles[~styles["usage"].eq("Ethnic")].copy()
    styles["usage"] = styles["usage"].fillna("Casual")
    styles["categoria"] = styles["articleType"].map(CATEGORIA_APP)
    styles["image_path"] = styles["id"].map(lambda i: str(dataset_dir / "images" / f"{i}.jpg"))
    styles = styles[styles["image_path"].map(lambda p: Path(p).exists())]
    return styles.drop_duplicates(subset=["id"]).reset_index(drop=True)


def sample_styles(styles: pd.DataFrame, per_type: int, cached_ids: set[str], seed: int) -> pd.DataFrame:
    """Ate per_type pecas por articleType, priorizando as que ja tem embedding."""
    parts = []
    for _, group in styles.groupby("articleType", sort=True):
        group = group.sample(frac=1.0, random_state=seed)
        ja_calculado = group["id"].astype(str).isin(cached_ids)
        group = pd.concat([group[ja_calculado], group[~ja_calculado]])
        parts.append(group.head(per_type))
    return pd.concat(parts, ignore_index=True)


def build_embeddings(styles: pd.DataFrame, embedding_fn, cache_path: Path, cache_v1: Path) -> dict[str, np.ndarray]:
    known = {**load_cache(cache_v1), **load_cache(cache_path)}
    embeddings: dict[str, np.ndarray] = {}
    faltando = [row for _, row in styles.iterrows() if str(row["id"]) not in known]
    print(f"[v2] embeddings reaproveitados: {len(styles) - len(faltando)}, a calcular: {len(faltando)}")

    for _, row in styles.iterrows():
        item_id = str(row["id"])
        if item_id in known:
            embeddings[item_id] = known[item_id]

    for index, row in enumerate(faltando, start=1):
        item_id = str(row["id"])
        try:
            embeddings[item_id] = as_embedding(embedding_fn(row["image_path"]))
        except Exception as exc:
            print(f"[aviso] pulando {item_id}: {exc}")
        if index % 50 == 0:
            save_cache(cache_path, embeddings)
            print(f"[v2] embeddings novos: {index}/{len(faltando)}", flush=True)

    save_cache(cache_path, embeddings)
    return embeddings


def usage_compativel(a: str, b: str) -> bool:
    return b in USAGE_COMPATIVEL.get(a, {a, "Casual"})


def estilo_clip(embeddings: dict[str, np.ndarray]) -> dict[str, tuple[float, float]]:
    """(elegante, esportivo) de cada peca: P(trabalho) + P(festa) e P(esporte)."""
    ids = list(embeddings)
    probs = probabilidades_contextos(np.stack([embeddings[i] for i in ids]))
    elegante = probs["trabalho"] + probs["festa"]
    return {i: (float(elegante[n]), float(probs["esporte"][n])) for n, i in enumerate(ids)}


def contraste_de_estilo(estilo_a: tuple[float, float], estilo_b: tuple[float, float]) -> bool:
    (elegante_a, esportivo_a), (elegante_b, esportivo_b) = estilo_a, estilo_b
    return (esportivo_a >= LIMIAR_CONTRASTE and elegante_b >= LIMIAR_CONTRASTE) or (
        esportivo_b >= LIMIAR_CONTRASTE and elegante_a >= LIMIAR_CONTRASTE
    )


def combina(
    top: pd.Series,
    baixo: pd.Series,
    embeddings: dict[str, np.ndarray],
    estilos: dict[str, tuple[float, float]],
) -> bool:
    id_top, id_baixo = str(top["id"]), str(baixo["id"])
    if not usage_compativel(top["usage"], baixo["usage"]):
        return False
    if contraste_de_estilo(estilos[id_top], estilos[id_baixo]):
        return False
    a = PreparedItem(id_top, "", top["articleType"], 3, embeddings[id_top])
    b = PreparedItem(id_baixo, "", baixo["articleType"], 1, embeddings[id_baixo])
    return weak_compatibility(a, b, checar_formalidade=False)


def generate_pairs(
    tops: pd.DataFrame,
    baixos: pd.DataFrame,
    embeddings: dict[str, np.ndarray],
    estilos: dict[str, tuple[float, float]],
    n_pairs: int,
    positive_ratio: float,
    rng: random.Random,
) -> list[tuple[str, str, int]]:
    target_pos = int(n_pairs * positive_ratio)
    target_neg = n_pairs - target_pos
    top_rows = [row for _, row in tops.iterrows()]
    baixo_rows = [row for _, row in baixos.iterrows()]
    positives: list[tuple[str, str, int]] = []
    negatives: list[tuple[str, str, int]] = []
    seen: set[tuple[str, str]] = set()
    max_combinacoes = len(top_rows) * len(baixo_rows)

    while (len(positives) < target_pos or len(negatives) < target_neg) and len(seen) < max_combinacoes:
        top, baixo = rng.choice(top_rows), rng.choice(baixo_rows)
        key = (str(top["id"]), str(baixo["id"]))
        if key in seen:
            continue
        seen.add(key)
        if combina(top, baixo, embeddings, estilos):
            if len(positives) < target_pos:
                positives.append((*key, 1))
        elif len(negatives) < target_neg:
            negatives.append((*key, 0))

    if len(positives) < target_pos or len(negatives) < target_neg:
        print(f"[aviso] so consegui {len(positives)} positivos e {len(negatives)} negativos")
    pairs = positives + negatives
    rng.shuffle(pairs)
    return pairs


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)

    styles = load_styles(args.dataset_dir)
    cached_ids = set(load_cache(args.cache_v1)) | set(load_cache(args.cache))
    styles = sample_styles(styles, args.items_per_article_type, cached_ids, args.seed)
    print(f"[v2] pecas selecionadas: {len(styles)}")
    print(styles["categoria"].value_counts().to_string())

    embedding_fn = resolve_embedding_function(args.embedding_function)
    embeddings = build_embeddings(styles, embedding_fn, args.cache, args.cache_v1)
    styles = styles[styles["id"].astype(str).isin(embeddings)].copy()
    estilos = estilo_clip(embeddings)

    # Separa pecas (nao pares) entre treino e validacao, estratificado por articleType.
    val_ids: set[int] = set()
    for _, group in styles.groupby("articleType"):
        n_val = int(round(len(group) * args.val_items))
        val_ids.update(group.sample(n=n_val, random_state=args.seed)["id"])
    styles["split"] = np.where(styles["id"].isin(val_ids), "val", "treino")
    args.styles_output.parent.mkdir(parents=True, exist_ok=True)
    styles.to_csv(args.styles_output, index=False)

    all_pairs: list[tuple[str, str, int]] = []
    splits: list[str] = []
    for split, n_pairs in (("treino", args.train_pairs), ("val", args.val_pairs)):
        parte = styles[styles["split"] == split]
        tops = parte[parte["categoria"].isin(CIMA)]
        baixos = parte[parte["categoria"].isin(BAIXO)]
        pairs = generate_pairs(tops, baixos, embeddings, estilos, n_pairs, args.positive_ratio, rng)
        print(f"[v2] {split}: {len(tops)} tops x {len(baixos)} baixos -> {len(pairs)} pares")
        all_pairs.extend(pairs)
        splits.extend([split] * len(pairs))

    ids_a = np.asarray([a for a, _, _ in all_pairs], dtype=str)
    ids_b = np.asarray([b for _, b, _ in all_pairs], dtype=str)
    metadata = {
        "versao": 2,
        "items_per_article_type": args.items_per_article_type,
        "generos": sorted(GENEROS),
        "positive_ratio": args.positive_ratio,
        "val_items": args.val_items,
        "limiar_contraste": LIMIAR_CONTRASTE,
        "seed": args.seed,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.output,
        emb_a=np.stack([embeddings[i] for i in ids_a]).astype(np.float32),
        emb_b=np.stack([embeddings[i] for i in ids_b]).astype(np.float32),
        y=np.asarray([label for _, _, label in all_pairs], dtype=np.float32),
        ids_a=ids_a,
        ids_b=ids_b,
        split=np.asarray(splits, dtype=str),
        metadata=json.dumps(metadata),
    )
    print(f"[v2] pares salvos em {args.output}")


if __name__ == "__main__":
    main()
