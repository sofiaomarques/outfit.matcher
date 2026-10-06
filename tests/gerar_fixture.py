"""Gera `tests/fixtures/guarda_roupa.json`: a saida real de /items/analyze
pra um guarda-roupa pequeno, usada pelos testes de contrato da API.

Rode de novo sempre que `VERSAO_FEATURES` mudar (o teste avisa):

    PYTHONPATH=. python tests/gerar_fixture.py

Precisa das fotos de `dados/validacao_real/` e da copia limpa do Kaggle em
`dados/fashion-dataset-roupas/` (model/limpar_dataset.py) — so na maquina de
quem gera; a fixture vai pro git.
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from api.main import app

KAGGLE = Path("dados/fashion-dataset-roupas/images")
REAIS = Path("dados/validacao_real")
SAIDA = Path("tests/fixtures/guarda_roupa.json")

# id -> (categoria escolhida no app, foto). Fotos reais de celular + catalogo
# do Kaggle cobrindo cima, baixo, saia, vestido e camada.
PECAS = {
    "camiseta-real": ("top", REAIS / "camiseta/images.jpg"),
    "blusa-manga-real": ("top", REAIS / "blusa de manga/images1.jpg"),
    "saia-real": ("skirt", REAIS / "saia/saia.jpg"),
    "camiseta-kaggle": ("top", KAGGLE / "3954.jpg"),
    "camisa-kaggle": ("top", KAGGLE / "25527.jpg"),
    "jaqueta-kaggle": ("top", KAGGLE / "6889.jpg"),
    "jeans-kaggle": ("bottom", KAGGLE / "26994.jpg"),
    "calca-kaggle": ("bottom", KAGGLE / "57138.jpg"),
    "short-kaggle": ("bottom", KAGGLE / "32903.jpg"),
    "vestido-kaggle": ("dress", KAGGLE / "39716.jpg"),
}


def main() -> None:
    cliente = TestClient(app)
    pecas = []
    for peca_id, (categoria, foto) in PECAS.items():
        with foto.open("rb") as arquivo:
            resposta = cliente.post("/items/analyze", files={"file": (foto.name, arquivo, "image/jpeg")})
        resposta.raise_for_status()
        features = resposta.json()
        # 6 casas bastam pro modelo e deixam o arquivo com metade do tamanho.
        features["embedding"] = [round(x, 6) for x in features["embedding"]]
        pecas.append({"id": peca_id, "categoria": categoria, "features": features})
        print(f"{peca_id}: detectada {features['categoria']}")

    SAIDA.write_text(json.dumps({"pecas": pecas}, ensure_ascii=False) + "\n")
    print(f"{SAIDA}: {len(pecas)} pecas")


if __name__ == "__main__":
    main()
