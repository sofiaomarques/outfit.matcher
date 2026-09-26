"""Compara os classificadores de categoria em fotos reais rotuladas a mao.

As fotos do Kaggle (usadas no treino) sao de catalogo, 60x80 px. Este script
mede o que importa pro app: fotos de celular, vestidas e cortadas. Organize
uma pasta com uma subpasta por categoria (nome igual ao de
`features/categoria.py`, com ou sem acento):

    dados/validacao_real/
        calça/  short/  saia/  vestido/  top/  camiseta/
        regata/  jaqueta/  casaco/  blusa de manga/

e rode:

    PYTHONPATH=. python3 model/avaliar_categoria_real.py
"""

from __future__ import annotations

import argparse
import unicodedata
from pathlib import Path

from PIL import Image, ImageOps

from features.categoria import (
    _MODELO_CATEGORIA,
    _MODELO_CLIP_AJUSTADO,
    _classificar_com_clip_ajustado,
    _classificar_com_modelo,
    _classificar_zero_shot,
    categoria_map,
)

DEFAULT_PASTA = Path("dados/validacao_real")
EXTENSOES = {".jpg", ".jpeg", ".png", ".webp"}

# categoria -> baixo/unico/cima, o nivel que decide os pares de outfit.
NIVEL_TIPO = {1: "baixo", 2: "baixo", 3: "baixo", 4: "unico"}


def sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode().lower().strip()


CATEGORIA_POR_PASTA = {sem_acento(nome): codigo for nome, codigo in categoria_map.items()}


def _nome(codigo: int) -> str:
    return next(nome for nome, c in categoria_map.items() if c == codigo)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Avalia os classificadores de categoria em fotos reais.")
    parser.add_argument("--pasta", type=Path, default=DEFAULT_PASTA)
    return parser.parse_args()


def carregar_fotos(pasta: Path) -> list[tuple[Path, int]]:
    fotos = []
    for subpasta in sorted(p for p in pasta.iterdir() if p.is_dir()):
        codigo = CATEGORIA_POR_PASTA.get(sem_acento(subpasta.name))
        if codigo is None:
            print(f"[aviso] pasta ignorada, categoria desconhecida: {subpasta.name}")
            continue
        fotos.extend((f, codigo) for f in sorted(subpasta.iterdir()) if f.suffix.lower() in EXTENSOES)
    return fotos


def main() -> None:
    args = parse_args()
    fotos = carregar_fotos(args.pasta)
    if not fotos:
        raise SystemExit(f"Nenhuma foto em {args.pasta}/<categoria>/")

    classificadores = {"zero-shot": _classificar_zero_shot}
    if _MODELO_CATEGORIA.exists():
        classificadores["atual"] = _classificar_com_modelo
    if _MODELO_CLIP_AJUSTADO.exists():
        classificadores["fine-tuned"] = _classificar_com_clip_ajustado

    acertos = {nome: 0 for nome in classificadores}
    acertos_tipo = {nome: 0 for nome in classificadores}
    print(f"{'foto':<40} {'rotulo':<15} " + " ".join(f"{n:<15}" for n in classificadores))
    for caminho, codigo in fotos:
        # exif_transpose: foto de celular vem deitada sem isso.
        imagem = ImageOps.exif_transpose(Image.open(caminho)).convert("RGB")
        colunas = []
        for nome, classificar in classificadores.items():
            previsto = classificar(imagem)["codigo"]
            acertos[nome] += previsto == codigo
            acertos_tipo[nome] += NIVEL_TIPO.get(previsto, "cima") == NIVEL_TIPO.get(codigo, "cima")
            marca = "ok" if previsto == codigo else "x "
            colunas.append(f"{marca} {_nome(previsto):<12}")
        rotulo = _nome(codigo)
        print(f"{caminho.parent.name + '/' + caminho.name:<40.40} {rotulo:<15} " + " ".join(colunas))

    n = len(fotos)
    print(f"\n{n} fotos")
    print(f"{'modelo':<12} {'acc':>6} {'acc tipo':>9}")
    for nome in classificadores:
        print(f"{nome:<12} {acertos[nome] / n:>6.1%} {acertos_tipo[nome] / n:>9.1%}")


if __name__ == "__main__":
    main()
