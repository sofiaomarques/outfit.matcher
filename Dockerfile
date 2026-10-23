# API do Outfit Matcher (api/main.py).
#
# Build — o repositorio de pesos no Hugging Face Hub e privado, entao o token
# de leitura entra como secret do BuildKit (nao fica em nenhuma camada). O id e
# HF_TOKEN porque o Hugging Face Spaces monta cada secret do Space com o nome
# dele; localmente, sem `src`, o docker le a variavel de ambiente de mesmo nome:
#
#   HF_TOKEN=hf_... docker build --secret id=HF_TOKEN \
#       --build-arg MODELOS_REVISAO=<hash do commit no Hub> -t outfit-api .
#
# Run — a porta vem de $PORT (padrao 7860, a que o Hugging Face Spaces espera);
# mapeada pra 8000, que e onde o app procura a API em dev:
#
#   docker run --rm -p 8000:7860 -e SUPABASE_URL=https://<projeto>.supabase.co outfit-api
#
# Sem SUPABASE_URL (ou API_SEM_AUTH=1) a API nao sobe; ALLOWED_ORIGINS com o
# dominio do site (README, secao API).
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

# Pesos proprios (.pt), sempre de um commit fixo do Hub: com um nome de branch
# (main), o docker reaproveitaria esta camada do cache e um envio novo nunca
# entraria na imagem. subir_modelos.py imprime o hash; no Spaces ele vem da
# variavel MODELOS_REVISAO do Space. `required`: sem o secret, falha aqui em vez
# de chegar ao Hub sem token.
ARG MODELOS_REVISAO
COPY scripts/ scripts/
RUN --mount=type=secret,id=HF_TOKEN,required=true \
    if ! echo "$MODELOS_REVISAO" | grep -Eq '^[0-9a-f]{40}$'; then \
        echo "Passe --build-arg MODELOS_REVISAO=<hash de 40 caracteres do commit no Hub>" >&2; \
        exit 1; \
    fi \
    && HF_TOKEN="$(cat /run/secrets/HF_TOKEN)" MODELOS_REVISAO="$MODELOS_REVISAO" \
    python scripts/baixar_modelos.py
# Exposto no /health (revisao_modelos).
ENV MODELOS_REVISAO=$MODELOS_REVISAO

COPY api/ api/
COPY features/ features/
COPY model/ model/

# Tudo ja esta em cache: se algo faltar, falha na hora em vez de baixar na
# primeira requisicao.
ENV HF_HUB_OFFLINE=1

# uid 1000: e com ele que o Hugging Face Spaces roda o container.
RUN useradd --create-home --uid 1000 app
USER app

EXPOSE 7860
# --no-access-log: o log de acesso do uvicorn grava o IP de quem chama; o
# registro de uso (api/uso.py) ja tem rota, status e tempo, sem dado pessoal.
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-7860} --no-access-log"]
