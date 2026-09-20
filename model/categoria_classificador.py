from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

DEFAULT_OUTPUT = Path("model/categoria_model.pt")
NUM_CATEGORIAS = 10


class CategoriaNet(nn.Module):
    """Classificador linear simples em cima do embedding visual do CLIP (512 numeros)."""

    def __init__(self, input_dim: int = 512, hidden_dim: int = 128, num_classes: int = NUM_CATEGORIAS) -> None:
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_classes = num_classes
        self.rede = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.rede(x)


def load_model(path: Path = DEFAULT_OUTPUT, device: torch.device | None = None) -> tuple[CategoriaNet, dict[str, Any]]:
    device = device or torch.device("cpu")
    try:
        checkpoint = torch.load(path, map_location=device, weights_only=False)
    except TypeError:
        checkpoint = torch.load(path, map_location=device)
    model = CategoriaNet(
        input_dim=int(checkpoint["input_dim"]),
        hidden_dim=int(checkpoint["hidden_dim"]),
        num_classes=int(checkpoint["num_classes"]),
    ).to(device)
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()
    return model, checkpoint


@torch.no_grad()
def prever_categoria(clip_embedding: np.ndarray, checkpoint_path: Path = DEFAULT_OUTPUT) -> int:
    """Recebe o embedding visual do CLIP (512 numeros) e retorna o codigo de categoria (1-10)."""
    model, checkpoint = load_model(checkpoint_path)
    mean = np.asarray(checkpoint["mean"], dtype=np.float32)
    std = np.asarray(checkpoint["std"], dtype=np.float32)
    x = (np.asarray(clip_embedding, dtype=np.float32).reshape(1, -1) - mean) / std
    logits = model(torch.from_numpy(x.astype(np.float32)))
    return int(logits.argmax(dim=1).item()) + 1
