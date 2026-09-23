"""Recorta a peca de roupa da foto, isolando-a do corpo/fundo — usado pra
mostrar so a peca (nao a pessoa vestindo) nas miniaturas do guarda-roupa.
Reaproveita a mesma segmentacao de `features/cores.py` (u2net_cloth_seg com
fallback pro rembg generico), sem rodar o modelo de segmentacao de novo.
"""

import numpy as np
from PIL import Image

from features.cores import _redimensionar_para_segmentacao, _segmentar_mascara


def recortar_peca(caminho_imagem):
    """Devolve uma imagem (PNG, RGBA com fundo transparente) só com a peça,
    cortada na caixa delimitadora da máscara de segmentação. Se a
    segmentação não detectar nada (máscara vazia) ou falhar, devolve a foto
    original sem alteração — mais seguro que arriscar um recorte errado.
    """
    imagem = Image.open(caminho_imagem).convert("RGB")
    imagem_seg = _redimensionar_para_segmentacao(imagem)

    try:
        mascara = _segmentar_mascara(imagem_seg)
    except Exception:
        return imagem

    if not mascara.any():
        return imagem

    imagem_rgba = np.array(imagem_seg.convert("RGBA"))
    imagem_rgba[:, :, 3] = np.where(mascara, 255, 0)

    linhas = np.where(mascara.any(axis=1))[0]
    colunas = np.where(mascara.any(axis=0))[0]
    y0, y1 = int(linhas[0]), int(linhas[-1])
    x0, x1 = int(colunas[0]), int(colunas[-1])

    return Image.fromarray(imagem_rgba).crop((x0, y0, x1 + 1, y1 + 1))
