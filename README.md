# outfit.matcher

`outfit.matcher` é um projeto de machine learning em desenvolvimento para ajudar a escolher o melhor outfit do dia a partir de fatores como o horário e características das roupas disponíveis.

A ideia é transformar peças do guarda-roupa em dados que um modelo consiga entender, combinando informações visuais das imagens com o contexto do dia para recomendar looks de forma mais inteligente.

## O que o projeto faz hoje

- Analisa imagens de roupas salvas em `dados/roupas/`.
- Extrai as cores principal e secundária de cada peça usando KMeans.
- Classifica a categoria da roupa com CLIP, como calça, saia, vestido, camiseta, jaqueta e outras.
- Agrupa cada item por tipo: parte de cima, parte de baixo ou peça única.
- Estima o nível de estampa e formalidade da roupa.
- Gera embeddings numéricos que serão usados para treinar o modelo de recomendação.

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

## Tecnologias usadas

- Python
- PyTorch
- Transformers / CLIP
- scikit-learn
- Pillow
- NumPy

## Como testar

```bash
pip install -r requirements.txt
python testar_cores.py
```

## Status

O projeto ainda está em desenvolvimento. A etapa atual foca em extrair características visuais das roupas e criar representações numéricas para cada peça. Os próximos passos são integrar informações e treinar o modelo para recomendar combinações de outfits.
