from __future__ import annotations

import argparse
from pathlib import Path

from model.gerar_outfit import gerar_looks
from model.recomendar import CLIMAS, OCASIOES
from model.treinar import DEFAULT_OUTPUT

DEFAULT_PECAS = [
    "dados/roupas/images.jpg",
    "dados/roupas/images1.jpg",
    "dados/roupas/saia.jpg",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gera sugestoes de look a partir de fotos de roupas (sem calcados)."
    )
    parser.add_argument("pecas", nargs="*", default=DEFAULT_PECAS, help="Caminhos das fotos das pecas.")
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--ocasiao", choices=sorted(OCASIOES))
    parser.add_argument("--clima", choices=sorted(CLIMAS))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    looks = gerar_looks(
        args.pecas,
        checkpoint_path=args.checkpoint,
        top_k=args.top_k,
        ocasiao=args.ocasiao,
        clima=args.clima,
    )

    if not looks:
        print("Nenhum look possivel com as pecas fornecidas.")
        return

    usando_modelo = args.checkpoint.exists()
    origem = "modelo treinado" if usando_modelo else "regras (modelo ainda nao treinado)"
    print(f"[main] pontuacao calculada com: {origem}\n")

    for posicao, look in enumerate(looks, start=1):
        pecas = " + ".join(Path(caminho).name for caminho in look["pecas"])
        print(f"{posicao}. {pecas}  (score={look['score']:.3f})")


if __name__ == "__main__":
    main()
