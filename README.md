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
│   └── treinar.py           # treina o modelo de match
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
```

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

## 👩‍💻 Autora

Sofia de Oliveira Marques  
Projeto universitário — Machine Learning aplicado à moda <3
