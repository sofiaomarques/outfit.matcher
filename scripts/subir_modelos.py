"""Envia os pesos de `model/` pro Hugging Face Hub depois de um retreino.

Precisa de login com permissao de escrita (`hf auth login`). Cria o
repositorio (publico) se ainda nao existir. Cada envio vira um commit no Hub;
o hash dele pode ser usado em MODELOS_REVISAO pra fixar a versao em producao.

    python scripts/subir_modelos.py match_model_v2.pt -m "Retreino com pares v2"
"""

from __future__ import annotations

import argparse
import os
import sys

from huggingface_hub import CommitOperationAdd, HfApi

from baixar_modelos import ARQUIVOS, PASTA_MODELOS, REPO_PADRAO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Envia os pesos de model/ pro Hugging Face Hub.")
    parser.add_argument("--repo", default=os.environ.get("MODELOS_REPO", REPO_PADRAO))
    parser.add_argument("-m", "--mensagem", default="Atualiza pesos dos modelos")
    parser.add_argument("arquivos", nargs="*", default=list(ARQUIVOS), help="padrao: todos")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    desconhecidos = set(args.arquivos) - set(ARQUIVOS)
    if desconhecidos:
        print(f"Arquivos desconhecidos: {', '.join(sorted(desconhecidos))}", file=sys.stderr)
        return 2
    faltando = [nome for nome in args.arquivos if not (PASTA_MODELOS / nome).exists()]
    if faltando:
        print(f"Nao existem em model/: {', '.join(faltando)}", file=sys.stderr)
        return 1

    api = HfApi()
    api.create_repo(args.repo, repo_type="model", private=False, exist_ok=True)
    # Um commit so pra todos os arquivos: nunca fica um modelo novo com outro velho no Hub.
    operacoes = [
        CommitOperationAdd(path_in_repo=nome, path_or_fileobj=PASTA_MODELOS / nome)
        for nome in args.arquivos
    ]
    commit = api.create_commit(args.repo, operacoes, commit_message=args.mensagem)
    print(f"Enviado: {commit.commit_url}")
    print(f"Revisao: {commit.oid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
