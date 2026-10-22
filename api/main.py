"""API que expoe o pipeline de `features/*.py` e o modelo de match pro app
Flutter — ate aqui o pipeline so rodava via script/CLI local. Roda com:

    PYTHONPATH=. .venv/bin/uvicorn api.main:app --reload

Em dev, sem login: `API_SEM_AUTH=1` na frente. A URL do serviço é
configurada no Flutter via `--dart-define` (mesmo padrão do Supabase).

Protecao da API publica: tudo menos o /health exige o token da sessao do
Supabase (api/auth.py), o CORS so libera o dominio do site (ALLOWED_ORIGINS)
e o corpo das requisicoes, o upload e o guarda-roupa tem limite de tamanho.
"""

from __future__ import annotations

import io
import logging
import os
import tempfile
import threading
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.datastructures import Headers
from starlette.types import ASGIApp, Receive, Scope, Send

from PIL import Image
from pydantic import BaseModel, Field

from api.auth import ExigeLogin, autenticador_do_ambiente
from features.categoria import carregar_modelo_categoria
from features.embedding_neural import VERSAO_FEATURES, gerar_embedding_completo
from features.recorte import recortar_peca
from model.feedback import Feedback
from model.recomendar import CLIMAS, OCASIOES, PERIODOS, carregar_modelo_match, peca_de_features, recomendar

log = logging.getLogger("uvicorn.error")

# O que deve estar carregado em producao; qualquer outra coisa deixa o
# /health "degradado".
MODELOS_ESPERADOS = {"match": "v2", "categoria": "clip_ajustado"}


def _carregar(nome: str, carregar: Callable[[], str]) -> str:
    try:
        return carregar()
    except Exception:
        log.exception("Falha ao carregar o modelo de %s", nome)
        return "erro"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Antes dos modelos: sem configuracao de login, falha em segundos.
    app.state.autenticador = autenticador_do_ambiente()
    # Carrega os modelos ao subir, nao na primeira requisicao: o /health so
    # responde depois disso e mostra o que de fato carregou — um .pt que
    # existe mas nao carrega aparece como "erro", nao como o modelo esperado.
    app.state.modelos = {
        "match": _carregar("match", carregar_modelo_match),
        "categoria": _carregar("categoria", carregar_modelo_categoria),
    }
    yield


app = FastAPI(title="Outfit Matcher API", lifespan=lifespan)

# Corpo de qualquer requisicao: a foto (MAX_BYTES_UPLOAD) com folga pro
# multipart, ou o JSON de MAX_PECAS pecas (~6 KB cada, quase tudo embedding).
MAX_BYTES_CORPO = 12 * 1024 * 1024


class LimiteDeCorpo:
    """Middleware ASGI: 413 antes de ler um corpo grande demais. Pelo
    Content-Length quando vem; sem ele (chunked), contando o que chega."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        tamanho = Headers(scope=scope).get("content-length", "")
        if tamanho.isdigit() and int(tamanho) > self.max_bytes:
            resposta = JSONResponse({"detail": "Requisicao grande demais."}, status_code=413)
            await resposta(scope, receive, send)
            return

        recebidos = 0

        async def receive_limitado():
            nonlocal recebidos
            mensagem = await receive()
            if mensagem["type"] == "http.request":
                recebidos += len(mensagem.get("body", b""))
                if recebidos > self.max_bytes:
                    # O FastAPI repassa HTTPException da leitura do corpo.
                    raise HTTPException(status_code=413, detail="Requisicao grande demais.")
            return mensagem

        await self.app(scope, receive_limitado, send)


# Em dev, qualquer porta do localhost (o `flutter run -d web-server` muda de
# porta). Com ALLOWED_ORIGINS (ex.: "https://wable.exemplo.com", separadas
# por virgula), so essas — o login (api/auth.py) e o que protege de verdade,
# o CORS so impede outro site de usar a API pelo navegador de quem visita.
LOCALHOST = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


def configuracao_cors(valor: str | None) -> dict:
    origens = [o.strip().rstrip("/") for o in (valor or "").split(",") if o.strip()]
    if origens:
        return {"allow_origins": origens}
    return {"allow_origin_regex": LOCALHOST}


# O ultimo adicionado e o mais externo: CORS por fora, pra que 401 e 413
# tambem levem os cabecalhos e o app no navegador consiga ler o erro. O
# login vem antes do limite de corpo: sem token, nem o tamanho e olhado.
app.add_middleware(LimiteDeCorpo, max_bytes=MAX_BYTES_CORPO)
app.add_middleware(ExigeLogin)
app.add_middleware(
    CORSMiddleware,
    **configuracao_cors(os.environ.get("ALLOWED_ORIGINS")),
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
def health() -> dict:
    """Tambem diz quais modelos carregaram: se um peso nao baixou ou nao
    carrega, a API sobe mesmo assim (com um modelo pior, ou dando erro so na
    rota que usa ele) e o status vira "degradado" — sempre com 200, porque o
    app continua funcionando. `revisao_modelos` e o commit do Hub de onde os
    pesos vieram (so na imagem Docker). Com o login desligado
    (API_SEM_AUTH=1) tambem fica "degradado": em producao, a API estaria
    aberta pra qualquer um sem mais nenhum sinal alem do log."""
    modelos = app.state.modelos
    login = app.state.autenticador is not None
    return {
        "status": "ok" if modelos == MODELOS_ESPERADOS and login else "degradado",
        "login": login,
        "versao_features": VERSAO_FEATURES,
        "revisao_modelos": os.environ.get("MODELOS_REVISAO"),
        "modelos": modelos,
    }


# As rotas de foto sao `def`, nao `async def`: o FastAPI roda cada uma numa
# thread do threadpool, e o CLIP + rembg (segundos de CPU) nao travam o event
# loop — /health e /looks/recommend seguem respondendo durante uma analise.
# Mas uma foto por vez: o tokenizer compartilhado do CLIP (estampa,
# formalidade) nao e thread-safe ("Already borrowed"), e com 2 vCPUs duas
# analises em paralelo nao terminam antes, so somam memoria.
_pipeline_fotos = threading.Lock()

# O app reduz a foto pra 1600 px (JPEG ~1-2 MB) antes de mandar; os limites
# so barram quem chama a API direto. Pixels contam a parte: um PNG pequeno
# pode abrir em uma imagem enorme na memoria.
MAX_BYTES_UPLOAD = 10 * 1024 * 1024
MAX_PIXELS_UPLOAD = 25_000_000


def _salvar_temp(file: UploadFile) -> Path:
    conteudo = file.file.read(MAX_BYTES_UPLOAD + 1)
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    if len(conteudo) > MAX_BYTES_UPLOAD:
        raise HTTPException(status_code=413, detail="Foto maior que 10 MB.")

    # Valida pelo conteudo, nao pelo content-type: o pacote `http` do Flutter
    # manda bytes como application/octet-stream por padrao.
    try:
        with Image.open(io.BytesIO(conteudo)) as imagem:
            largura, altura = imagem.size
            imagem.verify()
    except Image.DecompressionBombError:
        # O Pillow recusa na abertura acima de ~179 MP, antes da conta abaixo.
        raise HTTPException(status_code=413, detail="Foto com resolucao grande demais.")
    except Exception:
        raise HTTPException(status_code=400, detail="Envie um arquivo de imagem.")
    if largura * altura > MAX_PIXELS_UPLOAD:
        raise HTTPException(status_code=413, detail="Foto com resolucao grande demais.")

    sufixo = Path(file.filename or "upload.jpg").suffix or ".jpg"
    tmp = tempfile.NamedTemporaryFile(suffix=sufixo, delete=False)
    tmp.write(conteudo)
    tmp.close()
    return Path(tmp.name)


def _achatar_em_fundo_branco(caminho: Path) -> None:
    """Peca ja recortada (PNG transparente, saida de /items/crop) vira fundo
    branco, como as fotos de catalogo do treino — convertida direto pra RGB,
    o fundo transparente viraria preto pro CLIP."""
    with Image.open(caminho) as imagem:
        # PNG em paleta guarda a transparencia em `info`, nao numa banda A.
        transparente = "A" in imagem.getbands() or "transparency" in imagem.info
        if not transparente:
            return
        rgba = imagem.convert("RGBA")
    fundo = Image.new("RGB", rgba.size, (255, 255, 255))
    fundo.paste(rgba, mask=rgba.getchannel("A"))
    fundo.save(caminho, format="PNG")


@app.post("/items/analyze")
def analyze_item(file: UploadFile = File(...)) -> dict:
    """Roda o pipeline completo sobre a foto de uma peça: cor, categoria,
    tipo, estampa, formalidade e o embedding de 523 números usado pelo
    modelo de match (`model/match_model.pt`)."""
    caminho = _salvar_temp(file)
    try:
        _achatar_em_fundo_branco(caminho)
        with _pipeline_fotos:
            resultado = gerar_embedding_completo(str(caminho))
    finally:
        caminho.unlink(missing_ok=True)

    cores, tipo = resultado["cores"], resultado["tipo"]
    estampa, formalidade = resultado["estampa"], resultado["formalidade"]
    embedding = resultado["embedding"]
    return {
        "cor_principal": cores["cor_principal"],
        "cor_secundaria": cores["cor_secundaria"],
        "tonalidade": cores["tonalidade"],
        "categoria": tipo["categoria"],
        "categoria_codigo": tipo["codigo"],
        "codigo_tipo": tipo["codigo_tipo"],
        "estampa": estampa["codigo"],
        "formalidade": formalidade["codigo"],
        "embedding": embedding,
        "versao_features": VERSAO_FEATURES,
    }


@app.post("/items/crop")
def crop_item(file: UploadFile = File(...)) -> Response:
    """Recorta a peça de roupa da foto (remove corpo/fundo) e devolve um PNG
    com fundo transparente, pronto pra virar a miniatura no guarda-roupa —
    em vez da foto da pessoa vestindo a peça inteira."""
    caminho = _salvar_temp(file)
    try:
        with _pipeline_fotos:
            recorte = recortar_peca(str(caminho))
    finally:
        caminho.unlink(missing_ok=True)

    buffer = io.BytesIO()
    recorte.save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png")


class PecaGuardaRoupa(BaseModel):
    id: str
    categoria: Literal["top", "bottom", "skirt", "dress", "accessory"]
    # Saida de /items/analyze, como guardada na coluna `features`.
    features: dict[str, Any]


class RejeicaoEntrada(BaseModel):
    pecas: list[str]
    ocasiao: Literal[tuple(OCASIOES)] | None = None  # type: ignore[valid-type]


class UsoEntrada(BaseModel):
    pecas: list[str]
    dias: int = Field(ge=0)  # dias desde o uso


# O custo do recomendador cresce mais que linear com o guarda-roupa
# (combinacoes cima x baixo x camada): 300 pecas levam ~4 s, 500 ja ~16 s.
MAX_PECAS = 300
MAX_FEEDBACK = 1000


class FeedbackEntrada(BaseModel):
    favoritos: list[list[str]] = Field(default=[], max_length=MAX_FEEDBACK)
    rejeitados: list[RejeicaoEntrada] = Field(default=[], max_length=MAX_FEEDBACK)
    usos: list[UsoEntrada] = Field(default=[], max_length=MAX_FEEDBACK)


class PedidoRecomendacao(BaseModel):
    pecas: list[PecaGuardaRoupa] = Field(max_length=MAX_PECAS)
    ocasiao: Literal[tuple(OCASIOES)] | None = None  # type: ignore[valid-type]
    clima: Literal[tuple(CLIMAS)] | None = None  # type: ignore[valid-type]
    periodo: Literal[tuple(PERIODOS)] | None = None  # type: ignore[valid-type]
    top_k: int = Field(default=12, ge=1, le=50)
    # Favoritos, rejeicoes e usos do app (tabelas outfit_*), no formato de
    # Feedback.de_dict (model/feedback.py).
    feedback: FeedbackEntrada | None = None


@app.post("/looks/recommend")
def recommend_looks(pedido: PedidoRecomendacao) -> dict:
    """Monta e ordena looks a partir do guarda-roupa enviado pelo app
    (model/recomendar.py). O app manda as pecas com features em vez de a API
    ler do Supabase — assim a API nao precisa de chave de servico e o RLS
    continua valendo. `def` (nao async): roda no threadpool do FastAPI, sem
    travar o event loop enquanto o modelo pontua."""
    # Peca com features quebradas fica de fora, em vez de derrubar a
    # recomendacao do guarda-roupa inteiro.
    pecas, ignoradas = [], []
    for p in pedido.pecas:
        try:
            pecas.append(peca_de_features(p.id, p.categoria, p.features))
        except (KeyError, TypeError, ValueError):
            ignoradas.append(p.id)
    feedback = Feedback.de_dict(pedido.feedback.model_dump()) if pedido.feedback else None
    looks = recomendar(
        pecas,
        ocasiao=pedido.ocasiao,
        clima=pedido.clima,
        periodo=pedido.periodo,
        top_k=pedido.top_k,
        feedback=feedback,
    )
    return {"looks": looks, "pecas_ignoradas": ignoradas}
