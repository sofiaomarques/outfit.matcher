import numpy as np
from PIL import Image
from sklearn.cluster import KMeans
from rembg import remove

def remover_fundo(imagem):
    imagem_sem_fundo = remove(imagem)
    imagem_rgba = np.array(imagem_sem_fundo)
    
    pixels_validos = imagem_rgba[imagem_rgba[:,:,3] > 0][:,:3]
    return pixels_validos

def extrair_cores(caminho_imagem):
    imagem = Image.open(caminho_imagem).convert("RGB")
    imagem = imagem.resize((100, 100))
    try:
        pixels = remover_fundo(imagem)
    except:
       
        pixels = np.array(imagem).reshape(-1, 3).astype(float)

    pixels = pixels.astype(float)

   
    kmeans = KMeans(n_clusters=2, random_state=42, n_init=10)
    kmeans.fit(pixels)

    cores = kmeans.cluster_centers_.astype(int).tolist()

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