"""Registro de uso da API (#20): uma linha JSON por requisicao no stdout, com
rota, status e tempo. No Cloud Run cada linha vira um log estruturado (os
campos aparecem em jsonPayload e `severity` vira o nivel), entao da pra
filtrar e somar no Logs Explorer sem nenhuma dependencia nova.

Nunca entra: token, corpo da requisicao, foto, IP, id de usuaria ou de peca.
(O log de requisicoes do proprio Cloud Run tem o IP; ver README, secao API.)
As rotas podem acrescentar contagens e as escolhas do pedido (ex.: ocasiao,
numero de pecas) com `anotar()`: e o que falta no Supabase pra comparar looks
pedidos x favoritados x rejeitados por ocasiao (supabase/metricas.sql).
"""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

log = logging.getLogger("wable.uso")
if not log.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    # Sem isso a linha sairia de novo pelo log do uvicorn, sem ser JSON.
    log.propagate = False

# Chave em `scope["state"]` (o mesmo dict de `request.state`) onde a rota
# deixa os campos extras pro middleware.
_CHAVE = "uso"


def registrar(evento: str, mensagem: str, severidade: str = "INFO", **campos: Any) -> None:
    linha = {"severity": severidade, "message": mensagem, "evento": evento, **campos}
    log.info(json.dumps(linha, ensure_ascii=False, default=str))


def anotar(request: Request, **campos: Any) -> None:
    """Acrescenta campos a linha desta requisicao. So contagens e escolhas
    do pedido — nada que identifique a usuaria."""
    request.scope.setdefault("state", {}).setdefault(_CHAVE, {}).update(campos)


def _severidade(status: int) -> str:
    if status >= 500:
        return "ERROR"
    if status >= 400:
        return "WARNING"
    return "INFO"


class RegistroDeUso:
    """Middleware ASGI, o mais externo: ve tambem os 401 do login, os 413 do
    limite de corpo e as respostas do CORS. Exception sem tratamento conta
    como 500 e segue adiante."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._rotas: frozenset[str] | None = None

    def _rota(self, scope: Scope) -> str:
        # Caminho fora das rotas da API (robo procurando /wp-admin etc.) vira
        # um valor so, pra nao encher o log de lixo.
        if self._rotas is None:
            self._rotas = frozenset(getattr(r, "path", "") for r in scope["app"].routes)
        caminho = scope["path"]
        return caminho if caminho in self._rotas else "(desconhecida)"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inicio = time.perf_counter()
        status = 500

        async def send_com_status(mensagem: Message) -> None:
            nonlocal status
            if mensagem["type"] == "http.response.start":
                status = mensagem["status"]
            await send(mensagem)

        try:
            await self.app(scope, receive, send_com_status)
        finally:
            ms = round((time.perf_counter() - inicio) * 1000)
            rota, metodo = self._rota(scope), scope["method"]
            extras = scope.get("state", {}).get(_CHAVE, {})
            registrar(
                "requisicao",
                f"{metodo} {rota} {status} {ms}ms",
                _severidade(status),
                metodo=metodo,
                rota=rota,
                status=status,
                ms=ms,
                **extras,
            )
