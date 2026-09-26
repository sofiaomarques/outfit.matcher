"""Classificador de categoria com o encoder visual do CLIP ajustado (fine-tuning).

Diferente de `categoria_classificador.py` (MLP em cima do CLIP congelado),
aqui as ultimas camadas do encoder visual tambem sao treinadas
(`model/finetune_clip_categoria.py`). E uma copia separada do CLIP: o
`features/_clip_shared.py` continua com os pesos originais, porque os
embeddings dele alimentam o match model, os embeddings salvos no app e a
similaridade de texto (ocasiao, estampa, formalidade) — mudar os pesos la
quebraria tudo isso.

O checkpoint guarda so os parametros treinados; o resto vem do modelo base.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F
from PIL import Image
from torch import nn
from transformers import CLIPImageProcessorPil, CLIPVisionModelWithProjection

from model.categoria_classificador import NUM_CATEGORIAS

BASE_MODEL = "openai/clip-vit-base-patch32"
DEFAULT_OUTPUT = Path("model/clip_categoria.pt")


class ClipCategoriaNet(nn.Module):
    """Encoder visual do CLIP + camada linear sobre o embedding normalizado."""

    def __init__(self, base_model: str = BASE_MODEL, num_classes: int = NUM_CATEGORIAS) -> None:
        super().__init__()
        self.visao = CLIPVisionModelWithProjection.from_pretrained(base_model)
        self.cabeca = nn.Linear(self.visao.config.projection_dim, num_classes)

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        embedding = self.visao(pixel_values=pixel_values).image_embeds
        return self.cabeca(F.normalize(embedding, dim=-1))

    def liberar_camadas(self, camadas_treinaveis: int) -> None:
        """Congela o encoder e libera so as ultimas `camadas_treinaveis`
        camadas do transformer, a layernorm final, a projecao e a cabeca."""
        for parametro in self.visao.parameters():
            parametro.requires_grad = False
        vision_model = self.visao.vision_model
        liberados = [vision_model.post_layernorm, self.visao.visual_projection, self.cabeca]
        if camadas_treinaveis > 0:
            liberados.extend(vision_model.encoder.layers[-camadas_treinaveis:])
        for modulo in liberados:
            for parametro in modulo.parameters():
                parametro.requires_grad = True

    def estado_treinado(self) -> dict[str, torch.Tensor]:
        nomes = {nome for nome, parametro in self.named_parameters() if parametro.requires_grad}
        return {nome: tensor.detach().cpu() for nome, tensor in self.state_dict().items() if nome in nomes}


def load_model(path: Path = DEFAULT_OUTPUT, device: torch.device | None = None) -> tuple[ClipCategoriaNet, dict[str, Any]]:
    device = device or torch.device("cpu")
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)
    model = ClipCategoriaNet(checkpoint["base_model"], int(checkpoint["num_classes"]))
    resultado = model.load_state_dict(checkpoint["estado_treinado"], strict=False)
    if resultado.unexpected_keys:
        raise ValueError(f"Chaves inesperadas no checkpoint: {resultado.unexpected_keys}")
    model.to(device).eval()
    return model, checkpoint


@lru_cache(maxsize=1)
def _modelo_e_processor(path: str) -> tuple[ClipCategoriaNet, CLIPImageProcessorPil]:
    model, checkpoint = load_model(Path(path))
    return model, CLIPImageProcessorPil.from_pretrained(checkpoint["base_model"])


@torch.no_grad()
def prever_categoria_imagem(imagem: Image.Image, checkpoint_path: Path = DEFAULT_OUTPUT) -> int:
    """Recebe a foto (PIL) e retorna o codigo de categoria (1-10)."""
    model, processor = _modelo_e_processor(str(checkpoint_path))
    pixel_values = processor(images=imagem.convert("RGB"), return_tensors="pt")["pixel_values"]
    return int(model(pixel_values).argmax(dim=1).item()) + 1
