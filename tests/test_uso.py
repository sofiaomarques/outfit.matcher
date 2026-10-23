"""Registro de uso da API (#20, api/uso.py): uma linha por requisicao, com
rota, status e tempo, e nunca token, corpo, foto ou id."""

from __future__ import annotations

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from api.uso import RegistroDeUso, anotar


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RegistroDeUso)

    @app.post("/eco")
    async def eco(request: Request) -> dict:
        corpo = await request.json()
        anotar(request, pecas=len(corpo["pecas"]), ocasiao="trabalho")
        return {"ok": True}

    @app.get("/quebra")
    def quebra() -> dict:
        raise RuntimeError("bug")

    return app


@pytest.fixture
def cliente() -> TestClient:
    return TestClient(_app(), raise_server_exceptions=False)


def test_registra_rota_status_tempo_e_anotacoes(cliente, linhas_de_uso):
    resposta = cliente.post(
        "/eco",
        json={"pecas": ["id-da-peca-1", "id-da-peca-2"]},
        headers={"Authorization": "Bearer token-secreto"},
    )
    assert resposta.status_code == 200

    [linha] = linhas_de_uso
    assert linha["evento"] == "requisicao"
    assert (linha["metodo"], linha["rota"], linha["status"]) == ("POST", "/eco", 200)
    assert linha["severity"] == "INFO"
    assert isinstance(linha["ms"], int) and linha["ms"] >= 0
    assert (linha["pecas"], linha["ocasiao"]) == (2, "trabalho")


def test_nao_registra_token_nem_corpo(cliente, linhas_de_uso):
    cliente.post(
        "/eco",
        json={"pecas": ["id-da-peca-1"]},
        headers={"Authorization": "Bearer token-secreto"},
    )
    texto = str(linhas_de_uso)
    assert "token-secreto" not in texto
    assert "id-da-peca-1" not in texto


def test_exception_conta_como_500(cliente, linhas_de_uso):
    assert cliente.get("/quebra").status_code == 500
    [linha] = linhas_de_uso
    assert (linha["rota"], linha["status"], linha["severity"]) == ("/quebra", 500, "ERROR")


def test_caminho_fora_da_api_nao_vai_pro_log(cliente, linhas_de_uso):
    assert cliente.get("/wp-admin/setup.php?x=1").status_code == 404
    [linha] = linhas_de_uso
    assert (linha["rota"], linha["status"], linha["severity"]) == ("(desconhecida)", 404, "WARNING")
    assert "wp-admin" not in str(linha)
