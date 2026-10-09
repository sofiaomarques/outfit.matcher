"""Autenticacao da API publica: so quem esta logado no app chama as rotas que
gastam o servidor (CLIP + rembg). O app manda o access token da sessao do
Supabase em `Authorization: Bearer <token>`; aqui so conferimos assinatura e
claims, sem chamar o Supabase a cada requisicao.

Variaveis de ambiente:
- SUPABASE_URL (obrigatoria): emissor esperado do token e de onde vem as
  chaves publicas (<SUPABASE_URL>/auth/v1/.well-known/jwks.json), usadas pelos
  projetos com JWT signing keys (ES256/RS256).
- SUPABASE_JWT_SECRET: so pra projeto com o segredo legado (HS256). Fica so
  no servidor, nunca no app.
- API_SEM_AUTH=1: desliga a checagem — so pra dev local e testes.

Sem SUPABASE_URL nem API_SEM_AUTH a API nao sobe: um deploy mal configurado
falha na hora em vez de ficar aberto.
"""

from __future__ import annotations

import logging
import os

import jwt
from starlette.concurrency import run_in_threadpool
from starlette.datastructures import Headers
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

log = logging.getLogger("uvicorn.error")

# Todo o resto exige login (o padrao e fechado: rota nova ja nasce protegida).
ROTAS_PUBLICAS = frozenset({"/health"})

# Folga pra diferenca de relogio entre o Supabase e o servidor da API: sem
# ela, um token recem-emitido (iat alguns segundos "no futuro") da 401.
FOLGA_RELOGIO_S = 30

# Algoritmos das JWT signing keys do Supabase; HS256 e o segredo legado.
ALGORITMOS_ASSIMETRICOS = ("ES256", "RS256")


class Autenticador:
    def __init__(
        self,
        supabase_url: str,
        segredo: str | None = None,
        jwks: jwt.PyJWKClient | None = None,
    ) -> None:
        url = supabase_url.rstrip("/")
        self.emissor = f"{url}/auth/v1"
        self._segredo = segredo
        # Cacheia as chaves e so busca de novo quando aparece um `kid`
        # desconhecido (rotacao de chave no painel do Supabase).
        self._jwks = jwks or jwt.PyJWKClient(f"{self.emissor}/.well-known/jwks.json", timeout=10)

    def verificar(self, token: str) -> dict:
        """Devolve os claims ou lanca `jwt.PyJWTError`. A chave depende do
        `alg` do cabecalho, mas cada alg so aceita o seu tipo de chave: um
        token HS256 nunca e conferido com a chave publica (algorithm
        confusion)."""
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256" and self._segredo:
            chave = self._segredo
        elif alg in ALGORITMOS_ASSIMETRICOS:
            chave = self._jwks.get_signing_key_from_jwt(token).key
        else:
            raise jwt.InvalidAlgorithmError(f"alg nao aceito: {alg}")
        # aud "authenticated" separa a sessao de um usuario da anon key (que
        # tambem e um JWT assinado pelo projeto, mas sem aud nem sub).
        return jwt.decode(
            token,
            chave,
            algorithms=[alg],
            audience="authenticated",
            issuer=self.emissor,
            leeway=FOLGA_RELOGIO_S,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )


def autenticador_do_ambiente() -> Autenticador | None:
    """None = autenticacao desligada (API_SEM_AUTH=1)."""
    if os.environ.get("API_SEM_AUTH") == "1":
        log.warning("Autenticacao DESLIGADA (API_SEM_AUTH=1): use so em dev local.")
        return None
    url = os.environ.get("SUPABASE_URL")
    if not url:
        raise RuntimeError(
            "Defina SUPABASE_URL (projeto do Supabase que emite os tokens) "
            "ou API_SEM_AUTH=1 pra rodar sem autenticacao em dev."
        )
    return Autenticador(url, segredo=os.environ.get("SUPABASE_JWT_SECRET") or None)


def _usuario_ou_erro(autenticador: Autenticador, authorization: str | None) -> str | Response:
    """Id do usuario (`sub`) ou a resposta de erro pronta."""
    esquema, _, token = (authorization or "").partition(" ")
    if esquema.lower() == "bearer" and token.strip():
        try:
            return autenticador.verificar(token.strip())["sub"]
        except jwt.PyJWKClientConnectionError:
            # Supabase fora do ar: o token pode ser valido, o problema e nosso.
            log.exception("Nao consegui buscar as chaves publicas do Supabase")
            return JSONResponse({"detail": "Nao foi possivel validar o login agora."}, status_code=503)
        except jwt.PyJWTError:
            pass
    return JSONResponse(
        {"detail": "Faca login no app."},
        status_code=401,
        headers={"WWW-Authenticate": "Bearer"},
    )


class ExigeLogin:
    """Middleware ASGI: confere o token antes de a requisicao chegar no
    FastAPI. Como dependencia da rota nao serviria — o FastAPI le o corpo
    inteiro (upload, JSON) antes de resolver as dependencias, entao quem nao
    esta logado ainda faria a API ler o que mandasse. O id do usuario fica em
    `request.state.usuario`."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # O tipo antes de tudo: no scope "lifespan" o autenticador ainda nao
        # existe (e ele que cria), e um erro aqui desligaria o lifespan.
        if scope["type"] != "http" or scope["path"] in ROTAS_PUBLICAS:
            await self.app(scope, receive, send)
            return
        autenticador: Autenticador | None = scope["app"].state.autenticador
        if autenticador is None:
            await self.app(scope, receive, send)
            return
        # No threadpool: a primeira busca das chaves publicas e uma chamada de rede.
        authorization = Headers(scope=scope).get("authorization")
        resultado = await run_in_threadpool(_usuario_ou_erro, autenticador, authorization)
        if isinstance(resultado, Response):
            await resultado(scope, receive, send)
            return
        scope.setdefault("state", {})["usuario"] = resultado
        await self.app(scope, receive, send)
