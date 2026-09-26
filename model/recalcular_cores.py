"""Recalcula so a parte de cor (indices 0-6) dos embeddings em cache depois de
uma mudanca em features/cores.py, sem rodar o CLIP de novo — os indices 7-522
nao dependem da extracao de cor.

Resumivel: o progresso fica em --progresso e uma nova execucao pula o que ja
foi calculado. So no fim os caches sao reescritos (com backup do original em
<cache>.antes_cores.npz).

    PYTHONPATH=. python3 model/recalcular_cores.py --processos 5

Depois, regere os pares (preparar_dados.py / preparar_pares_v2.py) e retreine:
as regras que rotulam os pares tambem usam a cor.
"""

from __future__ import annotations

import argparse
import os
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

DEFAULT_CACHES = [Path("dados/embeddings_resumidos.npz"), Path("dados/embeddings_v2.npz")]
DEFAULT_IMAGES_DIR = Path("dados/fashion-dataset-roupas/images")
DEFAULT_PROGRESSO = Path("dados/cores_recalculadas.npz")
N_CORES = 7


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Recalcula as cores dos embeddings em cache.")
    parser.add_argument("--caches", type=Path, nargs="+", default=DEFAULT_CACHES)
    parser.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES_DIR)
    parser.add_argument("--progresso", type=Path, default=DEFAULT_PROGRESSO)
    parser.add_argument("--processos", type=int, default=5)
    parser.add_argument("--threads-por-processo", type=int, default=2)
    parser.add_argument(
        "--limite",
        type=int,
        default=None,
        help="Calcula so N pecas e nao reescreve os caches (pra medir o tempo).",
    )
    return parser.parse_args()


def _calcular(tarefa: tuple[str, str]) -> tuple[str, list[float] | None, str | None]:
    # Import aqui dentro: cada processo so carrega a segmentacao, nao o CLIP.
    from features.cores import extrair_cores, vetor_cores

    item_id, caminho = tarefa
    try:
        return item_id, vetor_cores(extrair_cores(caminho)), None
    except Exception as exc:
        return item_id, None, str(exc)


def _carregar_progresso(path: Path) -> dict[str, np.ndarray]:
    if not path.exists():
        return {}
    data = np.load(path, allow_pickle=False)
    return dict(zip(data["ids"].astype(str), data["cores"].astype(np.float32)))


def _salvar_progresso(path: Path, cores: dict[str, np.ndarray]) -> None:
    np.savez_compressed(
        path,
        ids=np.asarray(list(cores), dtype=str),
        cores=np.stack(list(cores.values())).astype(np.float32),
    )


def main() -> None:
    from model.preparar_dados import load_cache, save_cache

    args = parse_args()
    caches = {path: load_cache(path) for path in args.caches}
    ids = sorted(set().union(*caches.values()))
    cores = _carregar_progresso(args.progresso)
    pendentes = [i for i in ids if i not in cores]
    print(f"[cores] {len(ids)} pecas nos caches, {len(ids) - len(pendentes)} ja calculadas, {len(pendentes)} a calcular")
    if args.limite is not None:
        pendentes = pendentes[: args.limite]

    # O rembg le OMP_NUM_THREADS ao criar a sessao do onnxruntime; sem isso
    # cada processo tenta usar todos os nucleos e eles disputam a CPU.
    os.environ["OMP_NUM_THREADS"] = str(args.threads_por_processo)
    tarefas = [(i, str(args.images_dir / f"{i}.jpg")) for i in pendentes]
    inicio = time.time()
    falhas = 0
    with Pool(args.processos) as pool:
        for n, (item_id, vetor, erro) in enumerate(pool.imap_unordered(_calcular, tarefas, chunksize=4), start=1):
            if vetor is None:
                falhas += 1
                print(f"[aviso] {item_id}: {erro}")
            else:
                cores[item_id] = np.asarray(vetor, dtype=np.float32)
            if n % 100 == 0 or n == len(tarefas):
                _salvar_progresso(args.progresso, cores)
                decorrido = time.time() - inicio
                restante = decorrido / n * (len(tarefas) - n)
                print(f"[cores] {n}/{len(tarefas)}  {decorrido / n:.2f}s/peca  faltam ~{restante / 60:.0f} min", flush=True)

    if args.limite is not None:
        print("[cores] --limite: caches nao foram alterados")
        return
    if falhas:
        print(f"[cores] {falhas} falhas; rode de novo pra tentar essas pecas antes de reescrever os caches")
        return

    for path, embeddings in caches.items():
        backup = path.with_suffix(".antes_cores.npz")
        if not backup.exists():
            path.replace(backup)
        mudaram = 0
        for item_id, embedding in embeddings.items():
            novo = embedding.copy()
            novo[:N_CORES] = cores[item_id]
            mudaram += not np.allclose(novo[:N_CORES], embedding[:N_CORES], atol=1e-3)
            embeddings[item_id] = novo
        save_cache(path, embeddings)
        print(f"[cores] {path}: {mudaram}/{len(embeddings)} pecas com cor diferente (backup em {backup})")


if __name__ == "__main__":
    main()
