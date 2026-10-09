"""Protecao da API publica (#21): login do Supabase nas rotas caras, CORS so
pro site e limite de upload. Os tokens sao assinados com chaves geradas na
hora, no mesmo formato dos do Supabase."""

from __future__ import annotations

import io
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from PIL import Image

import api.main
from api.auth import Autenticador, autenticador_do_ambiente
from api.main import app, configuracao_cors

SUPABASE_URL = "https://projeto-teste.supabase.co"
EMISSOR = f"{SUPABASE_URL}/auth/v1"
SEGREDO_LEGADO = "segredo-legado-do-projeto-com-pelo-menos-32-bytes"

CHAVE = ec.generate_private_key(ec.SECP256R1())
OUTRA_CHAVE = ec.generate_private_key(ec.SECP256R1())


class JwksFalso:
    """No lugar do PyJWKClient: devolve a chave publica do `kid` sem rede."""

    def __init__(self, fora_do_ar: bool = False) -> None:
        self.fora_do_ar = fora_do_ar

    def get_signing_key_from_jwt(self, token: str) -> jwt.PyJWK:
        if self.fora_do_ar:
            raise jwt.PyJWKClientConnectionError("sem rede")
        kid = jwt.get_unverified_header(token)["kid"]
        if kid != "chave-1":
            raise jwt.PyJWKClientError(f"kid desconhecido: {kid}")
        return jwt.PyJWK.from_dict({**jwt.algorithms.ECAlgorithm.to_jwk(CHAVE.public_key(), as_dict=True), "alg": "ES256"})


def _token(chave=CHAVE, alg="ES256", kid="chave-1", **claims) -> str:
    agora = int(time.time())
    corpo = {
        "sub": "usuaria-1",
        "aud": "authenticated",
        "role": "authenticated",
        "iss": EMISSOR,
        "iat": agora,
        "exp": agora + 3600,
        **claims,
    }
    corpo = {k: v for k, v in corpo.items() if v is not None}
    return jwt.encode(corpo, chave, algorithm=alg, headers={"kid": kid})


@pytest.fixture
def cliente():
    """Sem `with`: nao roda o lifespan (nao carrega os modelos), entao o
    autenticador entra direto no app.state."""
    antes = getattr(app.state, "autenticador", None)
    app.state.autenticador = Autenticador(SUPABASE_URL, segredo=SEGREDO_LEGADO, jwks=JwksFalso())
    yield TestClient(app)
    app.state.autenticador = antes


def _recomendar(cliente: TestClient, token: str | None = None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return cliente.post("/looks/recommend", json={"pecas": []}, headers=headers)


def test_token_da_sessao_passa(cliente):
    resposta = _recomendar(cliente, _token())
    assert resposta.status_code == 200, resposta.text


def test_token_hs256_do_projeto_legado_passa(cliente):
    assert _recomendar(cliente, _token(chave=SEGREDO_LEGADO, alg="HS256")).status_code == 200


def test_sem_token_da_401(cliente):
    resposta = _recomendar(cliente)
    assert resposta.status_code == 401
    assert resposta.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "token",
    [
        pytest.param("nao-e-um-jwt", id="lixo"),
        pytest.param(_token(chave=OUTRA_CHAVE), id="outra-chave"),
        pytest.param(_token(kid="chave-velha"), id="kid-desconhecido"),
        pytest.param(_token(exp=int(time.time()) - 60), id="expirado"),
        pytest.param(_token(iss="https://outro-projeto.supabase.co/auth/v1"), id="outro-projeto"),
        # Formato da anon key legada: assinada pelo projeto, mas sem aud/sub.
        pytest.param(
            _token(chave=SEGREDO_LEGADO, alg="HS256", iss="supabase", role="anon", aud=None, sub=None),
            id="anon-key",
        ),
        pytest.param(_token(chave="outro-segredo-com-pelo-menos-32-bytes!!", alg="HS256"), id="outro-segredo"),
        pytest.param(jwt.encode({"sub": "x"}, None, algorithm="none"), id="alg-none"),
    ],
)
def test_token_invalido_da_401(cliente, token):
    assert _recomendar(cliente, token).status_code == 401


def test_hs256_sem_segredo_configurado_da_401(cliente):
    app.state.autenticador = Autenticador(SUPABASE_URL, jwks=JwksFalso())
    assert _recomendar(cliente, _token(chave=SEGREDO_LEGADO, alg="HS256")).status_code == 401


def test_supabase_fora_do_ar_da_503(cliente):
    app.state.autenticador = Autenticador(SUPABASE_URL, jwks=JwksFalso(fora_do_ar=True))
    assert _recomendar(cliente, _token()).status_code == 503


@pytest.mark.parametrize("rota", ["/items/analyze", "/items/crop"])
def test_rotas_de_foto_exigem_login(cliente, rota):
    resposta = cliente.post(rota, files={"file": ("x.jpg", b"qualquer", "image/jpeg")})
    assert resposta.status_code == 401


def test_health_continua_aberto(cliente):
    # Sem modelos carregados (sem lifespan), mas responde sem token.
    app.state.modelos = {}
    assert cliente.get("/health").status_code == 200


def test_sem_configuracao_a_api_nao_sobe(monkeypatch):
    monkeypatch.delenv("API_SEM_AUTH", raising=False)
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        autenticador_do_ambiente()


def test_configuracao_de_producao(monkeypatch):
    monkeypatch.delenv("API_SEM_AUTH", raising=False)
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL + "/")
    autenticador = autenticador_do_ambiente()
    assert autenticador is not None
    assert autenticador.emissor == EMISSOR


# --- CORS ---------------------------------------------------------------


def _preflight(origem: str):
    # Sem lifespan nem rota de verdade: o middleware responde o preflight.
    return TestClient(app).options(
        "/looks/recommend",
        headers={
            "Origin": origem,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


@pytest.mark.parametrize("origem", ["http://localhost:5173", "http://127.0.0.1:8080", "http://localhost"])
def test_cors_em_dev_libera_localhost(origem):
    resposta = _preflight(origem)
    assert resposta.status_code == 200
    assert resposta.headers["access-control-allow-origin"] == origem


@pytest.mark.parametrize("origem", ["https://site-malicioso.com", "http://localhost.site-malicioso.com"])
def test_cors_bloqueia_outros_sites(origem):
    resposta = _preflight(origem)
    assert "access-control-allow-origin" not in resposta.headers


def test_cors_em_producao_so_libera_o_site():
    assert configuracao_cors("https://wable.app, https://www.wable.app/") == {
        "allow_origins": ["https://wable.app", "https://www.wable.app"]
    }
    assert configuracao_cors(None) == configuracao_cors(" ") == {"allow_origin_regex": api.main.LOCALHOST}


# --- Limite de upload (com o login desligado, como no conftest) ----------


@pytest.fixture
def cliente_sem_login():
    antes = getattr(app.state, "autenticador", None)
    app.state.autenticador = None
    yield TestClient(app)
    app.state.autenticador = antes


def test_upload_maior_que_o_limite_da_413(cliente_sem_login):
    grande = b"\0" * (api.main.MAX_BYTES_UPLOAD + 1)
    resposta = cliente_sem_login.post("/items/analyze", files={"file": ("x.jpg", grande, "image/jpeg")})
    assert resposta.status_code == 413


def test_imagem_com_pixels_demais_da_413(cliente_sem_login):
    # PNG de poucos KB que abriria em ~30 megapixels na memoria.
    buffer = io.BytesIO()
    Image.new("1", (6000, 5000)).save(buffer, format="PNG")
    assert len(buffer.getvalue()) < api.main.MAX_BYTES_UPLOAD
    resposta = cliente_sem_login.post("/items/crop", files={"file": ("x.png", buffer.getvalue(), "image/png")})
    assert resposta.status_code == 413
