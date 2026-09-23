from pathlib import Path

import torch
from PIL import Image

from features._clip_shared import model, processor

categoria_map = {
    "calça":         1,
    "short":         2,
    "saia":          3,
    "vestido":       4,
    "top":           5,
    "camiseta":      6,
    "regata":        7,
    "jaqueta":       8,
    "casaco":        9,
    "blusa de manga": 10
}
_codigo_para_categoria = {codigo: nome for nome, codigo in categoria_map.items()}

_MODELO_CATEGORIA = Path("model/categoria_model.pt")


def classificar_categoria(caminho_imagem):
    imagem = Image.open(caminho_imagem).convert("RGB")

    if _MODELO_CATEGORIA.exists():
        return _classificar_com_modelo(imagem)
    return _classificar_zero_shot(imagem)


def _extrair_embedding_clip(imagem):
    """Mesma logica de compatibilidade de features/embedding_neural.py — duplicada
    aqui (em vez de importada) pra evitar import circular (embedding_neural
    importa de tipo, que importa daqui)."""
    inputs = processor(images=imagem, return_tensors="pt")
    with torch.no_grad():
        saida = model.get_image_features(**inputs)
    if hasattr(saida, "pooler_output"):
        saida = saida.pooler_output
    return saida.detach().cpu().float().reshape(-1).numpy()


def _classificar_com_modelo(imagem):
    """Classificador supervisionado (model/treinar_categoria.py) treinado em cima
    do embedding visual do CLIP com rotulos reais do Kaggle. Mais preciso que o
    zero-shot: 95.3% vs 92.0% de acuracia (nivel cima/baixo/unico, itens nunca
    vistos no treino)."""
    from model.categoria_classificador import prever_categoria

    embedding = _extrair_embedding_clip(imagem)
    codigo = prever_categoria(embedding, _MODELO_CATEGORIA)
    return {
        "categoria": _codigo_para_categoria[codigo],
        "codigo": codigo,
    }


def _classificar_zero_shot(imagem):
    """Fallback usado enquanto model/categoria_model.pt nao foi treinado."""
    opcoes = [
        "pants or trousers",
        "shorts",
        "a skirt",
        "a dress",
        "a top or crop top",
        "a t-shirt",
        "a tank top or sleeveless",
        "a jacket",
        "a coat or overcoat",
        "a long sleeve blouse or shirt"
    ]

    labels = [
        "calça", "short", "saia", "vestido", "top",
        "camiseta", "regata", "jaqueta", "casaco", "blusa de manga"
    ]

    inputs = processor(text=opcoes, images=imagem, return_tensors="pt", padding=True)

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)

    indice = probs.argmax().item()
    categoria = labels[indice]

    return {
        "categoria": categoria,
        "codigo":    categoria_map[categoria],
    }