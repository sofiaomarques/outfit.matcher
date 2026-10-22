# 👗 Outfit Matcher

Sistema de recomendação de outfits baseado em Machine Learning que analisa peças de roupa e sugere combinações compatíveis com base em features visuais extraídas automaticamente.

---

## 🎯 Objetivo

Dado um conjunto de imagens de roupas, o sistema extrai features visuais de cada peça e aprende a identificar quais peças combinam entre si, gerando um score de compatibilidade de 0 a 1.

---

## 🧠 Como funciona

### Extração de Features

Cada imagem de roupa passa por um pipeline de extração que gera um **feature vector normalizado** com 11 dimensões:

| Feature | Método | Valores |
|---|---|---|
| Cor principal (R, G, B) | K-Means | 0 a 1 |
| Cor secundária (R, G, B) | K-Means | 0 a 1 |
| Tonalidade | Brilho médio | 0=claro, 1=médio, 2=escuro |
| Categoria | CLIP zero-shot | 1 a 10 |
| Tipo | Derivado da categoria | 1=baixo, 2=único, 3=cima |
| Estampa | CLIP zero-shot | 0=nenhuma, 1=pouca, 2=muita |
| Formalidade | CLIP zero-shot | 0=informal, 1=casual, 2=formal, 3=muito formal |

### Tabela de Categorias

| Código | Categoria |
|---|---|
| 1 | Calça |
| 2 | Short |
| 3 | Saia |
| 4 | Vestido |
| 5 | Top |
| 6 | Camiseta |
| 7 | Regata |
| 8 | Jaqueta |
| 9 | Casaco |
| 10 | Blusa de manga |

### Pipeline completo

```
imagem
  ├── rembg          → remove o fundo
  ├── K-Means        → extrai cor principal e secundária
  └── CLIP           → classifica categoria, estampa e formalidade
          ↓
  feature vector (11 números normalizados)
          ↓
  modelo ML compara dois vetores
          ↓
  score de compatibilidade (0 a 1)
```

---

## 📁 Estrutura do projeto

```
outfit.matcher/
│
├── dados/
│   ├── roupas/              # imagens de teste
│   └── fashion-dataset/     # dataset Fashion Product Images (Kaggle)
│       ├── images/
│       └── styles.csv
│
├── features/
│   ├── cores.py             # extrai cor principal, secundária e tonalidade
│   ├── categoria.py         # classifica categoria com CLIP
│   ├── tipo.py              # classifica tipo (cima, baixo, único)
│   ├── estampa.py           # classifica estampa
│   ├── formalidade.py       # classifica formalidade
│   ├── embedding.py         # gera feature vector manual (11 números)
│   └── embedding_neural.py  # gera feature vector híbrido (523 números)
│
├── model/
│   ├── preparar_dados.py    # lê dataset e cria pares de roupas
│   ├── treinar.py           # treina o modelo de match
│   └── recomendar.py        # monta e ordena looks (modelo + ocasião + clima)
│
├── api/main.py              # API FastAPI usada pelo app
│
├── scripts/
│   ├── baixar_modelos.py    # baixa os pesos (.pt) do Hugging Face Hub
│   └── subir_modelos.py     # envia os pesos depois de um retreino
│
├── app/                     # interface em Flutter (web + iOS + Android)
│
├── main.py
├── requirements.txt
└── README.md
```

---

## ⚙️ Instalação

### Requisitos

- Python 3.10+
- pip

### Passos

```bash
# clone o repositório
git clone https://github.com/sofiaomarques/outfit.matcher.git
cd outfit.matcher

# crie e ative o ambiente virtual
python3 -m venv venv
source venv/bin/activate  # Mac/Linux
venv\Scripts\activate     # Windows

# instale as dependências
pip install -r requirements.txt

# baixe os pesos dos modelos (ficam fora do git)
python scripts/baixar_modelos.py
```

### Pesos dos modelos

Os `.pt` não vão pro git: ficam no repositório de modelo
[`sofiaomarques/outfit-matcher-modelos`](https://huggingface.co/sofiaomarques/outfit-matcher-modelos)
no Hugging Face Hub (privado: precisa de `hf auth login` ou da variável `HF_TOKEN` pra baixar).

| Arquivo | Usado em |
|---|---|
| `model/match_model_v2.pt` | `model/recomendar.py` (`/looks/recommend`) |
| `model/clip_categoria.pt` | `features/categoria.py` (`/items/analyze`) |
| `model/categoria_model.pt` | fallback de `features/categoria.py` |

`scripts/baixar_modelos.py` só baixa o que falta em `model/`; `--atualizar`
baixa de novo. Se algum faltar, a API sobe mesmo assim mas usa um modelo pior
e mostra um `UserWarning` no log.

Variáveis de ambiente opcionais:

- `MODELOS_REPO` — outro repositório no Hub.
- `HF_TOKEN` — token de leitura do Hugging Face, pra baixar sem `hf auth login` (ex.: no deploy).
- `MODELOS_REVISAO` — branch, tag ou hash de commit (padrão `main`). Em
  produção, fixe num hash pra que um envio novo não troque o modelo sem deploy.

#### Depois de um retreino

```bash
hf auth login   # uma vez, com um token de escrita
python scripts/subir_modelos.py match_model_v2.pt -m "Retreino com X"
```

Sem argumentos envia os três. O repositório é criado privado; `--publico` cria público. Todos os arquivos vão num único commit no Hub;
o script imprime o hash dele, que é o valor pra `MODELOS_REVISAO`.

### Docker (API)

A imagem baixa tudo no build (pesos `.pt`, CLIP e os modelos do rembg), então
a primeira requisição não baixa nada. Como o repositório de pesos é privado, o
token de leitura entra como secret do BuildKit (não fica em nenhuma camada):

```bash
HF_TOKEN=hf_... docker build --secret id=HF_TOKEN \
  --build-arg MODELOS_REVISAO=<hash do commit no Hub> -t outfit-api .
docker run --rm -p 8000:7860 -e SUPABASE_URL=https://SEU-PROJETO.supabase.co outfit-api
```

- `MODELOS_REVISAO` é obrigatório e tem que ser um hash de commit (40
  caracteres), não `main`: com um nome de branch, o Docker reaproveitaria a
  camada dos pesos do cache e um envio novo nunca entraria na imagem. O
  `subir_modelos.py` imprime o hash; pra pegar o atual:
  `python -c "from huggingface_hub import HfApi; print(HfApi().model_info('sofiaomarques/outfit-matcher-modelos').sha)"`.
- A porta vem de `$PORT`, padrão 7860 (a que o Hugging Face Spaces espera). O
  app procura a API em `localhost:8000`, daí o `-p 8000:7860`.
- `curl localhost:8000/health` mostra a revisão dos pesos e os modelos que
  carregaram; `"status": "degradado"` quando algum não é o de produção.

---

## 🚀 Como usar

### Extrair features de uma imagem

```python
from features.embedding import gerar_embedding

resultado = gerar_embedding('dados/roupas/camiseta.jpg')
print(resultado['embedding'])   # vetor de 11 números
print(resultado['detalhes'])    # features legíveis
```

### Gerar embedding híbrido (manual + CLIP neural)

```python
from features.embedding_neural import gerar_embedding_completo

resultado = gerar_embedding_completo('dados/roupas/camiseta.jpg')
print(resultado['embedding'])   # vetor de 523 números
print(resultado['tamanho'])     # 523
```

### Preparar dataset para treino

```bash
source .venv/bin/activate
python3 -m pip install -r requirements.txt

PYTHONPATH=. python3 model/preparar_dados.py \
  --max-items 2000 \
  --items-per-article-type 100 \
  --max-pairs 12000
```

O script usa somente `masterCategory == 'Apparel'`, seleciona no maximo 2.000 roupas,
calcula embeddings de 523 numeros e salva:

```text
dados/styles_resumido.csv
dados/embeddings_resumidos.npz
dados/pares_outfits.npz
```

### Criar uma copia limpa do dataset

O dataset original e preservado. Para criar uma copia contendo somente produtos
de `masterCategory == 'Apparel'`, rode:

```bash
PYTHONPATH=. python3 model/limpar_dataset.py
```

A copia sera criada em `dados/fashion-dataset-roupas/`, com `styles.csv` e
`images/`. O comando copia 21.392 roupas e remove do conjunto limpo categorias
como acessorios, calcados e cuidados pessoais. O dataset original nao e apagado.

Para usar a copia limpa na preparacao:

```bash
PYTHONPATH=. python3 model/preparar_dados.py \
  --dataset-dir dados/fashion-dataset-roupas \
  --max-items 2000 \
  --items-per-article-type 100 \
  --max-pairs 12000
```

Para apagar permanentemente imagens que nao sao roupas, acrescente
`--delete-non-clothing-images` ao comando. Para apagar tambem roupas fora da
amostra, acrescente `--delete-images-not-sampled`.

### Treinar o modelo

```bash
PYTHONPATH=. python3 model/treinar.py \
  --pairs dados/pares_outfits.npz \
  --epochs 25 \
  --batch-size 256 \
  --device auto
```

O melhor modelo sera salvo em `model/match_model.pt` e o historico em
`model/historico_treino.csv`.

### Gerar looks a partir de fotos

```bash
PYTHONPATH=. python3 main.py foto1.jpg foto2.jpg foto3.jpg --ocasiao trabalho --clima frio
```

---

## 🧩 Recomendação de looks

O modelo só responde "essa peça de cima combina com essa de baixo?". O
recomendador (`model/recomendar.py`) monta os looks em cima disso:

1. **Candidatos** — cima + baixo e vestido sozinho, com ou sem camada
   (jaqueta/casaco). Cima/baixo vem da categoria que a usuária escolhe no app;
   a categoria fina detectada (calça x short, jaqueta x camiseta) só entra nas
   regras de clima.
2. **Filtros** — clima frio exclui short; calor não gera camada; trabalho
   exclui short. Se nada sobrar, os filtros viram só penalidade.
3. **Score** — média ponderada de compatibilidade (modelo, 55%), ocasião
   (30%) e clima (15%). A ocasião compara o vetor CLIP da foto com frases como
   "roupa elegante de escritório", sem rodar o CLIP de novo.
4. **Diversidade** — escolha gulosa que penaliza peças já usadas nos looks
   anteriores.

Ocasiões: `casual`, `dia_a_dia`, `trabalho`, `encontro`, `festa`.
Climas: `calor`, `frio`, `chuva`.

### API

```bash
SUPABASE_URL=https://SEU-PROJETO.supabase.co PYTHONPATH=. .venv/bin/uvicorn api.main:app --reload
```

| Endpoint | O que faz |
|---|---|
| `GET /health` | `versao_features`, revisão dos pesos e quais modelos carregaram (em produção: match `v2`, categoria `clip_ajustado`) e se o login está ligado; senão `status: "degradado"`. Aberto, sem login |
| `POST /items/crop` | recorta a peça da foto (PNG transparente) |
| `POST /items/analyze` | cor, categoria, estampa, formalidade e embedding de 523 números |
| `POST /looks/recommend` | recebe as peças com features + ocasião/clima e devolve os looks |

A API é pública, então tudo menos o `/health` exige
`Authorization: Bearer <access token da sessão do Supabase>` (o app manda
sozinho) e responde 401 sem ele, antes de ler o corpo da requisição. Limites:
corpo de até 12 MB e foto de até 10 MB / 25 megapixels (413), e até 300 peças
por `/looks/recommend` (422).

| Variável | Pra quê |
|---|---|
| `SUPABASE_URL` | projeto que emite os tokens; as chaves públicas vêm de `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`. Obrigatória: sem ela (nem `API_SEM_AUTH`), a API não sobe |
| `SUPABASE_JWT_SECRET` | só se o projeto usa o JWT secret legado (HS256) |
| `ALLOWED_ORIGINS` | domínios do site, separados por vírgula (ex.: `https://wable.app`). Sem ela, o CORS libera só `localhost` |
| `API_SEM_AUTH=1` | desliga o login; só pra dev local e testes |

### Testes

Testam o contrato entre o app e a API: o formato que o app manda e espera
receber, que as constantes repetidas no Dart (`featuresVersion`, ocasiões,
climas, categorias) batem com as do Python, e que a API está com os modelos de
produção (precisa dos pesos baixados). Rode da raiz do repo:

```bash
pip install -r requirements-dev.txt
python -m pytest
```

O guarda-roupa de teste (`tests/fixtures/guarda_roupa.json`) é a saída real de
`/items/analyze`. Quando `VERSAO_FEATURES` mudar, gere de novo com
`PYTHONPATH=. python tests/gerar_fixture.py` (precisa de `dados/validacao_real/`
e da cópia limpa do Kaggle).

---

## 📦 Dependências principais

| Biblioteca | Uso |
|---|---|
| `torch` | base para rodar modelos de ML |
| `transformers` | acesso ao modelo CLIP |
| `Pillow` | abertura e manipulação de imagens |
| `scikit-learn` | K-Means para extração de cores |
| `numpy` | manipulação de vetores |
| `rembg` | remoção de fundo das imagens |
| `pandas` | leitura e manipulação do dataset |

---

## 📊 Dataset

O projeto usa o **Fashion Product Images (Small)** disponível no Kaggle:
- 44.441 imagens de produtos de moda
- Arquivo `styles.csv` com metadados (categoria, cor, gênero, ocasião)
- Filtrado para usar apenas `masterCategory == 'Apparel'`

---

## 🔬 Modelo

O sistema usa uma abordagem **híbrida**:

- **Features manuais** — extraídas com K-Means e CLIP zero-shot, representam regras de moda (harmonia de cores, formalidade, estampa)
- **Embedding neural** — gerado pelo encoder visual do CLIP (512 dimensões), captura características visuais gerais

Os dois são concatenados em um vetor de **523 dimensões** que representa cada peça. O modelo ML aprende a comparar dois vetores e gerar um score de compatibilidade.

---

## 📱 Interface

A interface (web + iOS + Android) está sendo migrada de Flutter ([`app/`](app/))
para Expo/React Native em [`mobile/`](mobile/README.md), que também gera o site
(imagem pro Cloud Run em `mobile/Dockerfile`). Enquanto a migração não termina,
o Flutter segue como referência.
O guarda-roupa fica no Supabase; a análise das fotos e as sugestões de look
vêm da API acima — veja [`app/README.md`](app/README.md) pra rodar.

---

## 👩‍💻 Autora

Sofia de Oliveira Marques  
Projeto universitário — Machine Learning aplicado à moda <3
