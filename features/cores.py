import numpy as np
from PIL import Image
from sklearn.cluster import KMeans
from rembg import remove, new_session

# Tamanho maximo (lado maior) pra rodar a segmentacao. Precisa ser grande o
# suficiente pro u2net_cloth_seg enxergar detalhe (ele falha silenciosamente
# — mascara vazia — em imagens muito pequenas ou bordas time), mas nao tao
# grande que fique lento numa foto de celular de 3000+ pixels.
_TAMANHO_MAX_SEGMENTACAO = 512
_AREA_MINIMA_DETECCAO = 0.03  # % da imagem que a mascara precisa cobrir
# Pixel so conta como peca se a mascara tiver pelo menos metade de certeza.
# Com > 0, a borda suave do rembg (12-35% da mascara nas fotos de catalogo)
# entrava inteira: o fundo branco virava a "cor secundaria" e clareava a
# principal.
_LIMIAR_MASCARA = 127

_sessao_roupa = None


def _sessao_cloth_seg():
    global _sessao_roupa
    if _sessao_roupa is None:
        _sessao_roupa = new_session("u2net_cloth_seg")
    return _sessao_roupa


def _redimensionar_para_segmentacao(imagem):
    largura, altura = imagem.size
    escala = _TAMANHO_MAX_SEGMENTACAO / max(largura, altura)
    if escala >= 1:
        return imagem
    novo_tamanho = (max(1, int(largura * escala)), max(1, int(altura * escala)))
    return imagem.resize(novo_tamanho)


def _segmentar_mascara(imagem_seg):
    """Roda a segmentacao especifica de roupa e devolve a mascara booleana
    (mesma resolucao de `imagem_seg`) isolando a peca.

    Tenta primeiro o u2net_cloth_seg — treinado especificamente pra roupa,
    inclusive vestida no corpo — escolhendo a mascara (parte de cima, de
    baixo, ou peca unica) com mais area detectada. Se nenhuma mascara
    detectar area suficiente (ex.: foto de produto isolado num angulo
    atipico, sem pessoa), cai pro rembg generico (remove()), que trata a
    imagem inteira como "objeto em primeiro plano". Reaproveitada tanto por
    `remover_fundo` (extracao de cor) quanto por `features/recorte.py`
    (recorte da peca pra exibicao).
    """
    mascaras = _sessao_cloth_seg().predict(imagem_seg)
    areas = [int((np.array(mascara) > 0).sum()) for mascara in mascaras]
    melhor_indice = int(np.argmax(areas))
    total_pixels = imagem_seg.size[0] * imagem_seg.size[1]

    if areas[melhor_indice] / total_pixels >= _AREA_MINIMA_DETECCAO:
        return np.array(mascaras[melhor_indice].resize(imagem_seg.size)) > _LIMIAR_MASCARA

    imagem_sem_fundo = remove(imagem_seg)
    return np.array(imagem_sem_fundo)[:, :, 3] > _LIMIAR_MASCARA


def remover_fundo(imagem):
    """Isola os pixels da peca de roupa, descartando pele/fundo/outras pecas."""
    imagem_seg = _redimensionar_para_segmentacao(imagem)
    mascara = _segmentar_mascara(imagem_seg)
    imagem_arr = np.array(imagem_seg)
    return imagem_arr[mascara]


def extrair_cores(caminho_imagem):
    imagem = Image.open(caminho_imagem).convert("RGB")
    try:
        pixels = remover_fundo(imagem)
    except Exception:
        pixels = np.array(imagem.resize((100, 100))).reshape(-1, 3).astype(float)

    pixels = pixels.astype(float)
    if len(pixels) > 20000:
        indices = np.random.default_rng(42).choice(len(pixels), 20000, replace=False)
        pixels = pixels[indices]

   
    kmeans = KMeans(n_clusters=2, random_state=42, n_init=10)
    kmeans.fit(pixels)

    # A ordem dos clusters do K-Means e arbitraria: a cor principal e a do
    # cluster com mais pixels, nao a do indice 0.
    tamanhos = np.bincount(kmeans.labels_, minlength=2)
    ordem = np.argsort(tamanhos)[::-1]
    cores = kmeans.cluster_centers_[ordem].astype(int).tolist()

    cor_principal  = cores[0]
    cor_secundaria = cores[1]

    brilho = sum(cor_principal) / 3
    if brilho > 160:
        tonalidade = 0  
    elif brilho > 60:
        tonalidade = 1  
    else:
        tonalidade = 2  

    return {
        "cor_principal":  cor_principal,
        "cor_secundaria": cor_secundaria,
        "tonalidade":     tonalidade
    }


def vetor_cores(cores):
    """Indices 0-6 do embedding: cor principal e secundaria (RGB /255) e
    tonalidade (/3). Usado por features/embedding_neural.py e por
    model/recalcular_cores.py, que refaz so essa parte dos embeddings em
    cache."""
    return [
        cores["cor_principal"][0]  / 255,
        cores["cor_principal"][1]  / 255,
        cores["cor_principal"][2]  / 255,
        cores["cor_secundaria"][0] / 255,
        cores["cor_secundaria"][1] / 255,
        cores["cor_secundaria"][2] / 255,
        cores["tonalidade"] / 3,
    ]
