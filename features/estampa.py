import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

estampa_map = {
    "nenhuma": 0,
    "pouca":   1,
    "muita":   2
}

def classificar_estampa(caminho_imagem):
    imagem = Image.open(caminho_imagem).convert("RGB")

    opcoes = [
        "a solid color clothing with no pattern",     # nenhuma
        "a clothing with a small or subtle pattern",  # pouca
        "a clothing with a bold or maximalist pattern" # muita
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