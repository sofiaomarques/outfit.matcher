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

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from features.cores import extrair_cores
from features.embedding_neural import gerar_embedding_completo
from features.estampa import classificar_estampa
from features.formalidade import classificar_formalidade
from features.recorte import recortar_peca
from features.tipo import classificar_tipo

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
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Envie um arquivo de imagem.")

    conteudo = await file.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")

    sufixo = Path(file.filename or "upload.jpg").suffix or ".jpg"
    tmp = tempfile.NamedTemporaryFile(suffix=sufixo, delete=False)
    tmp.write(conteudo)
    tmp.close()
    return Path(tmp.name)


@app.post("/items/analyze")
async def analyze_item(file: UploadFile = File(...)) -> dict:
    """Roda o pipeline completo sobre a foto de uma peça: cor, categoria,
    tipo, estampa, formalidade e o embedding de 523 números usado pelo
    modelo de match (`model/match_model.pt`)."""
    caminho = await _salvar_temp(file)
    try:
        cores = extrair_cores(str(caminho))
        tipo = classificar_tipo(str(caminho))
        estampa = classificar_estampa(str(caminho))
        formalidade = classificar_formalidade(str(caminho))
        embedding = gerar_embedding_completo(str(caminho))["embedding"]
    finally:
        caminho.unlink(missing_ok=True)

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
