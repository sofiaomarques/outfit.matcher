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
def cliente(monkeypatch):
    """Sem `with`: nao roda o lifespan (nao carrega os modelos), entao o
    autenticador entra direto no app.state — e o monkeypatch devolve o de
    antes no fim, pros outros testes que dividem o mesmo app."""
    _trocar_autenticador(monkeypatch, Autenticador(SUPABASE_URL, segredo=SEGREDO_LEGADO, jwks=JwksFalso()))
    return TestClient(app)


def _trocar_autenticador(monkeypatch, autenticador: Autenticador | None) -> None:
    monkeypatch.setattr(app.state, "autenticador", autenticador, raising=False)


def _recomendar(cliente: TestClient, token: str | None = None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return cliente.post("/looks/recommend", json={"pecas": []}, headers=headers)


def test_token_da_sessao_passa(cliente):
    resposta = _recomendar(cliente, _token())
    assert resposta.status_code == 200, resposta.text


def test_token_hs256_do_projeto_legado_passa(cliente):
    assert _recomendar(cliente, _token(chave=SEGREDO_LEGADO, alg="HS256")).status_code == 200


def test_token_emitido_com_relogio_adiantado_passa(cliente):
    # Relogio do Supabase alguns segundos a frente do servidor da API.
    assert _recomendar(cliente, _token(iat=int(time.time()) + 10)).status_code == 200


def test_sem_token_da_401(cliente):
    resposta = _recomendar(cliente)
    assert resposta.status_code == 401
    assert resposta.headers["www-authenticate"] == "Bearer"


def test_sem_token_da_401_antes_de_ler_o_corpo(cliente):
    # Corpo invalido daria 422 se a API chegasse a ler: o login vem antes.
    resposta = cliente.post("/looks/recommend", content=b"{nao e json", headers={"Content-Type": "application/json"})
    assert resposta.status_code == 401


def test_401_leva_os_cabecalhos_de_cors(cliente):
    # Sem eles, o navegador esconde o 401 do app e mostra so "erro de rede".
    resposta = cliente.post("/looks/recommend", json={"pecas": []}, headers={"Origin": "http://localhost:5173"})
    assert resposta.status_code == 401
    assert resposta.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize("rota", ["/openapi.json", "/docs", "/rota-que-nao-existe"])
def test_qualquer_outra_rota_exige_login(cliente, rota):
    assert cliente.get(rota).status_code == 401


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


def test_hs256_sem_segredo_configurado_da_401(cliente, monkeypatch):
    _trocar_autenticador(monkeypatch, Autenticador(SUPABASE_URL, jwks=JwksFalso()))
    assert _recomendar(cliente, _token(chave=SEGREDO_LEGADO, alg="HS256")).status_code == 401


def test_supabase_fora_do_ar_da_503(cliente, monkeypatch):
    _trocar_autenticador(monkeypatch, Autenticador(SUPABASE_URL, jwks=JwksFalso(fora_do_ar=True)))
    assert _recomendar(cliente, _token()).status_code == 503


@pytest.mark.parametrize("rota", ["/items/analyze", "/items/crop"])
def test_rotas_de_foto_exigem_login(cliente, rota):
    resposta = cliente.post(rota, files={"file": ("x.jpg", b"qualquer", "image/jpeg")})
    assert resposta.status_code == 401


def test_health_continua_aberto(cliente, monkeypatch):
    # Sem modelos carregados (sem lifespan), mas responde sem token.
    monkeypatch.setattr(app.state, "modelos", {}, raising=False)
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
def cliente_sem_login(monkeypatch):
    _trocar_autenticador(monkeypatch, None)
    return TestClient(app)


def test_corpo_grande_demais_da_413_pelo_content_length(cliente_sem_login):
    grande = b"x" * (api.main.MAX_BYTES_CORPO + 1)
    resposta = cliente_sem_login.post("/looks/recommend", content=grande, headers={"Content-Type": "application/json"})
    assert resposta.status_code == 413


def test_corpo_grande_demais_da_413_sem_content_length(cliente_sem_login):
    def pedacos():
        for _ in range(13):
            yield b"x" * (1024 * 1024)

    # Gerador: o httpx manda chunked, sem Content-Length.
    resposta = cliente_sem_login.post("/looks/recommend", content=pedacos(), headers={"Content-Type": "application/json"})
    assert resposta.status_code == 413


def test_guarda_roupa_acima_do_limite_da_422(cliente_sem_login):
    pecas = [{"id": str(i), "categoria": "top", "features": {}} for i in range(api.main.MAX_PECAS + 1)]
    assert cliente_sem_login.post("/looks/recommend", json={"pecas": pecas}).status_code == 422


def test_feedback_acima_do_limite_da_422(cliente_sem_login):
    feedback = {"favoritos": [["a", "b"]] * (api.main.MAX_FEEDBACK + 1)}
    resposta = cliente_sem_login.post("/looks/recommend", json={"pecas": [], "feedback": feedback})
    assert resposta.status_code == 422


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


def test_imagem_acima_do_limite_do_pillow_da_413(cliente_sem_login):
    # ~225 MP: o Pillow recusa ja na abertura (DecompressionBombError), antes
    # da conta de pixels — tem que dar o mesmo 413, nao "nao e imagem".
    buffer = io.BytesIO()
    Image.new("1", (15000, 15000)).save(buffer, format="PNG")
    resposta = cliente_sem_login.post("/items/crop", files={"file": ("x.png", buffer.getvalue(), "image/png")})
    assert resposta.status_code == 413
