"""Baixa os pesos dos modelos do Hugging Face Hub pra `model/`.

Os `.pt` ficam fora do git (`model/*.pt` no .gitignore). O repositorio do Hub
e privado: faca `hf auth login` (ou defina HF_TOKEN) antes. Numa maquina limpa,
rode antes de subir a API:

    python scripts/baixar_modelos.py

So baixa o que nao existe localmente, pra nao sobrescrever um modelo
retreinado que ainda nao foi enviado. `--atualizar` baixa tudo de novo.

O repositorio vem de MODELOS_REPO (padrao: REPO_PADRAO) e a revisao de
MODELOS_REVISAO (padrao: main). Em producao, fixe a revisao num commit do
Hub pra que um envio novo nao mude o modelo sem um deploy.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

RAIZ = Path(__file__).resolve().parent.parent
PASTA_MODELOS = RAIZ / "model"
REPO_PADRAO = "sofiaomarques/outfit-matcher-modelos"

# Arquivo -> onde e usado.
ARQUIVOS = {
    "match_model_v2.pt": "model/recomendar.py (/looks/recommend)",
    "clip_categoria.pt": "features/categoria.py (/items/analyze)",
    "categoria_model.pt": "fallback de features/categoria.py",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Baixa os pesos dos modelos pra model/.")
    parser.add_argument("--repo", default=os.environ.get("MODELOS_REPO", REPO_PADRAO))
    parser.add_argument("--revisao", default=os.environ.get("MODELOS_REVISAO", "main"))
    parser.add_argument("--atualizar", action="store_true", help="baixa de novo mesmo se o arquivo ja existir")
    parser.add_argument("arquivos", nargs="*", default=list(ARQUIVOS), help="padrao: todos")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    desconhecidos = set(args.arquivos) - set(ARQUIVOS)
    if desconhecidos:
        print(f"Arquivos desconhecidos: {', '.join(sorted(desconhecidos))}", file=sys.stderr)
        return 2

    falhas = 0
    for nome in args.arquivos:
        destino = PASTA_MODELOS / nome
        if destino.exists() and not args.atualizar:
            print(f"{nome}: ja existe, pulando")
            continue
        print(f"{nome}: baixando de {args.repo}@{args.revisao}")
        try:
            hf_hub_download(args.repo, nome, revision=args.revisao, local_dir=PASTA_MODELOS)
        except Exception as erro:
            print(f"{nome}: falhou ({erro})", file=sys.stderr)
            falhas += 1

    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
