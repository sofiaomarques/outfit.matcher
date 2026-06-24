import os
from features.cores import extrair_cores

pasta = 'dados/roupas'

for arquivo in os.listdir(pasta):
    if arquivo.endswith('.jpg') or arquivo.endswith('.png'):
        caminho = os.path.join(pasta, arquivo)
        resultado = extrair_cores(caminho)
        print(f"\n{arquivo}:")
        print(f"  cor principal:  {resultado['cor_principal']}")
        print(f"  cor secundaria: {resultado['cor_secundaria']}")
        print(f"  tonalidade:     {resultado['tonalidade']}")