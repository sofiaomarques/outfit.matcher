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

## Estrutura principal

```text
features/
  cores.py              # extração de cores e tonalidade
  categoria.py          # classificação da categoria da roupa
  tipo.py               # agrupamento por tipo de peça
  estampa.py            # classificação do nível de estampa
  formalidade.py        # classificação de formalidade
  embedding.py          # embedding manual com features extraídas
  embedding_neural.py   # embedding manual + representação neural do CLIP

dados/roupas/           # imagens usadas nos testes
testar_cores.py         # script simples para testar a extração de cores
```

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
