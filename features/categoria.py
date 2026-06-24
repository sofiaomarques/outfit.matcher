import torch
from PIL import Image
from transformers import CLIPProcessor, CLIPModel

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

# mapeamento de categoria para número
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
        "pants or trousers",          # calça
        "shorts",                      # short
        "a skirt",                     # saia
        "a dress",                     # vestido
        "a top or crop top",           # top
        "a t-shirt",                   # camiseta
        "a tank top or sleeveless",    # regata
        "a jacket",                    # jaqueta
        "a coat or overcoat",          # casaco
        "a long sleeve blouse or shirt" # blusa de manga
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