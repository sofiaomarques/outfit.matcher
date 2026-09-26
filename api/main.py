"""API que expoe o pipeline de `features/*.py` e o modelo de match pro app
Flutter — ate aqui o pipeline so rodava via script/CLI local. Roda com:

    PYTHONPATH=. .venv/bin/uvicorn api.main:app --reload

A URL do serviço é configurada no Flutter via `--dart-define` (mesmo padrão
do Supabase) — hospedagem pública fica pra decidir depois de validar o fluxo
local.
"""

from __future__ import annotations

import io
import tempfile
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from PIL import Image
from pydantic import BaseModel, Field

from features.embedding_neural import VERSAO_FEATURES, gerar_embedding_completo
from features.recorte import recortar_peca
from model.recomendar import CLIMAS, OCASIOES, peca_de_features, recomendar

app = FastAPI(title="Outfit Matcher API")

# CORS liberado pra qualquer origem: servico ainda so roda local pra dev,
# sem dado sensivel exposto (a foto ja chega via upload autenticado no
# Supabase antes de bater aqui).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


async def _salvar_temp(file: UploadFile) -> Path:
    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    # Valida pelo conteudo, nao pelo content-type: o pacote `http` do Flutter
    # manda bytes como application/octet-stream por padrao.
    try:
        with Image.open(io.BytesIO(conteudo)) as imagem:
            imagem.verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Envie um arquivo de imagem.")

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
        if "A" not in imagem.getbands():
            return
        rgba = imagem.convert("RGBA")
    fundo = Image.new("RGB", rgba.size, (255, 255, 255))
    fundo.paste(rgba, mask=rgba.getchannel("A"))
    fundo.save(caminho, format="PNG")


@app.post("/items/analyze")
async def analyze_item(file: UploadFile = File(...)) -> dict:
    """Roda o pipeline completo sobre a foto de uma peça: cor, categoria,
    tipo, estampa, formalidade e o embedding de 523 números usado pelo
    modelo de match (`model/match_model.pt`)."""
    caminho = await _salvar_temp(file)
    try:
        _achatar_em_fundo_branco(caminho)
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
async def crop_item(file: UploadFile = File(...)) -> Response:
    """Recorta a peça de roupa da foto (remove corpo/fundo) e devolve um PNG
    com fundo transparente, pronto pra virar a miniatura no guarda-roupa —
    em vez da foto da pessoa vestindo a peça inteira."""
    caminho = await _salvar_temp(file)
    try:
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


class PedidoRecomendacao(BaseModel):
    pecas: list[PecaGuardaRoupa]
    ocasiao: Literal[tuple(OCASIOES)] | None = None  # type: ignore[valid-type]
    clima: Literal[tuple(CLIMAS)] | None = None  # type: ignore[valid-type]
    top_k: int = Field(default=12, ge=1, le=50)


@app.post("/looks/recommend")
def recommend_looks(pedido: PedidoRecomendacao) -> dict:
    """Monta e ordena looks a partir do guarda-roupa enviado pelo app
    (model/recomendar.py). O app manda as pecas com features em vez de a API
    ler do Supabase — assim a API nao precisa de chave de servico e o RLS
    continua valendo. `def` (nao async): roda no threadpool do FastAPI, sem
    travar o event loop enquanto o modelo pontua."""
    try:
        pecas = [peca_de_features(p.id, p.categoria, p.features) for p in pedido.pecas]
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Features invalidas: {exc}")
    looks = recomendar(pecas, ocasiao=pedido.ocasiao, clima=pedido.clima, top_k=pedido.top_k)
    return {"looks": looks}
