# API do Outfit Matcher (api/main.py).
#
# Build — o repositorio de pesos no Hugging Face Hub e privado, entao o token
# de leitura entra como secret do BuildKit (nao fica em nenhuma camada):
#
#   HF_TOKEN=hf_... docker build --secret id=hf_token,env=HF_TOKEN -t outfit-api .
#
# Run — a porta vem de $PORT (padrao 8000):
#
#   docker run --rm -p 8000:8000 outfit-api
#
# Tudo que a API baixaria na primeira requisicao (pesos .pt, CLIP, rembg) e
# baixado aqui no build; em runtime o Hub fica offline.

FROM python:3.12-slim

# opencv-python precisa de libGL e libglib mesmo sem janela.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Os imports usam caminhos relativos (Path("model/...")): WORKDIR na raiz do
# repo e PYTHONPATH=. (mesmo que `PYTHONPATH=. uvicorn api.main:app`).
WORKDIR /app
ENV PYTHONPATH=. \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/cache/huggingface \
    U2NET_HOME=/opt/cache/u2net

# torch pela index da CPU: o do PyPI no Linux puxa as wheels com CUDA (vários
# GB). O requirements.txt fixa a mesma versao e o pip a considera atendida.
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
        "torch==$(grep -i '^torch==' requirements.txt | cut -d= -f3)" \
    && pip install --no-cache-dir -r requirements.txt

# Modelos de terceiros: CLIP (features/_clip_shared.py e model/clip_categoria.py)
# e os dois do rembg (u2net_cloth_seg e o u2net generico do fallback).
RUN python -c "\
from transformers import CLIPModel, CLIPProcessor; \
CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); \
CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32'); \
from rembg import new_session; \
new_session('u2net_cloth_seg'); new_session('u2net')"

# Pesos proprios (.pt). Fixe MODELOS_REVISAO num hash de commit do Hub pra que
# um envio novo nao mude o modelo sem um deploy (subir_modelos.py imprime o hash).
ARG MODELOS_REVISAO=main
COPY scripts/ scripts/
RUN --mount=type=secret,id=hf_token \
    HF_TOKEN="$(cat /run/secrets/hf_token)" MODELOS_REVISAO="$MODELOS_REVISAO" \
    python scripts/baixar_modelos.py

COPY api/ api/
COPY features/ features/
COPY model/ model/

# Tudo ja esta em cache: se algo faltar, falha na hora em vez de baixar na
# primeira requisicao.
ENV HF_HUB_OFFLINE=1

RUN useradd --create-home app
USER app

EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
