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
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

log = logging.getLogger("uvicorn.error")

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


_bearer = HTTPBearer(auto_error=False)


def usuario_logado(
    request: Request,
    credenciais: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str | None:
    """Dependencia das rotas protegidas; devolve o id do usuario (`sub`).
    `def`, nao async: a primeira busca das chaves publicas e uma chamada de
    rede e roda no threadpool."""
    autenticador: Autenticador | None = request.app.state.autenticador
    if autenticador is None:
        return None
    nao_autorizado = HTTPException(
        status_code=401,
        detail="Faca login no app.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credenciais is None:
        raise nao_autorizado
    try:
        return autenticador.verificar(credenciais.credentials)["sub"]
    except jwt.PyJWKClientConnectionError:
        # Supabase fora do ar: o token pode ser valido, o problema e nosso.
        log.exception("Nao consegui buscar as chaves publicas do Supabase")
        raise HTTPException(status_code=503, detail="Nao foi possivel validar o login agora.")
    except jwt.PyJWTError:
        raise nao_autorizado
