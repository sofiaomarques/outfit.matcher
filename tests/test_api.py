"""Contrato da API com o app: o que o app manda e o que ele espera receber
(mobile/src/services/recommendation.ts e garmentAnalysis.ts; no Flutter,
app/lib/services/recommendation_service.dart e garment_analysis_service.dart),
e que a API esta usando os modelos de producao."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from api.auth import Autenticador
from api.main import app
from features.embedding_neural import VERSAO_FEATURES
import api.main
from model.recomendar import (
    CAMADAS,
    CLIMAS,
    ESCURIDAO_POR_TONALIDADE,
    OCASIOES,
    PERIODOS,
    PESOS,
    Peca,
    _ajustes_periodo,
    peca_de_features,
    probabilidades_contextos,
    recomendar,
)

FIXTURE = Path("tests/fixtures/guarda_roupa.json")
FOTO = Path("dados/roupas/saia.jpg")


@pytest.fixture(scope="module")
def cliente():
    # Com `with`, o TestClient roda o lifespan (que carrega os modelos).
    with TestClient(app) as cliente:
        yield cliente


@pytest.fixture(scope="module")
def pecas() -> list[dict]:
    return json.loads(FIXTURE.read_text())["pecas"]


def _recomendar(cliente: TestClient, pecas: list[dict], **extra) -> dict:
    resposta = cliente.post("/looks/recommend", json={"pecas": pecas, **extra})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def _checar_looks(looks: list[dict], pecas: list[dict]) -> None:
    """O app monta cada look com `byId[id]!`: um id que ele nao mandou
    derruba a tela. E todo look tem que ser vestivel: vestido sozinho ou
    cima + um baixo, com no maximo uma camada (jaqueta/casaco) por cima."""
    por_id = {p["id"]: p for p in pecas}
    vistos = set()
    for look in looks:
        ids = look["pecas"]
        assert set(ids) <= por_id.keys()
        assert len(ids) == len(set(ids)), f"peca repetida no look {ids}"
        assert frozenset(ids) not in vistos, f"look repetido {ids}"
        vistos.add(frozenset(ids))

        cats = [por_id[i]["categoria"] for i in ids]
        tops = [por_id[i] for i in ids if por_id[i]["categoria"] == "top"]
        camadas = [p for p in tops if p["features"]["categoria_codigo"] in CAMADAS]
        baixos = cats.count("bottom") + cats.count("skirt")
        if "dress" in cats:
            assert cats.count("dress") == 1 and baixos == 0, ids
            assert len(tops) == len(camadas) <= 1, f"vestido so aceita uma camada: {ids}"
        else:
            assert baixos == 1 and 1 <= len(tops) <= 2, ids
            # A peca de cima pode ser uma jaqueta (sem outro top), mas com
            # duas, uma delas tem que ser a camada.
            assert len(tops) == 1 or camadas, f"dois tops sem camada: {ids}"


def test_health_mostra_os_modelos_de_producao(cliente, monkeypatch):
    # Como em producao: com login (o conftest desliga pros outros testes).
    monkeypatch.setattr(app.state, "autenticador", Autenticador("https://projeto-teste.supabase.co"))
    resposta = cliente.get("/health")
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["versao_features"] == VERSAO_FEATURES
    assert "revisao_modelos" in corpo
    assert corpo["modelos"] == {"match": "v2", "categoria": "clip_ajustado"}, (
        "API caiu num modelo pior: rode scripts/baixar_modelos.py"
    )
    assert corpo["login"] is True
    assert corpo["status"] == "ok"


def test_health_degradado_com_o_login_desligado(cliente):
    # O conftest liga API_SEM_AUTH=1; em producao isso deixaria a API aberta.
    corpo = cliente.get("/health").json()
    assert corpo["login"] is False
    assert corpo["status"] == "degradado"


def test_health_degradado_quando_um_peso_nao_carrega(monkeypatch):
    def quebrado() -> str:
        raise RuntimeError("checkpoint corrompido")

    monkeypatch.setattr(api.main, "carregar_modelo_match", quebrado)
    with TestClient(app) as cliente:
        corpo = cliente.get("/health").json()
    assert corpo["status"] == "degradado"
    assert corpo["modelos"]["match"] == "erro"
    assert corpo["modelos"]["categoria"] == "clip_ajustado"


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


@pytest.mark.parametrize("ocasiao", [None, *OCASIOES])
def test_noite_devolve_looks_validos_com_detalhe_de_periodo(cliente, pecas, ocasiao):
    corpo = _recomendar(cliente, pecas, ocasiao=ocasiao, periodo="noite")
    assert corpo["looks"]
    _checar_looks(corpo["looks"], pecas)
    assert all(0 <= look["detalhes"]["periodo"] <= 1 for look in corpo["looks"])
    assert all(0 <= look["score"] <= 1 for look in corpo["looks"])


def test_noite_prefere_cor_escura_com_o_resto_igual(pecas):
    base = np.asarray(pecas[0]["features"]["embedding"], dtype=np.float32)
    versoes = []
    for tonalidade in (0, 2):
        emb = base.copy()
        emb[6] = tonalidade / 3
        versoes.append(Peca(f"t{tonalidade}", "top", emb, 4))
    por_contexto = probabilidades_contextos(np.stack([p.embedding for p in versoes]))
    ajustes = _ajustes_periodo(versoes, PERIODOS["noite"], por_contexto)
    assert ajustes["t2"] > ajustes["t0"]


def _pecas_modelo(pecas: list[dict]) -> list[Peca]:
    return [peca_de_features(p["id"], p["categoria"], p["features"]) for p in pecas]


def test_noite_nao_empata_pecas_arrumadas(pecas):
    """A parte "arrumada" nao pode saturar (antes saia, blusa, camisa, jeans e
    vestido empatavam em 1): com a mesma cor, a saia de encontro pontua mais
    que o jeans, e o jeans mais que o short."""
    modelo = _pecas_modelo(pecas)
    for p in modelo:
        p.embedding[6] = 0  # mesma tonalidade pra todas
    por_contexto = probabilidades_contextos(np.stack([p.embedding for p in modelo]))
    ajustes = _ajustes_periodo(modelo, PERIODOS["noite"], por_contexto)
    assert ajustes["saia-real"] > ajustes["jeans-kaggle"] > ajustes["short-kaggle"]


def test_noite_em_festa_nao_conta_o_clip_duas_vezes(pecas):
    """Em festa a ocasiao ja pontua festa/encontro: o periodo so olha a cor."""
    modelo = _pecas_modelo(pecas)
    por_contexto = probabilidades_contextos(np.stack([p.embedding for p in modelo]))
    ajustes = _ajustes_periodo(modelo, PERIODOS["noite"], por_contexto, OCASIOES["festa"])
    for p in modelo:
        assert ajustes[p.id] == ESCURIDAO_POR_TONALIDADE[round(float(p.embedding[6]) * 3)]


def test_noite_muda_a_ordem_e_sem_periodo_nada_muda(cliente, pecas):
    sem = _recomendar(cliente, pecas, ocasiao="encontro")["looks"]
    noite = _recomendar(cliente, pecas, ocasiao="encontro", periodo="noite")["looks"]
    assert [l["pecas"] for l in sem] != [l["pecas"] for l in noite]
    assert all(l["detalhes"]["periodo"] == 1 for l in sem)
    # Sem periodo, o score segue so compatibilidade + ocasiao.
    pesos = PESOS["compatibilidade"] + PESOS["ocasiao"]
    for l in sem:
        d = l["detalhes"]
        esperado = (d["compatibilidade"] * PESOS["compatibilidade"] + d["ocasiao"] * PESOS["ocasiao"]) / pesos
        assert l["score"] == pytest.approx(esperado, abs=1e-3)


def test_periodo_desconhecido_da_erro_fora_da_api(pecas):
    with pytest.raises(KeyError):
        recomendar(_pecas_modelo(pecas), periodo="Noite")


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
    [("ocasiao", "balada"), ("clima", "neve"), ("periodo", "madrugada"), ("top_k", 0), ("top_k", 51)],
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
    # Um look so cima + baixo (sem vestido nem camada), pra que as pecas dele
    # so formem ele mesmo (usado no fim do teste).
    categoria = {p["id"]: p["categoria"] for p in pecas}
    rejeitado = next(
        look["pecas"] for look in antes
        if len(look["pecas"]) == 2 and "dress" not in {categoria[i] for i in look["pecas"]}
    )
    # Mesmo formato de _feedbackPayload() em recommendation_service.dart.
    feedback = {
        "favoritos": [antes[1]["pecas"]],
        "rejeitados": [{"pecas": rejeitado, "ocasiao": "trabalho"}],
        "usos": [{"pecas": antes[2]["pecas"], "dias": 0}],
    }
    depois = _recomendar(cliente, pecas, ocasiao="trabalho", feedback=feedback)["looks"]
    assert sorted(rejeitado) not in [sorted(look["pecas"]) for look in depois]
    _checar_looks(depois, pecas)

    # So com as pecas do look rejeitado, ele e a unica combinacao possivel: em
    # trabalho nao sobra nada (rejeicao nao relaxa como os filtros), e em festa
    # ele volta — a rejeicao vale so pra ocasiao em que foi dada.
    so_ele = [p for p in pecas if p["id"] in rejeitado]
    assert _recomendar(cliente, so_ele, ocasiao="trabalho", feedback=feedback)["looks"] == []
    festa = _recomendar(cliente, so_ele, ocasiao="festa", feedback=feedback)["looks"]
    assert [sorted(look["pecas"]) for look in festa] == [sorted(rejeitado)]


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
