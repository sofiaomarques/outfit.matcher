import torch
from PIL import Image
from features.cores import extrair_cores
from features.tipo import classificar_tipo
from features.estampa import classificar_estampa
from features.formalidade import classificar_formalidade
from features._clip_shared import model, processor

# Suba quando mudar o calculo das features: o app reanalisa as pecas salvas
# com versao menor (RecommendationService.featuresVersion, em Dart).
# 2: cor principal = cluster com mais pixels; mascara sem a borda suave.
VERSAO_FEATURES = 2


def extrair_vetor_clip(inputs):
    """Compatibilidade entre versoes do transformers: sempre retorna 512 valores."""
    with torch.no_grad():
        saida = model.get_image_features(**inputs)

    if hasattr(saida, "pooler_output"):
        saida = saida.pooler_output
    if not isinstance(saida, torch.Tensor):
        raise TypeError("A saida de imagem do CLIP nao e um tensor reconhecido.")

    vetor = saida.detach().cpu().float().reshape(-1)
    if vetor.numel() != 512:
        raise ValueError(f"CLIP retornou {vetor.numel()} valores; esperado 512.")
    return vetor.tolist()

def gerar_embedding_completo(caminho_imagem):
    cores       = extrair_cores(caminho_imagem)
    tipo        = classificar_tipo(caminho_imagem)
    estampa     = classificar_estampa(caminho_imagem)
    formalidade = classificar_formalidade(caminho_imagem)

    tonalidade_map = {"claro": 0, "médio": 1, "escuro": 2}

    embedding_manual = [
        cores["cor_principal"][0]  / 255,
        cores["cor_principal"][1]  / 255,
        cores["cor_principal"][2]  / 255,
        cores["cor_secundaria"][0] / 255,
        cores["cor_secundaria"][1] / 255,
        cores["cor_secundaria"][2] / 255,
        cores["tonalidade"] / 3,
        tipo["codigo"]        / 10,
        tipo["codigo_tipo"]   / 3,
        estampa["codigo"]     / 2,
        formalidade["codigo"] / 3
    ]

    imagem = Image.open(caminho_imagem).convert("RGB")
    inputs = processor(images=imagem, return_tensors="pt")

    embedding_neural = extrair_vetor_clip(inputs)

    embedding_final = embedding_manual + embedding_neural  # 523 números

    # Resultados intermediarios vao junto pra quem precisa deles (api/main.py)
    # nao ter que rodar cores/CLIP de novo.
    return {
        "embedding": embedding_final,
        "cores": cores,
        "tipo": tipo,
        "estampa": estampa,
        "formalidade": formalidade,
        }
