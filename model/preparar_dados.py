import pandas as pd
import os
import random

def carregar_roupas(caminho_csv, caminho_imagens):
    df = pd.read_csv(caminho_csv, on_bad_lines='skip')
    df = df[df['masterCategory'] == 'Apparel']
    categorias = ['Topwear', 'Bottomwear', 'Dress']
    df = df[df['subCategory'].isin(categorias)]
    df['caminho'] = df['id'].apply(
        lambda x: os.path.join(caminho_imagens, f"{x}.jpg")
    )
    df = df[df['caminho'].apply(os.path.exists)]
    return df

def criar_pares(df, n_pares=1000):
    pares = []
    
    topwear   = df[df['subCategory'] == 'Topwear']['caminho'].tolist()
    bottomwear = df[df['subCategory'] == 'Bottomwear']['caminho'].tolist()
    dress     = df[df['subCategory'] == 'Dress']['caminho'].tolist()

    # pares positivos → parte de cima + parte de baixo
    for _ in range(n_pares // 2):
        a = random.choice(topwear)
        b = random.choice(bottomwear)
        pares.append((a, b, 1))

    # pares negativos → duas partes de cima ou duas de baixo
    for _ in range(n_pares // 2):
        if random.random() > 0.5:
            a = random.choice(topwear)
            b = random.choice(topwear)
        else:
            a = random.choice(bottomwear)
            b = random.choice(bottomwear)
        pares.append((a, b, 0))

    random.shuffle(pares)
    return pares

if __name__ == "__main__":
    df = carregar_roupas(
        'dados/fashion-dataset/styles.csv',
        'dados/fashion-dataset/images'
    )
    pares = criar_pares(df, n_pares=1000)
    print(f"Total de pares criados: {len(pares)}")
    print(f"Exemplo par positivo: {pares[0]}")