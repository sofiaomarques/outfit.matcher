import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from features.cores import extrair_cores
from features.tipo import classificar_tipo
from features.estampa import classificar_estampa
from features.formalidade import classificar_formalidade

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

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

    with torch.no_grad():
        embedding_clip = model.get_image_features(**inputs)

    embedding_neural = embedding_clip[0].tolist()

    embedding_final = embedding_manual + embedding_neural  # 523 números

    return {
        "embedding": embedding_final
        }
