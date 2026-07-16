import pandas as pd
import os
import random
from features.tipo import classificar_tipo

def carregar_roupas(caminho_csv, caminho_imagens):
    df = pd.read_csv(caminho_csv, on_bad_lines='skip')
    
    # filtra só roupas pelo CSV
    df = df[df['masterCategory'] == 'Apparel']
    
    # monta o caminho da imagem
    df['caminho'] = df['id'].apply(
        lambda x: os.path.join(caminho_imagens, f"{x}.jpg")
    )
    
    # verifica se a imagem existe
    df = df[df['caminho'].apply(os.path.exists)].reset_index(drop=True)
    
    print(f"Imagens encontradas: {len(df)}")
    print("Classificando com seu modelo... (pode demorar)")
    
    # usa seu classificador para identificar o tipo de cada peça
    tipos = []
    for i, row in df.iterrows():
        try:
            resultado = classificar_tipo(row['caminho'])
            tipos.append(resultado['codigo_tipo'])  # 1=baixo, 2=único, 3=cima
        except:
            tipos.append(None)
        
        if i % 50 == 0:
            print(f"  {i}/{len(df)} classificadas...")
    
    df['tipo_codigo'] = tipos
    df = df[df['tipo_codigo'].notna()]
    
    print(f"Total classificadas: {len(df)}")
    return df

def criar_pares(df, n_pares=500):
    pares = []
    
    cima  = df[df['tipo_codigo'] == 3]['caminho'].tolist()
    baixo = df[df['tipo_codigo'] == 1]['caminho'].tolist()
    unico = df[df['tipo_codigo'] == 2]['caminho'].tolist()

    print(f"Parte de cima: {len(cima)}")
    print(f"Parte de baixo: {len(baixo)}")
    print(f"Peça única: {len(unico)}")

    # pares positivos → parte de cima + parte de baixo
    for _ in range(n_pares // 2):
        if len(cima) > 0 and len(baixo) > 0:
            a = random.choice(cima)
            b = random.choice(baixo)
            pares.append((a, b, 1))

    # pares negativos → mesma categoria
    for _ in range(n_pares // 2):
        if random.random() > 0.5 and len(cima) > 1:
            a = random.choice(cima)
            b = random.choice(cima)
        elif len(baixo) > 1:
            a = random.choice(baixo)
            b = random.choice(baixo)
        else:
            continue
        pares.append((a, b, 0))

    random.shuffle(pares)
    print(f"Total de pares criados: {len(pares)}")
    return pares

if __name__ == "__main__":
    df = carregar_roupas(
        'dados/fashion-dataset/styles.csv',
        'dados/fashion-dataset/images'
    )
    pares = criar_pares(df, n_pares=500)
    print(f"\nExemplo par positivo: {pares[0]}")