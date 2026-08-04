from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import pandas as pd


DEFAULT_SOURCE = Path("dados/fashion-dataset")
DEFAULT_OUTPUT = Path("dados/fashion-dataset-roupas")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cria uma copia do Fashion Dataset contendo somente roupas."
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--max-items",
        type=int,
        default=None,
        help="Opcional: limita a quantidade de roupas copiadas.",
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Apenas mostra as quantidades, sem copiar arquivos.",
    )
    return parser.parse_args()


def load_clean_styles(source_dir: Path) -> pd.DataFrame:
    styles_path = source_dir / "styles.csv"
    images_dir = source_dir / "images"
    if not styles_path.exists():
        raise FileNotFoundError(f"styles.csv nao encontrado: {styles_path}")
    if not images_dir.exists():
        raise FileNotFoundError(f"Pasta de imagens nao encontrada: {images_dir}")

    styles = pd.read_csv(styles_path, on_bad_lines="skip")
    required = {"id", "masterCategory", "articleType"}
    missing = required.difference(styles.columns)
    if missing:
        raise ValueError(f"Colunas ausentes em styles.csv: {sorted(missing)}")

    styles = styles.dropna(subset=["id"]).copy()
    styles["id"] = styles["id"].astype(int)
    styles = styles[styles["masterCategory"].eq("Apparel")].copy()
    styles["image_path"] = styles["id"].map(
        lambda item_id: str(images_dir / f"{int(item_id)}.jpg")
    )
    styles = styles[styles["image_path"].map(lambda value: Path(value).exists())]
    return styles.drop_duplicates(subset=["id"]).reset_index(drop=True)


def main() -> None:
    args = parse_args()
    source_dir = args.source_dir
    output_dir = args.output_dir
    styles = load_clean_styles(source_dir)

    if args.max_items is not None:
        if args.max_items <= 0:
            raise ValueError("--max-items precisa ser maior que zero.")
        styles = styles.sample(
            n=min(args.max_items, len(styles)),
            random_state=args.seed,
        ).reset_index(drop=True)

    print(f"[limpeza] roupas validas: {len(styles)}")
    print(f"[limpeza] pasta de saida: {output_dir}")
    if args.dry_run:
        print("[limpeza] dry-run: nenhum arquivo foi copiado")
        return

    output_images = output_dir / "images"
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(
            f"A pasta de saida ja existe e nao esta vazia: {output_dir}. "
            "Escolha outro --output-dir para evitar sobrescrever dados."
        )

    output_images.mkdir(parents=True, exist_ok=True)
    output_styles = styles.drop(columns=["image_path"])
    output_styles.to_csv(output_dir / "styles.csv", index=False)

    for index, item_id in enumerate(styles["id"], start=1):
        source_image = source_dir / "images" / f"{int(item_id)}.jpg"
        shutil.copy2(source_image, output_images / source_image.name)
        if index % 500 == 0:
            print(f"[limpeza] imagens copiadas: {index}/{len(styles)}")

    print(f"[limpeza] concluida: {len(styles)} imagens em {output_images}")


if __name__ == "__main__":
    main()
