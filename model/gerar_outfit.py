from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch

from features.embedding_neural import gerar_embedding_completo
from model.preparar_dados import PreparedItem, weak_compatibility
from model.treinar import DEFAULT_OUTPUT, choose_device, load_model, select_features

TIPO_BAIXO = 1
TIPO_UNICA = 2
TIPO_CIMA = 3


@dataclass(frozen=True)
class Peca:
    caminho: str
    embedding: np.ndarray
    tipo: int


def carregar_peca(caminho_imagem: str) -> Peca:
    """Gera o embedding de 523 numeros e classifica a peca em cima/baixo/unica."""
    resultado = gerar_embedding_completo(caminho_imagem)
    embedding = np.asarray(resultado["embedding"], dtype=np.float32)
    # indice 8 guarda codigo_tipo normalizado (/3): 1=baixo, 2=unica, 3=cima.
    tipo = int(round(float(embedding[8]) * 3))
    return Peca(caminho=caminho_imagem, embedding=embedding, tipo=tipo)


def _pontuar_com_modelo(
    pares: list[tuple[Peca, Peca]], checkpoint_path: Path
) -> list[float]:
    device = choose_device("auto")
    model, checkpoint = load_model(checkpoint_path, device)
    mean = np.asarray(checkpoint["mean"], dtype=np.float32)
    std = np.asarray(checkpoint["std"], dtype=np.float32)

    emb_a = np.stack([(select_features(a.embedding, checkpoint) - mean) / std for a, _ in pares]).astype(np.float32)
    emb_b = np.stack([(select_features(b.embedding, checkpoint) - mean) / std for _, b in pares]).astype(np.float32)

    with torch.no_grad():
        logits = model(torch.from_numpy(emb_a).to(device), torch.from_numpy(emb_b).to(device))
        scores = torch.sigmoid(logits).cpu().numpy().reshape(-1)
    return scores.tolist()


def _pontuar_com_regras(pares: list[tuple[Peca, Peca]]) -> list[float]:
    """Fallback usado enquanto nao existe model/match_model.pt treinado."""

    def como_item(peca: Peca) -> PreparedItem:
        return PreparedItem(
            item_id=peca.caminho,
            image_path=peca.caminho,
            article_type="",
            tipo=peca.tipo,
            embedding=peca.embedding,
        )

    return [1.0 if weak_compatibility(como_item(a), como_item(b)) else 0.0 for a, b in pares]


def gerar_looks(
    caminhos_pecas: list[str],
    checkpoint_path: Path = DEFAULT_OUTPUT,
    top_k: int = 3,
) -> list[dict]:
    """Monta looks (cima+baixo, ou vestido sozinho) a partir de uma lista de fotos de roupas.

    Nao considera calcados: a tabela de categorias do modelo so cobre pecas de roupa
    (calca, short, saia, vestido, top, camiseta, regata, jaqueta, casaco, blusa).
    """
    pecas = [carregar_peca(caminho) for caminho in caminhos_pecas]
    cimas = [p for p in pecas if p.tipo == TIPO_CIMA]
    baixos = [p for p in pecas if p.tipo == TIPO_BAIXO]
    unicas = [p for p in pecas if p.tipo == TIPO_UNICA]

    pares = [(cima, baixo) for baixo in baixos for cima in cimas]
    if pares:
        if checkpoint_path.exists():
            scores = _pontuar_com_modelo(pares, checkpoint_path)
        else:
            scores = _pontuar_com_regras(pares)
    else:
        scores = []

    looks = [
        {"pecas": [cima.caminho, baixo.caminho], "score": score}
        for (cima, baixo), score in zip(pares, scores)
    ]
    looks.extend({"pecas": [unica.caminho], "score": 1.0} for unica in unicas)

    looks.sort(key=lambda look: look["score"], reverse=True)
    return looks[:top_k]
