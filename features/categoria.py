import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

categoria_map = {
    "calça":         1,
    "short":         2,
    "saia":          3,
    "vestido":       4,
    "top":           5,
    "camiseta":      6,
    "regata":        7,
    "jaqueta":       8,
    "casaco":        9,
    "blusa de manga": 10
}

def classificar_categoria(caminho_imagem):
    imagem = Image.open(caminho_imagem).convert("RGB")

    opcoes = [
        "pants or trousers",          
        "shorts",                     
        "a skirt",                     
        "a dress",                     
        "a top or crop top",           
        "a t-shirt",                   
        "a tank top or sleeveless",    
        "a jacket",                    
        "a coat or overcoat",         
        "a long sleeve blouse or shirt"
    ]

    labels = [
        "calça", "short", "saia", "vestido", "top",
        "camiseta", "regata", "jaqueta", "casaco", "blusa de manga"
    ]

    inputs = processor(text=opcoes, images=imagem, return_tensors="pt", padding=True)

    with torch.no_grad():
        outputs = model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)

    indice = probs.argmax().item()
    categoria = labels[indice]

    return {
        "categoria": categoria,
        "codigo":    categoria_map[categoria],
    } 