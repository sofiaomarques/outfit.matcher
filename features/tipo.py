from features.categoria import classificar_categoria

tipo_map = {
    "parte de baixo": 1,
    "peça única":     2,
    "parte de cima":  3
}

def classificar_tipo(caminho_imagem):
    resultado = classificar_categoria(caminho_imagem)
    codigo = resultado["codigo"]
    
    if codigo >= 1 and codigo <= 3:
        tipo = "parte de baixo"
    elif codigo == 4:
        tipo = "peça única"
    elif codigo >= 5 and codigo <= 10:
        tipo = "parte de cima"
    
    return {
        "categoria":      resultado["categoria"],
        "codigo":         codigo,
        "codigo_tipo":    tipo_map[tipo]
    }