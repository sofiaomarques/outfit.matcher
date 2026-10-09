"""API que expoe o pipeline de `features/*.py` e o modelo de match pro app
Flutter — ate aqui o pipeline so rodava via script/CLI local. Roda com:

    PYTHONPATH=. .venv/bin/uvicorn api.main:app --reload

Em dev, sem login: `API_SEM_AUTH=1` na frente. A URL do serviço é
configurada no Flutter via `--dart-define` (mesmo padrão do Supabase).

Protecao da API publica: as rotas de foto e de looks exigem o token da sessao
do Supabase (api/auth.py), o CORS so libera o dominio do site
(ALLOWED_ORIGINS) e o upload tem limite de tamanho.
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

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from PIL import Image
from pydantic import BaseModel, Field

from api.auth import autenticador_do_ambiente, usuario_logado
from features.categoria import carregar_modelo_categoria
from features.embedding_neural import VERSAO_FEATURES, gerar_embedding_completo
from features.recorte import recortar_peca
from model.feedback import Feedback
from model.recomendar import CLIMAS, OCASIOES, carregar_modelo_match, peca_de_features, recomendar

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
    pesos vieram (so na imagem Docker)."""
    modelos = app.state.modelos
    return {
        "status": "ok" if modelos == MODELOS_ESPERADOS else "degradado",
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


@app.post("/items/analyze", dependencies=[Depends(usuario_logado)])
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


@app.post("/items/crop", dependencies=[Depends(usuario_logado)])
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


class FeedbackEntrada(BaseModel):
    favoritos: list[list[str]] = []
    rejeitados: list[RejeicaoEntrada] = []
    usos: list[UsoEntrada] = []


class PedidoRecomendacao(BaseModel):
    pecas: list[PecaGuardaRoupa]
    ocasiao: Literal[tuple(OCASIOES)] | None = None  # type: ignore[valid-type]
    clima: Literal[tuple(CLIMAS)] | None = None  # type: ignore[valid-type]
    top_k: int = Field(default=12, ge=1, le=50)
    # Favoritos, rejeicoes e usos do app (tabelas outfit_*), no formato de
    # Feedback.de_dict (model/feedback.py).
    feedback: FeedbackEntrada | None = None


@app.post("/looks/recommend", dependencies=[Depends(usuario_logado)])
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
        top_k=pedido.top_k,
        feedback=feedback,
    )
    return {"looks": looks, "pecas_ignoradas": ignoradas}
