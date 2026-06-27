from features.cores import extrair_cores
from features.tipo import classificar_tipo
from features.estampa import classificar_estampa
from features.formalidade import classificar_formalidade

def gerar_embedding(caminho_imagem):
    cores       = extrair_cores(caminho_imagem)
    tipo        = classificar_tipo(caminho_imagem)
    estampa     = classificar_estampa(caminho_imagem)
    formalidade = classificar_formalidade(caminho_imagem)

    embedding = [
        round(cores["cor_principal"][0]  / 255, 4),
        round(cores["cor_principal"][1]  / 255, 4),
        round(cores["cor_principal"][2]  / 255, 4),
        round(cores["cor_secundaria"][0] / 255, 4),
        round(cores["cor_secundaria"][1] / 255, 4),
        round(cores["cor_secundaria"][2] / 255, 4),
        round(cores["tonalidade"]        / 3,   4),
        round(tipo["codigo"]             / 10,  4),
        round(tipo["codigo_tipo"]        / 3,   4),
        round(estampa["codigo"]          / 2,   4),
        round(formalidade["codigo"]      / 3,   4)
    ]

    return {
        "embedding": embedding,
        "tamanho":   len(embedding),
        "detalhes": {
            "cor_principal":  cores["cor_principal"],
            "cor_secundaria": cores["cor_secundaria"],
            "tonalidade":     cores["tonalidade"],
            "categoria":      tipo["codigo"],
            "tipo":           tipo["codigo_tipo"],
            "estampa":        estampa["codigo"],
            "formalidade":    formalidade["codigo"]
        }
    }