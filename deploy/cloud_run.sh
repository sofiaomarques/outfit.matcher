#!/usr/bin/env bash
# Deploy do Wable no Google Cloud Run: API (Dockerfile da raiz) e site
# (mobile/Dockerfile). Passo a passo em deploy/README.md.
#
#   PROJECT=<id> deploy/cloud_run.sh setup     # uma vez: APIs, repositorio, HF_TOKEN, orcamento
#   PROJECT=<id> deploy/cloud_run.sh urls      # enderecos que a API e o site vao ter
#   PROJECT=<id> MODELOS_REVISAO=<hash> SUPABASE_URL=<url> deploy/cloud_run.sh api
#   PROJECT=<id> SUPABASE_URL=<url> SUPABASE_ANON_KEY=<key> deploy/cloud_run.sh site
#   PROJECT=<id> deploy/cloud_run.sh status
#
# O build roda no Cloud Build (imagem amd64; o Mac e ARM). O deploy roda daqui,
# com a conta logada no gcloud.

set -euo pipefail

: "${PROJECT:?Defina PROJECT=<id do projeto no Google Cloud>}"
# us-central1: regiao de preco mais baixo (Tier 1). A latencia extra a partir
# do Brasil (~0,1 s) some perto dos segundos do CLIP; troque com REGION=.
REGION="${REGION:-us-central1}"
REPO="${REPO:-wable}"
API_SERVICE="${API_SERVICE:-wable-api}"
SITE_SERVICE="${SITE_SERVICE:-wable-site}"

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
REGISTRO="$REGION-docker.pkg.dev/$PROJECT/$REPO"

gc() { gcloud --project "$PROJECT" --quiet "$@"; }

# A URL de um servico do Cloud Run e fixa (servico-numero.regiao.run.app):
# da pra por o endereco do site no CORS da API antes do site existir.
url_do_servico() {
    local numero
    numero="$(gc projects describe "$PROJECT" --format='value(projectNumber)')"
    echo "https://$1-$numero.$REGION.run.app"
}

# Tag da imagem: o commit atual. Com mudancas nao commitadas, o Cloud Build
# envia os arquivos como estao, entao a tag ganha "-sujo" pra nao enganar.
# Arquivo fora do git (ex.: mobile/.claude/) nao conta: o .gcloudignore ja
# deixa de fora o que importa.
tag_da_imagem() {
    local tag
    tag="$(git -C "$RAIZ" rev-parse --short HEAD)"
    if [ -n "$(git -C "$RAIZ" status --porcelain --untracked-files=no)" ]; then
        tag="$tag-sujo-$(date +%Y%m%d%H%M%S)"
    fi
    echo "$tag"
}

exige_faturamento() {
    if [ "$(gc billing projects describe "$PROJECT" --format='value(billingEnabled)')" != "True" ]; then
        echo "O projeto $PROJECT nao tem faturamento ativo. Vincule uma conta de faturamento em" >&2
        echo "https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT" >&2
        exit 1
    fi
}

cmd_setup() {
    exige_faturamento

    echo "== Ativando as APIs"
    gc services enable run.googleapis.com cloudbuild.googleapis.com \
        artifactregistry.googleapis.com secretmanager.googleapis.com \
        billingbudgets.googleapis.com

    echo "== Repositorio de imagens ($REGISTRO)"
    if ! gc artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
        gc artifacts repositories create "$REPO" --location "$REGION" \
            --repository-format docker --description "Imagens do Wable (API e site)"
    fi
    # A imagem da API tem ~3 GB e o armazenamento gratis e 0,5 GB: guarda so
    # as 2 versoes mais novas de cada imagem (da pra voltar uma).
    local politica
    politica="$(mktemp)"
    cat > "$politica" <<'JSON'
[
  {"name": "manter-2-mais-novas", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 2}},
  {"name": "apagar-o-resto", "action": {"type": "Delete"}, "condition": {"tagState": "any"}}
]
JSON
    gc artifacts repositories set-cleanup-policies "$REPO" --location "$REGION" \
        --policy "$politica" --no-dry-run
    rm -f "$politica"

    echo "== Secret HF_TOKEN (usado so no build, pra baixar os pesos do Hub privado)"
    if ! gc secrets describe HF_TOKEN >/dev/null 2>&1; then
        local token
        read -rsp "Cole o token de LEITURA do Hugging Face (nao aparece na tela): " token
        echo
        printf %s "$token" | gc secrets create HF_TOKEN --replication-policy automatic --data-file=-
        unset token
    fi
    echo "== Permissoes do Cloud Build"
    # O Cloud Build roda com a conta padrao do Compute Engine (projetos novos)
    # ou com a conta legada do Cloud Build: as duas podem ler o secret.
    local numero conta papel
    numero="$(gc projects describe "$PROJECT" --format='value(projectNumber)')"
    for conta in "$numero-compute@developer.gserviceaccount.com" "$numero@cloudbuild.gserviceaccount.com"; do
        gc secrets add-iam-policy-binding HF_TOKEN \
            --member "serviceAccount:$conta" --role roles/secretmanager.secretAccessor \
            >/dev/null 2>&1 && echo "   $conta pode ler o HF_TOKEN" || true
    done
    # A conta do Compute Engine nem sempre ganha o papel de Editor sozinha
    # (depende da politica da conta Google): sem estes, o build nao le o
    # codigo enviado, nao grava log nem sobe a imagem.
    conta="$numero-compute@developer.gserviceaccount.com"
    for papel in roles/storage.objectViewer roles/logging.logWriter roles/artifactregistry.writer; do
        gc projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$conta" \
            --role "$papel" --condition None >/dev/null
        echo "   $conta: $papel"
    done

    echo "== Alerta de orcamento"
    local conta_faturamento orcamentos
    conta_faturamento="$(gc billing projects describe "$PROJECT" --format='value(billingAccountName)')"
    conta_faturamento="${conta_faturamento#billingAccounts/}"
    # Precisa ser administradora da conta de faturamento (uma conta que nao
    # aparece no `gcloud billing accounts list` nao serve). Sem permissao,
    # avisa e segue: o resto do setup nao depende disso.
    if ! orcamentos="$(gc billing budgets list --billing-account "$conta_faturamento" \
        --format='value(displayName)' 2>/dev/null)"; then
        echo "   AVISO: sem permissao pra ver os orcamentos da conta $conta_faturamento." >&2
        echo "   Crie o alerta no console: https://console.cloud.google.com/billing/$conta_faturamento/budgets" >&2
    elif grep -qx "Wable" <<<"$orcamentos"; then
        echo "   ja existe"
    else
        # Sem moeda: usa a da conta de faturamento. Avisa por e-mail aos
        # administradores da conta em 50%, 90% e 100%.
        gc billing budgets create --billing-account "$conta_faturamento" \
            --display-name "Wable" --budget-amount "${BUDGET:-5}" \
            --filter-projects "projects/$PROJECT" \
            --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0
    fi

    echo
    echo "Pronto. Proximo passo: deploy/cloud_run.sh api"
}

cmd_urls() {
    echo "API:  $(url_do_servico "$API_SERVICE")"
    echo "Site: $(url_do_servico "$SITE_SERVICE")"
}

cmd_api() {
    : "${SUPABASE_URL:?Defina SUPABASE_URL=https://<projeto>.supabase.co}"
    : "${MODELOS_REVISAO:?Defina MODELOS_REVISAO=<hash de 40 caracteres do commit no Hub> (README, secao Docker)}"
    if ! [[ "$MODELOS_REVISAO" =~ ^[0-9a-f]{40}$ ]]; then
        echo "MODELOS_REVISAO tem que ser um hash de commit de 40 caracteres, nao '$MODELOS_REVISAO'." >&2
        exit 1
    fi
    exige_faturamento

    # CORS: o site no Cloud Run + o que vier em ALLOWED_ORIGINS_EXTRA (ex.: um dominio proprio).
    local origens imagem
    origens="$(url_do_servico "$SITE_SERVICE")${ALLOWED_ORIGINS_EXTRA:+,$ALLOWED_ORIGINS_EXTRA}"
    imagem="$REGISTRO/api:$(tag_da_imagem)"

    echo "== Build da API ($imagem) — ~15 min, quase tudo torch e pesos"
    gc builds submit "$RAIZ" --config "$RAIZ/deploy/cloudbuild-api.yaml" \
        --substitutions "_IMAGEM=$imagem,_MODELOS_REVISAO=$MODELOS_REVISAO"

    # Separador "@" nas variaveis: ALLOWED_ORIGINS tem virgulas.
    local variaveis="^@^SUPABASE_URL=$SUPABASE_URL@ALLOWED_ORIGINS=$origens"
    local segredos=()
    # So pra projeto do Supabase com o JWT secret legado (HS256); ver api/auth.py.
    if gc secrets describe SUPABASE_JWT_SECRET >/dev/null 2>&1; then
        segredos=(--set-secrets "SUPABASE_JWT_SECRET=SUPABASE_JWT_SECRET:latest")
    fi

    echo "== Deploy da API"
    # 3 GiB: o pico medido no #29 e ~2,1 GB (2 GiB daria OOM). 2 vCPUs: o CLIP
    # e o rembg usam as duas. min-instances 0: desliga sem uso (o app espera
    # acordar, #25). max-instances 2: limita o custo se alguem abusar.
    # --allow-unauthenticated: o Cloud Run nao pede login do Google; quem
    # protege e o JWT do Supabase (api/auth.py).
    gc run deploy "$API_SERVICE" --image "$imagem" --region "$REGION" \
        --memory 3Gi --cpu 2 --cpu-boost --min-instances 0 --max-instances 2 \
        --concurrency 8 --timeout 120 --allow-unauthenticated \
        --set-env-vars "$variaveis" ${segredos[@]+"${segredos[@]}"}

    local url
    url="$(url_do_servico "$API_SERVICE")"
    echo
    echo "== /health"
    # O deploy ja terminou: se a API demorar a acordar, so avisa.
    if curl -sS --max-time 120 "$url/health"; then
        echo
        echo "Confira status \"ok\", login true e os modelos match v2 / categoria clip_ajustado."
    else
        echo "AVISO: /health nao respondeu em 120 s. Tente: deploy/cloud_run.sh status" >&2
    fi
}

cmd_site() {
    : "${SUPABASE_URL:?Defina SUPABASE_URL=https://<projeto>.supabase.co}"
    : "${SUPABASE_ANON_KEY:?Defina SUPABASE_ANON_KEY=<anon key do Supabase>}"
    exige_faturamento

    local api_url imagem versao
    api_url="${API_URL:-$(url_do_servico "$API_SERVICE")}"
    versao="$(tag_da_imagem)"
    imagem="$REGISTRO/site:$versao"

    echo "== Build do site ($imagem), apontando pra API em $api_url"
    # A anon key e publica por design (o RLS protege); fica no historico do Cloud Build.
    gc builds submit "$RAIZ/mobile" --config "$RAIZ/deploy/cloudbuild-site.yaml" \
        --substitutions "_IMAGEM=$imagem,_SUPABASE_URL=$SUPABASE_URL,_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY,_API_BASE_URL=$api_url,_APP_VERSION=$versao,_FEEDBACK_URL=${FEEDBACK_URL:-}"

    echo "== Deploy do site"
    gc run deploy "$SITE_SERVICE" --image "$imagem" --region "$REGION" \
        --memory 256Mi --cpu 1 --min-instances 0 --max-instances 2 \
        --allow-unauthenticated

    local url
    url="$(url_do_servico "$SITE_SERVICE")"
    echo
    echo "Site no ar: $url"
    echo "No Supabase (Authentication -> URL Configuration):"
    echo "  Site URL:      $url"
    echo "  Redirect URLs: $url/**  e  wable://redefinir-senha"
}

cmd_status() {
    gc run services list --region "$REGION" \
        --format 'table(metadata.name, status.url, status.conditions[0].status)'
    curl -sS --max-time 120 "$(url_do_servico "$API_SERVICE")/health" && echo || true
}

case "${1:-}" in
    setup) cmd_setup ;;
    urls) cmd_urls ;;
    api) cmd_api ;;
    site) cmd_site ;;
    status) cmd_status ;;
    *)
        sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
        exit 2
        ;;
esac
