# Deploy no Google Cloud Run

API (`Dockerfile` da raiz) e site (`mobile/Dockerfile`), cada um num serviço do
Cloud Run. Tudo passa por `deploy/cloud_run.sh`. Issues: #15 (API), #17 (site),
#16 (Supabase) e o roteiro em #22.

```
site  wable-site (nginx, 256 MiB) ──JWT──▶ API  wable-api (3 GiB, 2 vCPU)
   └──────────────▶ Supabase (Auth, Postgres, Storage)
```

O build roda no **Cloud Build** (a imagem sai amd64; o Mac é ARM) e o deploy
roda da sua máquina, com a conta logada no `gcloud`.

## 0. Antes (só você pode fazer)

1. **Conta de faturamento** com cartão: <https://console.cloud.google.com/billing>.
2. **Projeto.** Recomendo um projeto só pro Wable. O `gen-lang-client-0342534290`
   foi criado pelo AI Studio para a API do Gemini, e misturar os dois deixa a
   conta e as permissões confusas:
   ```bash
   gcloud projects create wable-app-<sufixo> --name "Wable"
   gcloud billing projects link wable-app-<sufixo> --billing-account <ID da conta>
   ```
   (`gcloud billing accounts list` mostra o ID.)
3. Um **token de leitura** do Hugging Face (o repositório dos pesos é privado).

Nos comandos abaixo, `PROJECT` é o id do projeto. Uma forma prática:

```bash
export PROJECT=wable-app-<sufixo>
```

## 1. Preparar o projeto (uma vez)

```bash
deploy/cloud_run.sh setup
```

- Ativa Cloud Run, Cloud Build, Artifact Registry, Secret Manager e Budgets.
- Cria o repositório de imagens `wable` (região `us-central1`, a mais barata;
  troque com `REGION=`). Ele guarda só as **2 imagens mais novas** de cada
  serviço: a da API tem ~3 GB e o armazenamento grátis é 0,5 GB.
- Pede o token do Hugging Face sem mostrar na tela e guarda como secret
  `HF_TOKEN`. Ele só é usado no build.
- Dá à conta de serviço do Cloud Build os papéis para ler o código enviado,
  gravar log e subir a imagem (nem todo projeto novo dá isso sozinho).
- Cria o alerta de orçamento **"Wable"**: e-mail em 50%, 90% e 100% de
  `BUDGET` (padrão 5, na moeda da conta de faturamento; em reais, use algo
  como `BUDGET=30`). **O alerta avisa, mas não desliga nada.** É preciso ser
  administradora da conta de faturamento. Sem isso o script avisa e mostra o
  link para criar o alerta no console.

> O projeto `gen-lang-client-0342534290` (Gemini/AI Studio) já tem
> faturamento, numa conta que o `gcloud billing accounts list` não mostra para
> você. Funcionaria para a API, mas não daria para criar o alerta, e o custo
> do Wable se misturaria ao do Gemini. Por isso a recomendação de um projeto
> próprio.

## 2. API

```bash
# hash dos pesos atuais no Hub (precisa de `hf auth login` ou HF_TOKEN):
python -c "from huggingface_hub import HfApi; print(HfApi().model_info('sofiaomarques/outfit-matcher-modelos').sha)"

MODELOS_REVISAO=<hash> SUPABASE_URL=https://<projeto>.supabase.co deploy/cloud_run.sh api
```

- O build leva ~15 min (torch, CLIP, rembg e os pesos entram na imagem).
- Memória de **3 GiB** (o pico medido no #29 é ~2,1 GB, então 2 GiB estouraria),
  2 vCPUs, `min-instances 0` (desliga sem uso; o app espera acordar, #25) e
  `max-instances 2` (limita o custo).
- O CORS (`ALLOWED_ORIGINS`) já recebe o endereço do site, mesmo antes de ele
  existir: a URL do Cloud Run é previsível (`deploy/cloud_run.sh urls`). Um
  domínio próprio entra com `ALLOWED_ORIGINS_EXTRA=https://...`.
- Se o projeto do Supabase usar o **JWT secret legado** (HS256), crie antes o
  secret `SUPABASE_JWT_SECRET` no Secret Manager. O script monta ele na API.
  Projetos com *JWT signing keys* não precisam disso.
- No fim o script chama o `/health`: precisa vir `"status": "ok"`,
  `"login": true`, match `v2` e categoria `clip_ajustado`.

## 3. Site

```bash
SUPABASE_URL=https://<projeto>.supabase.co SUPABASE_ANON_KEY=<anon key> \
FEEDBACK_URL=<link do formulário, opcional> \
deploy/cloud_run.sh site
```

O build embute as `EXPO_PUBLIC_*` no JavaScript, então trocar qualquer uma
exige rodar `site` de novo. A anon key é pública por design (quem protege é o
RLS) e fica visível no histórico do Cloud Build.

## 4. Supabase (#16)

No painel, *Authentication → URL Configuration*:
- **Site URL**: o endereço do site (o script mostra no fim).
- **Redirect URLs**: `<site>/**` e `wable://redefinir-senha` (link de confirmação
  de e-mail e de "Esqueci minha senha", PR #44).

E rode o `supabase/schema.sql` inteiro no SQL Editor, se ainda não rodou.

## 5. Conferir

```bash
deploy/cloud_run.sh status
```

Depois: criar conta pelo site, cadastrar uma peça e gerar um look (#19).
O primeiro pedido depois de um tempo parado acorda a API: ~20–40 s com o
aviso do #25.

## Voltar uma versão

Cada deploy cria uma revisão nova. Para voltar à anterior:

```bash
gcloud run revisions list --service wable-api --region us-central1 --project $PROJECT
gcloud run services update-traffic wable-api --to-revisions <revisão>=100 \
  --region us-central1 --project $PROJECT
```

## Custo esperado

O nível gratuito do Cloud Run (por conta de faturamento, por mês) tem 180 mil
vCPU-segundos e 360 mil GiB-segundos, cobrados só enquanto há requisição. Com
2 vCPUs e 3 GiB, isso dá ~25 h de API ativa por mês. O Cloud Build tem 2.500
minutos grátis por mês. O que sobra é o armazenamento da imagem, alguns
centavos de dólar por mês.
