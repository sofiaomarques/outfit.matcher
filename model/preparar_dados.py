from __future__ import annotations

import argparse
import importlib
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
import numpy as np
import pandas as pd


DEFAULT_DATASET_DIR = Path("dados/fashion-dataset")
DEFAULT_OUTPUT = Path("dados/pares_outfits.npz")
DEFAULT_CACHE = Path("dados/embeddings_resumidos.npz")
DEFAULT_STYLES_OUTPUT = Path("dados/styles_resumido.csv")
EXPECTED_EMBEDDING_DIM = 523

# subCategory do styles.csv que nao representam roupa "de fora" (top/bottom/vestido)
# e por isso nao devem virar pares de outfit: roupa intima acaba classificada pelo
# CLIP como se fosse blusa/calca e gera pares sem sentido (ex.: sutia + cueca).
SUBCATEGORIAS_EXCLUIDAS = {"Innerwear"}


@dataclass(frozen=True)
class PreparedItem:
    item_id: str
    image_path: str
    article_type: str
    tipo: int
    embedding: np.ndarray


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Filtra roupas, cria pares e salva embeddings para treino."
    )
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET_DIR)
    parser.add_argument("--styles-csv", type=Path, default=None)
    parser.add_argument("--images-dir", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--styles-resumido", type=Path, default=DEFAULT_STYLES_OUTPUT)
    parser.add_argument("--max-items", type=int, default=2000)
    parser.add_argument("--items-per-article-type", type=int, default=100)
    parser.add_argument("--max-pairs", type=int, default=12000)
    parser.add_argument("--positive-ratio", type=float, default=0.5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--delete-non-clothing-images",
        action="store_true",
        help="Apaga imagens fora de masterCategory=Apparel.",
    )
    parser.add_argument(
        "--delete-images-not-sampled",
        action="store_true",
        help="Apaga tambem roupas que ficaram fora da amostra selecionada.",
    )
    parser.add_argument(
        "--no-weak-style-labels",
        action="store_true",
        help="Aceita qualquer par cima+baixo como positivo.",
    )
    parser.add_argument(
        "--embedding-function",
        default="features.embedding_neural.gerar_embedding_completo",
        help="Funcao no formato modulo.funcao.",
    )
    return parser.parse_args()


def image_path_for_id(images_dir: Path, item_id: Any) -> Path:
    return Path(images_dir) / f"{int(item_id)}.jpg"


def load_apparel(styles_csv: Path, images_dir: Path) -> pd.DataFrame:
    styles = pd.read_csv(styles_csv, on_bad_lines="skip")
    required = {"id", "masterCategory", "articleType"}
    missing = required.difference(styles.columns)
    if missing:
        raise ValueError(f"Colunas ausentes em styles.csv: {sorted(missing)}")

    styles = styles.dropna(subset=["id"]).copy()
    styles["id"] = styles["id"].astype(int)
    styles = styles[styles["masterCategory"].eq("Apparel")].copy()
    if "subCategory" in styles.columns:
        styles = styles[~styles["subCategory"].isin(SUBCATEGORIAS_EXCLUIDAS)].copy()
    styles["image_path"] = styles["id"].map(
        lambda item_id: str(image_path_for_id(images_dir, item_id))
    )
    styles = styles[styles["image_path"].map(lambda path: Path(path).exists())].copy()
    styles["articleType"] = styles["articleType"].fillna("Unknown").astype(str)
    return styles.drop_duplicates(subset=["id"]).reset_index(drop=True)


def sample_styles(
    styles: pd.DataFrame,
    *,
    max_items: int,
    items_per_article_type: int,
    seed: int,
) -> pd.DataFrame:
    parts: list[pd.DataFrame] = []
    for _, group in styles.groupby("articleType", sort=True):
        count = min(len(group), items_per_article_type)
        parts.append(group.sample(n=count, random_state=seed))

    if not parts:
        raise ValueError("Nenhuma roupa valida foi encontrada.")

    sampled = pd.concat(parts, ignore_index=True)
    if len(sampled) > max_items:
        sampled = sampled.sample(n=max_items, random_state=seed)
    return sampled.sample(frac=1.0, random_state=seed).reset_index(drop=True)


def delete_unused_images(images_dir: Path, kept_ids: set[str], description: str) -> int:
    image_paths = [
        path
        for path in images_dir.iterdir()
        if path.is_file() and path.suffix.lower() in {".jpg", ".jpeg", ".png"}
    ]
    to_delete = [path for path in image_paths if path.stem not in kept_ids]
    for path in to_delete:
        path.unlink()
    print(f"[prep] {description}: {len(to_delete)} imagens removidas")
    return len(to_delete)


def resolve_embedding_function(path: str) -> Callable[[str], Any]:
    module_name, function_name = path.rsplit(".", 1)
    function = getattr(importlib.import_module(module_name), function_name)
    if not callable(function):
        raise TypeError(f"{path} nao e uma funcao.")
    return function


def as_embedding(result: Any) -> np.ndarray:
    if isinstance(result, dict):
        result = result.get("embedding", result.get("features"))
    if isinstance(result, tuple):
        result = result[0]
    if hasattr(result, "detach"):
        result = result.detach().cpu().numpy()

    embedding = np.asarray(result, dtype=np.float32).reshape(-1)
    if embedding.size != EXPECTED_EMBEDDING_DIM:
        raise ValueError(
            f"Embedding com tamanho {embedding.size}; esperado {EXPECTED_EMBEDDING_DIM}."
        )
    if not np.isfinite(embedding).all():
        raise ValueError("Embedding contem NaN ou infinito.")
    return embedding


def load_cache(cache_path: Path) -> dict[str, np.ndarray]:
    if not cache_path.exists():
        return {}
    data = np.load(cache_path, allow_pickle=False)
    ids = data["ids"].astype(str)
    embeddings = data["embeddings"].astype(np.float32)
    if embeddings.ndim != 2 or embeddings.shape[1] != EXPECTED_EMBEDDING_DIM:
        return {}
    return {item_id: embeddings[index] for index, item_id in enumerate(ids)}


def save_cache(cache_path: Path, embeddings_by_id: dict[str, np.ndarray]) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    ids = np.asarray(list(embeddings_by_id), dtype=str)
    embeddings = np.stack(list(embeddings_by_id.values())).astype(np.float32)
    np.savez_compressed(cache_path, ids=ids, embeddings=embeddings)


def build_items(
    styles: pd.DataFrame,
    embedding_fn: Callable[[str], Any],
    cache_path: Path,
) -> list[PreparedItem]:
    cached = load_cache(cache_path)
    embeddings_by_id = dict(cached)
    items: list[PreparedItem] = []

    for index, row in styles.iterrows():
        item_id = str(int(row["id"]))
        image_path = str(row["image_path"])
        try:
            embedding = embeddings_by_id.get(item_id)
            if embedding is None:
                embedding = as_embedding(embedding_fn(image_path))
                embeddings_by_id[item_id] = embedding

            # O oitavo indice guarda codigo_tipo normalizado: 1=baixo, 2=unico, 3=cima.
            tipo = int(round(float(embedding[8]) * 3))
            if tipo not in {1, 2, 3}:
                continue
            items.append(
                PreparedItem(
                    item_id=item_id,
                    image_path=image_path,
                    article_type=str(row["articleType"]),
                    tipo=tipo,
                    embedding=embedding,
                )
            )
        except Exception as exc:
            print(f"[aviso] pulando {item_id}: {exc}")

        if (index + 1) % 50 == 0:
            if embeddings_by_id:
                save_cache(cache_path, embeddings_by_id)
            print(f"[prep] embeddings: {index + 1}/{len(styles)}")

    if embeddings_by_id:
        save_cache(cache_path, embeddings_by_id)
    return items


def saturation(rgb: np.ndarray) -> float:
    high = float(np.max(rgb))
    low = float(np.min(rgb))
    return 0.0 if high <= 1e-6 else (high - low) / high


def weak_compatibility(a: PreparedItem, b: PreparedItem, checar_formalidade: bool = True) -> bool:
    fa = a.embedding[:11]
    fb = b.embedding[:11]
    color_distance = float(np.linalg.norm(fa[:3] - fb[:3]))
    tone_diff = abs(float(fa[6] - fb[6]))
    print_sum = float(fa[9] + fb[9])
    formality_diff = abs(float(fa[10] - fb[10]))
    neutral = saturation(fa[:3]) < 0.18 or saturation(fb[:3]) < 0.18
    color_ok = neutral or 0.12 <= color_distance <= 0.82
    formality_ok = not checar_formalidade or formality_diff <= 0.38
    return color_ok and tone_diff <= 0.60 and print_sum <= 1.35 and formality_ok


def generate_pairs(
    items: list[PreparedItem],
    *,
    max_pairs: int,
    positive_ratio: float,
    use_style_rules: bool,
    seed: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    rng = random.Random(seed)
    tops = [item for item in items if item.tipo == 3]
    bottoms = [item for item in items if item.tipo == 1]
    same_type = {
        tipo: [item for item in items if item.tipo == tipo]
        for tipo in (1, 3)
    }
    if not tops or not bottoms:
        raise ValueError("Nao encontrei pecas suficientes de cima e de baixo.")

    target_pos = max(1, int(max_pairs * positive_ratio))
    target_neg = max(1, max_pairs - target_pos)
    positives: list[tuple[PreparedItem, PreparedItem, int]] = []
    negatives: list[tuple[PreparedItem, PreparedItem, int]] = []
    seen: set[tuple[str, str, int]] = set()
    max_attempts = max_pairs * 100

    attempts = 0
    while len(positives) < target_pos and attempts < max_attempts:
        attempts += 1
        a, b = rng.choice(tops), rng.choice(bottoms)
        key = (a.item_id, b.item_id, 1)
        if key in seen:
            continue
        if use_style_rules and not weak_compatibility(a, b):
            continue
        positives.append((a, b, 1))
        seen.add(key)

    if len(positives) < target_pos and use_style_rules:
        print("[aviso] regras de estilo produziram poucos positivos; completando por tipo")
        while len(positives) < target_pos and attempts < max_attempts * 2:
            attempts += 1
            a, b = rng.choice(tops), rng.choice(bottoms)
            key = (a.item_id, b.item_id, 1)
            if key not in seen:
                positives.append((a, b, 1))
                seen.add(key)

    attempts = 0
    while len(negatives) < target_neg and attempts < max_attempts:
        attempts += 1
        use_hard = use_style_rules and rng.random() < 0.6
        if use_hard:
            a, b = rng.choice(tops), rng.choice(bottoms)
            if use_style_rules and weak_compatibility(a, b):
                continue
        else:
            candidates = [group for group in same_type.values() if len(group) >= 2]
            if not candidates:
                continue
            group = rng.choice(candidates)
            a, b = rng.sample(group, 2)

        key = (a.item_id, b.item_id, 0)
        if key in seen:
            continue
        negatives.append((a, b, 0))
        seen.add(key)

    pairs = positives + negatives
    if not positives or not negatives:
        raise ValueError(f"Pares insuficientes: {len(positives)} positivos e {len(negatives)} negativos.")
    rng.shuffle(pairs)
    labels = np.asarray([label for _, _, label in pairs], dtype=np.float32)
    print(f"[prep] pares: {len(pairs)} total, {int(labels.sum())} positivos, {int((labels == 0).sum())} negativos")
    return (
        np.stack([a.embedding for a, _, _ in pairs]).astype(np.float32),
        np.stack([b.embedding for _, b, _ in pairs]).astype(np.float32),
        labels,
        np.asarray([a.item_id for a, _, _ in pairs], dtype=str),
        np.asarray([b.item_id for _, b, _ in pairs], dtype=str),
    )


def save_pairs(
    output_path: Path,
    emb_a: np.ndarray,
    emb_b: np.ndarray,
    labels: np.ndarray,
    ids_a: np.ndarray,
    ids_b: np.ndarray,
    args: argparse.Namespace,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata = {
        "input_dim": int(emb_a.shape[1]),
        "max_items": args.max_items,
        "items_per_article_type": args.items_per_article_type,
        "max_pairs": args.max_pairs,
        "positive_ratio": args.positive_ratio,
        "style_rules": not args.no_weak_style_labels,
        "seed": args.seed,
    }
    np.savez_compressed(
        output_path,
        emb_a=emb_a,
        emb_b=emb_b,
        y=labels,
        ids_a=ids_a,
        ids_b=ids_b,
        metadata=json.dumps(metadata),
    )


def main() -> None:
    args = parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)
    styles_csv = args.styles_csv or args.dataset_dir / "styles.csv"
    images_dir = args.images_dir or args.dataset_dir / "images"

    if not styles_csv.exists():
        raise FileNotFoundError(f"styles.csv nao encontrado: {styles_csv}")
    if not images_dir.exists():
        raise FileNotFoundError(f"Pasta de imagens nao encontrada: {images_dir}")

    print("[prep] lendo somente masterCategory=Apparel")
    styles = load_apparel(styles_csv, images_dir)
    print(f"[prep] roupas validas antes da amostra: {len(styles)}")

    if args.delete_non_clothing_images:
        apparel_ids = {str(int(item_id)) for item_id in styles["id"]}
        delete_unused_images(images_dir, apparel_ids, "itens que nao sao roupas")

    styles_sampled = sample_styles(
        styles,
        max_items=args.max_items,
        items_per_article_type=args.items_per_article_type,
        seed=args.seed,
    )
    args.styles_resumido.parent.mkdir(parents=True, exist_ok=True)
    styles_sampled.to_csv(args.styles_resumido, index=False)
    print(f"[prep] amostra salva: {args.styles_resumido} ({len(styles_sampled)} itens)")

    if args.delete_images_not_sampled:
        sampled_ids = {str(int(item_id)) for item_id in styles_sampled["id"]}
        delete_unused_images(images_dir, sampled_ids, "itens fora da amostra")

    embedding_fn = resolve_embedding_function(args.embedding_function)
    items = build_items(styles_sampled, embedding_fn, args.cache)
    print(f"[prep] embeddings validos: {len(items)}")
    emb_a, emb_b, labels, ids_a, ids_b = generate_pairs(
        items,
        max_pairs=args.max_pairs,
        positive_ratio=args.positive_ratio,
        use_style_rules=not args.no_weak_style_labels,
        seed=args.seed,
    )
    save_pairs(args.output, emb_a, emb_b, labels, ids_a, ids_b, args)
    print(f"[prep] pares salvos em: {args.output}")


if __name__ == "__main__":
    main()
