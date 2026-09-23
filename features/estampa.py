import torch
from PIL import Image

from features._clip_shared import model, processor

estampa_map = {
    "nenhuma": 0,
    "pouca":   1,
    "muita":   2
}

def classificar_estampa(caminho_imagem):
    imagem = Image.open(caminho_imagem).convert("RGB")

    opcoes = [
        "a solid color clothing with no pattern",     
        "a clothing with a small or subtle pattern",  
        "a clothing with a bold or maximalist pattern" 
    ]

    labels = ["nenhuma", "pouca", "muita"]

    inputs = processor(text=opcoes, images=imagem, return_tensors="pt", padding=True)

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)

    indice = probs.argmax().item()
    estampa = labels[indice]

    return {
        "codigo":  estampa_map[estampa]
    }