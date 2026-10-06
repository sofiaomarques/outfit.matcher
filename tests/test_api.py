"""Contrato da API com o app: o que o app manda e o que ele espera receber
(app/lib/services/recommendation_service.dart e garment_analysis_service.dart),
e que a API esta usando os modelos de producao."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.main import app
from features.embedding_neural import VERSAO_FEATURES
from model.recomendar import CLIMAS, OCASIOES

FIXTURE = Path("tests/fixtures/guarda_roupa.json")
FOTO = Path("dados/roupas/saia.jpg")


@pytest.fixture(scope="module")
def cliente() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="module")
def pecas() -> list[dict]:
    return json.loads(FIXTURE.read_text())["pecas"]


def _recomendar(cliente: TestClient, pecas: list[dict], **extra) -> dict:
    resposta = cliente.post("/looks/recommend", json={"pecas": pecas, **extra})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _checar_looks(looks: list[dict], pecas: list[dict]) -> None:
    """O app monta cada look com `byId[id]!`: um id que ele nao mandou
    derruba a tela."""
    categoria = {p["id"]: p["categoria"] for p in pecas}
    vistos = set()
    for look in looks:
        ids = look["pecas"]
        assert set(ids) <= categoria.keys()
        assert len(ids) == len(set(ids)), f"peca repetida no look {ids}"
        assert frozenset(ids) not in vistos, f"look repetido {ids}"
        vistos.add(frozenset(ids))

        cats = [categoria[i] for i in ids]
        baixos = cats.count("bottom") + cats.count("skirt")
        if "dress" in cats:
            assert cats.count("dress") == 1 and baixos == 0, ids
        else:
            assert baixos == 1 and "top" in cats, ids


def test_health_mostra_os_modelos_de_producao(cliente):
    resposta = cliente.get("/health")
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "ok"
    assert corpo["versao_features"] == VERSAO_FEATURES
    assert corpo["modelos"] == {"match": "v2", "categoria": "clip_ajustado"}, (
        "API caiu num modelo pior: rode scripts/baixar_modelos.py (e rode o pytest da raiz do repo)"
    )


def test_fixture_na_versao_atual_das_features(pecas):
    versoes = {p["features"]["versao_features"] for p in pecas}
    assert versoes == {VERSAO_FEATURES}, "features mudaram: rode PYTHONPATH=. python tests/gerar_fixture.py"


@pytest.mark.parametrize("clima", [None, *CLIMAS])
@pytest.mark.parametrize("ocasiao", [None, *OCASIOES])
def test_recomenda_looks_validos_pra_toda_ocasiao_e_clima(cliente, pecas, ocasiao, clima):
    corpo = _recomendar(cliente, pecas, ocasiao=ocasiao, clima=clima, top_k=12)
    assert corpo["pecas_ignoradas"] == []
    assert 0 < len(corpo["looks"]) <= 12
    _checar_looks(corpo["looks"], pecas)
    scores = [look["score"] for look in corpo["looks"]]
    # Sem feedback, o score e uma media ponderada de valores entre 0 e 1.
    assert all(0 <= s <= 1 for s in scores)


def test_frio_nao_sugere_short(cliente, pecas):
    looks = _recomendar(cliente, pecas, clima="frio")["looks"]
    assert looks
    assert all("short-kaggle" not in look["pecas"] for look in looks)


@pytest.mark.parametrize(
    "features",
    [
        {},  # sem embedding
        {"embedding": [0.1, 0.2]},  # tamanho errado
        {"embedding": None},
    ],
)
def test_peca_com_features_quebradas_e_ignorada_sem_derrubar(cliente, pecas, features):
    quebrada = {"id": "quebrada", "categoria": "top", "features": features}
    corpo = _recomendar(cliente, [*pecas, quebrada])
    assert corpo["pecas_ignoradas"] == ["quebrada"]
    assert corpo["looks"]
    _checar_looks(corpo["looks"], pecas)


@pytest.mark.parametrize(
    "campo, valor",
    [("ocasiao", "balada"), ("clima", "neve"), ("top_k", 0), ("top_k", 51)],
)
def test_pedido_invalido_da_422(cliente, pecas, campo, valor):
    resposta = cliente.post("/looks/recommend", json={"pecas": pecas, campo: valor})
    assert resposta.status_code == 422


def test_categoria_desconhecida_da_422(cliente, pecas):
    peca = {**pecas[0], "categoria": "sapato"}
    resposta = cliente.post("/looks/recommend", json={"pecas": [peca]})
    assert resposta.status_code == 422


def test_guarda_roupa_vazio_nao_quebra(cliente):
    assert _recomendar(cliente, [])["looks"] == []


def test_feedback_no_formato_do_app_tira_o_look_rejeitado(cliente, pecas):
    antes = _recomendar(cliente, pecas, ocasiao="trabalho")["looks"]
    rejeitado = antes[0]["pecas"]
    # Mesmo formato de _feedbackPayload() em recommendation_service.dart.
    feedback = {
        "favoritos": [antes[1]["pecas"]],
        "rejeitados": [{"pecas": rejeitado, "ocasiao": "trabalho"}],
        "usos": [{"pecas": antes[2]["pecas"], "dias": 0}],
    }
    depois = _recomendar(cliente, pecas, ocasiao="trabalho", feedback=feedback)["looks"]
    assert sorted(rejeitado) not in [sorted(look["pecas"]) for look in depois]
    _checar_looks(depois, pecas)

    # A rejeicao vale so pra ocasiao em que foi dada.
    festa = _recomendar(cliente, pecas, ocasiao="festa", feedback=feedback, top_k=50)["looks"]
    assert sorted(rejeitado) in [sorted(look["pecas"]) for look in festa]


def test_guarda_roupa_grande(cliente, pecas):
    """~60 pecas: o tamanho de um guarda-roupa real (sao milhares de
    combinacoes cima x baixo x camada)."""
    rng = np.random.default_rng(0)
    grandes = []
    for copia in range(6):
        for peca in pecas:
            nova = copy.deepcopy(peca)
            nova["id"] = f"{peca['id']}-{copia}"
            emb = np.asarray(nova["features"]["embedding"])
            nova["features"]["embedding"] = (emb + rng.normal(0, 0.01, emb.shape)).tolist()
            grandes.append(nova)
    corpo = _recomendar(cliente, grandes, ocasiao="trabalho", clima="frio")
    assert len(corpo["looks"]) == 12
    _checar_looks(corpo["looks"], grandes)


@pytest.mark.skipif(not FOTO.exists(), reason=f"{FOTO} nao encontrada")
def test_analyze_devolve_o_que_o_app_salva(cliente):
    with FOTO.open("rb") as arquivo:
        # O app manda os bytes como application/octet-stream (pacote http).
        resposta = cliente.post(
            "/items/analyze", files={"file": ("foto.jpg", arquivo, "application/octet-stream")}
        )
    assert resposta.status_code == 200, resposta.text
    features = resposta.json()

    # swatchFromFeatures() no app: lista de 3 inteiros 0-255.
    assert len(features["cor_principal"]) == 3
    assert all(isinstance(c, int) and 0 <= c <= 255 for c in features["cor_principal"])
    assert features["versao_features"] == VERSAO_FEATURES
    assert 1 <= features["categoria_codigo"] <= 10
    assert len(features["embedding"]) == 523

    # O que o app guarda no Supabase tem que voltar aceito no /looks/recommend.
    peca = {"id": "nova", "categoria": "skirt", "features": features}
    assert _recomendar(cliente, [peca])["pecas_ignoradas"] == []


@pytest.mark.skipif(not FOTO.exists(), reason=f"{FOTO} nao encontrada")
def test_crop_devolve_png(cliente):
    with FOTO.open("rb") as arquivo:
        resposta = cliente.post("/items/crop", files={"file": ("foto.jpg", arquivo, "application/octet-stream")})
    assert resposta.status_code == 200
    assert resposta.headers["content-type"] == "image/png"
    assert resposta.content.startswith(b"\x89PNG")


def test_arquivo_que_nao_e_imagem_da_400(cliente):
    resposta = cliente.post("/items/analyze", files={"file": ("x.jpg", b"nao sou imagem", "image/jpeg")})
    assert resposta.status_code == 400
