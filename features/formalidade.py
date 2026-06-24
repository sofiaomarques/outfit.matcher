import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

formalidade_map = {
    "informal":    0,
    "casual":      1,
    "formal":      2,
    "muito formal": 3
}

def classificar_formalidade(caminho_imagem):
    imagem = Image.open(caminho_imagem).convert("RGB")

    opcoes = [
        "very casual clothing like sportswear or loungewear",  
        "casual everyday clothing",                             
        "formal clothing like office wear",                     
        "very formal clothing like suits or evening wear"       
    ]

    labels = ["informal", "casual", "formal", "muito formal"]

    inputs = processor(text=opcoes, images=imagem, return_tensors="pt", padding=True)

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)

    indice = probs.argmax().item()
    formalidade = labels[indice]

    return {
        "codigo":      formalidade_map[formalidade]
    }