"""CLIP compartilhado entre os classificadores.

`categoria.py`, `estampa.py`, `formalidade.py` e `embedding_neural.py`
carregavam cada um a sua propria copia do CLIP no import — 4 instancias do
mesmo modelo em memoria ao mesmo tempo. Este modulo carrega uma unica vez;
os outros importam `model`/`processor` daqui.
"""

from transformers import CLIPModel, CLIPProcessor

model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
model.eval()
