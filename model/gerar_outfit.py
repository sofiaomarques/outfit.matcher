from __future__ import annotations

from pathlib import Path

from features.embedding_neural import gerar_embedding_completo
from model.recomendar import Peca, peca_de_features, recomendar

# Categoria detectada (features/categoria.py) -> categoria do app. No app
# quem define e a usuaria; aqui, rodando direto sobre fotos, vem do CLIP.
CATEGORIA_APP = {1: "bottom", 2: "bottom", 3: "skirt", 4: "dress"}


def carregar_peca(caminho_imagem: str) -> Peca:
    """Gera as features da foto e monta a Peca usada pelo recomendador."""
    resultado = gerar_embedding_completo(caminho_imagem)
    codigo = resultado["tipo"]["codigo"]
    features = {
        "embedding": resultado["embedding"],
        "categoria_codigo": codigo,
    }
    return peca_de_features(caminho_imagem, CATEGORIA_APP.get(codigo, "top"), features)


def gerar_looks(
    caminhos_pecas: list[str],
    checkpoint_path: Path | None = None,
    top_k: int = 3,
    ocasiao: str | None = None,
    clima: str | None = None,
) -> list[dict]:
    """Monta looks a partir de uma lista de fotos de roupas — mesmo algoritmo
    do app (model/recomendar.py), com os ids das pecas sendo os caminhos.

    Nao considera calcados: a tabela de categorias do modelo so cobre pecas de roupa
    (calca, short, saia, vestido, top, camiseta, regata, jaqueta, casaco, blusa).
    """
    pecas = [carregar_peca(caminho) for caminho in caminhos_pecas]
    return recomendar(pecas, ocasiao=ocasiao, clima=clima, top_k=top_k, checkpoint_path=checkpoint_path)
