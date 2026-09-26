"""Recomendador de looks: monta as combinacoes possiveis do guarda-roupa da
usuaria e ordena por compatibilidade + ocasiao + clima, com variedade entre
os looks do topo.

O modelo de pares (model/treinar.py) so responde "essa peca de cima combina
com essa de baixo?". O resto e responsabilidade daqui:

1. candidatos: cima + baixo e vestido sozinho, com ou sem camada por cima
   (jaqueta/casaco) — o clima decide se a camada e obrigatoria, opcional
   ou proibida;
2. filtros duros: peca que nao cabe na ocasiao/clima (ex.: short no
   trabalho, casaco no calor) tira o look da lista — se nada sobrar, os
   filtros sao relaxados e so a penalidade suave vale;
3. score = media ponderada de compatibilidade (modelo), ocasiao (CLIP:
   similaridade entre a foto de cada peca e frases como "roupa de
   escritorio") e clima (ajuste por categoria);
4. diversidade: escolha gulosa que penaliza pecas ja usadas nos looks
   anteriores, pra nao sugerir a mesma calca em todos.

Tipo (cima/baixo/unica) vem da categoria escolhida pela usuaria no app;
a categoria fina detectada pelo classificador (calca x short, jaqueta x
camiseta...) so e usada pras regras de clima/ocasiao.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from functools import lru_cache
from itertools import product
from pathlib import Path
from typing import Any

import numpy as np
import torch

from model.preparar_dados import PreparedItem, weak_compatibility
from model.treinar import DEFAULT_OUTPUT, choose_device, load_model, select_features

# Modelo v2 (model/preparar_pares_v2.py): treinado sem categoria/tipo do CLIP,
# que aqui vem da categoria escolhida pela usuaria. Sem ele, usa o v1.
CHECKPOINT_V2 = Path("model/match_model_v2.pt")


def checkpoint_padrao() -> Path:
    return CHECKPOINT_V2 if CHECKPOINT_V2.exists() else DEFAULT_OUTPUT

# Codigos de features/categoria.py.
CALCA, SHORT, SAIA, VESTIDO = 1, 2, 3, 4
TOP, CAMISETA, REGATA, JAQUETA, CASACO, BLUSA_MANGA = 5, 6, 7, 8, 9, 10
CAMADAS = {JAQUETA, CASACO}

# Vestido nao passa pelo modelo de pares (nao ha par pra pontuar). O modelo
# da ~0.99 pra quase todo par que combina; um pouco abaixo disso evita que
# todo vestido va pro topo sem enterrar os vestidos quando a ocasiao pede.
COMPATIBILIDADE_VESTIDO = 0.9
# Quanto o par (camada, baixo) pesa na compatibilidade de um look com camada.
# Baixo porque o modelo foi treinado com rotulos fracos que reprovam quase
# todo blazer com jeans (diferenca de formalidade).
PESO_CAMADA = 0.3
PESOS = {"compatibilidade": 0.55, "ocasiao": 0.3, "clima": 0.15}
PENALIDADE_REPETICAO = 0.1
# Clima que pede camada mas o look nao tem (usuaria sem jaqueta/casaco).
FATOR_SEM_CAMADA = 0.6


# Contextos que o CLIP compara com a foto de cada peca (softmax entre todos).
# Esporte e praia nao sao ocasioes do app, mas servem de "concorrentes": sem
# eles, camiseta de academia pareceria roupa de festa por eliminacao. Medido
# contra o `usage` do dataset do Kaggle, separa Formal/Sports/Party de Casual
# bem melhor que o codigo de formalidade (AUC 0.88/0.84/0.95 vs 0.79/0.55/0.74).
CONTEXTOS_CLIP = {
    "casual": "a photo of casual everyday clothing",
    "trabalho": "a photo of elegant office clothing for work",
    "festa": "a photo of glamorous clothing for a party night out",
    "encontro": "a photo of a pretty, stylish outfit for a romantic date",
    "esporte": "a photo of sportswear or gym clothing",
    "praia": "a photo of beachwear or loungewear",
}
# Probabilidade (somada nos contextos aceitos) a partir da qual a peca conta
# como 100% adequada — com 6 contextos, o dobro do acaso.
LIMIAR_OCASIAO = 2 / len(CONTEXTOS_CLIP)


@dataclass(frozen=True)
class Ocasiao:
    contextos: frozenset[str]  # chaves de CONTEXTOS_CLIP que servem pra ocasiao
    categorias_proibidas: frozenset[int] = frozenset()


@dataclass(frozen=True)
class Clima:
    camada: str  # "nunca" | "opcional" | "sempre"
    categorias_proibidas: frozenset[int] = frozenset()
    # Penalidade por categoria (multiplicador < 1); o que nao esta aqui vale 1.
    penalidades: dict[int, float] = field(default_factory=dict)


OCASIOES = {
    "casual": Ocasiao(frozenset({"casual", "esporte", "praia"})),
    "dia_a_dia": Ocasiao(frozenset({"casual", "esporte", "praia"})),
    "trabalho": Ocasiao(frozenset({"trabalho"}), frozenset({SHORT})),
    "encontro": Ocasiao(frozenset({"encontro", "festa", "casual"})),
    "festa": Ocasiao(frozenset({"festa", "encontro"})),
}

# Calor nunca gera looks com camada, entao jaqueta/casaco ja ficam de fora.
CLIMAS = {
    "calor": Clima("nunca", penalidades={BLUSA_MANGA: 0.6, CALCA: 0.85}),
    "frio": Clima(
        "sempre",
        frozenset({SHORT}),
        {REGATA: 0.7, SAIA: 0.8, VESTIDO: 0.8, JAQUETA: 0.85},
    ),
    "chuva": Clima("sempre", penalidades={SHORT: 0.6, SAIA: 0.7, VESTIDO: 0.7, CASACO: 0.9}),
}


@dataclass(frozen=True)
class Peca:
    id: str
    categoria: str  # categoria do app: top, bottom, skirt, dress, accessory
    embedding: np.ndarray  # 523 numeros de features/embedding_neural.py
    codigo: int  # categoria fina (1-10) coerente com `categoria`

    @property
    def papel(self) -> str | None:
        if self.categoria == "dress":
            return "unica"
        if self.categoria in ("bottom", "skirt"):
            return "baixo"
        if self.categoria == "top":
            return "camada" if self.codigo in CAMADAS else "cima"
        return None  # acessorio: fora dos looks por enquanto


@dataclass
class Look:
    pecas: list[Peca]
    compatibilidade: float
    ocasiao: float = 1.0
    clima: float = 1.0
    score: float = 0.0

    def como_dict(self) -> dict[str, Any]:
        return {
            "pecas": [peca.id for peca in self.pecas],
            "score": round(self.score, 4),
            "detalhes": {
                "compatibilidade": round(self.compatibilidade, 4),
                "ocasiao": round(self.ocasiao, 4),
                "clima": round(self.clima, 4),
            },
        }


def _codigo_coerente(categoria: str, codigo: int) -> int:
    """A categoria da usuaria manda; o codigo detectado so refina dentro dela
    (ex.: 'bottom' pode ser calca ou short). Se o classificador errou o grupo,
    cai num codigo neutro."""
    if categoria == "dress":
        return VESTIDO
    if categoria == "skirt":
        return SAIA
    if categoria == "bottom":
        return codigo if codigo in (CALCA, SHORT) else CALCA
    if categoria == "top":
        return codigo if TOP <= codigo <= BLUSA_MANGA else CAMISETA
    return codigo


def peca_de_features(peca_id: str, categoria: str, features: dict[str, Any]) -> Peca:
    """Monta a Peca a partir do JSON de /items/analyze (coluna `features`)."""
    embedding = np.asarray(features["embedding"], dtype=np.float32).reshape(-1)
    if embedding.size != 523 or not np.isfinite(embedding).all():
        raise ValueError(f"embedding da peca {peca_id} com {embedding.size} valores; esperado 523")
    # indice 7 do embedding: categoria/10.
    codigo = int(features.get("categoria_codigo") or round(float(embedding[7]) * 10))
    return Peca(
        id=peca_id,
        categoria=categoria,
        embedding=embedding,
        codigo=_codigo_coerente(categoria, codigo),
    )


@lru_cache(maxsize=2)
def _carregar_modelo(caminho: str, mtime: float):
    """Cache por (caminho, mtime): retreinar o modelo invalida sozinho."""
    device = choose_device("auto")
    model, checkpoint = load_model(Path(caminho), device)
    return model, checkpoint, device


def pontuar_pares(pares: list[tuple[Peca, Peca]], checkpoint_path: Path | None = None) -> list[float]:
    """Score de compatibilidade (0-1) de cada par (cima, baixo). Sem modelo
    treinado, usa a regra fraca de cor/tom/estampa/formalidade."""
    if not pares:
        return []
    checkpoint_path = checkpoint_path or checkpoint_padrao()
    if not checkpoint_path.exists():
        def item(peca: Peca, tipo: int) -> PreparedItem:
            return PreparedItem(peca.id, "", "", tipo, peca.embedding)

        return [1.0 if weak_compatibility(item(a, 3), item(b, 1)) else 0.0 for a, b in pares]

    model, checkpoint, device = _carregar_modelo(str(checkpoint_path), checkpoint_path.stat().st_mtime)
    mean = np.asarray(checkpoint["mean"], dtype=np.float32)
    std = np.asarray(checkpoint["std"], dtype=np.float32)
    emb_a = np.stack([(select_features(a.embedding, checkpoint) - mean) / std for a, _ in pares])
    emb_b = np.stack([(select_features(b.embedding, checkpoint) - mean) / std for _, b in pares])
    with torch.no_grad():
        logits = model(
            torch.from_numpy(emb_a.astype(np.float32)).to(device),
            torch.from_numpy(emb_b.astype(np.float32)).to(device),
        )
    return torch.sigmoid(logits).cpu().numpy().reshape(-1).tolist()


def _gerar_candidatos(pecas: list[Peca], clima: Clima | None) -> list[list[Peca]]:
    por_papel: dict[str, list[Peca]] = {"cima": [], "baixo": [], "unica": [], "camada": []}
    for peca in pecas:
        if peca.papel:
            por_papel[peca.papel].append(peca)

    bases = [[cima, baixo] for cima, baixo in product(por_papel["cima"], por_papel["baixo"])]
    bases += [[unica] for unica in por_papel["unica"]]

    camadas = por_papel["camada"]
    modo = clima.camada if clima else "opcional"
    if modo == "nunca" or not camadas:
        return bases
    com_camada = [base + [camada] for base in bases for camada in camadas]
    return com_camada if modo == "sempre" else bases + com_camada


@lru_cache(maxsize=1)
def _vetores_contextos() -> tuple[list[str], torch.Tensor, float]:
    """Embedding de texto (CLIP) de cada contexto, calculado uma vez so."""
    from features._clip_shared import model, processor

    nomes = list(CONTEXTOS_CLIP)
    inputs = processor(text=[CONTEXTOS_CLIP[n] for n in nomes], return_tensors="pt", padding=True)
    with torch.no_grad():
        saida = model.get_text_features(**inputs)
        escala = model.logit_scale.exp().item()
    saida = getattr(saida, "pooler_output", saida).float()
    return nomes, saida / saida.norm(dim=-1, keepdim=True), escala


def probabilidades_contextos(embeddings: np.ndarray) -> dict[str, np.ndarray]:
    """Probabilidade de cada contexto de CONTEXTOS_CLIP (softmax entre eles)
    para embeddings de 523 numeros, usando o vetor CLIP da foto que ja esta
    no embedding (indices 11-522) — sem rodar o CLIP na imagem."""
    nomes, textos, escala = _vetores_contextos()
    imagens = torch.from_numpy(np.asarray(embeddings, dtype=np.float32).reshape(-1, 523)[:, 11:])
    imagens = imagens / imagens.norm(dim=-1, keepdim=True)
    probs = (escala * imagens @ textos.T).softmax(dim=-1).numpy()
    return {nome: probs[:, i] for i, nome in enumerate(nomes)}


def _ajustes_ocasiao(pecas: list[Peca], ocasiao: Ocasiao) -> dict[str, float]:
    """Adequacao (0-1) de cada peca a ocasiao (soma das probabilidades dos
    contextos que servem pra ela)."""
    nomes = list(CONTEXTOS_CLIP)
    por_contexto = probabilidades_contextos(np.stack([p.embedding for p in pecas]))
    probs = np.stack([por_contexto[n] for n in nomes], axis=1)
    colunas = [nomes.index(c) for c in ocasiao.contextos]
    aceitos = probs[:, colunas].sum(axis=1)
    return {p.id: min(1.0, float(a) / LIMIAR_OCASIAO) for p, a in zip(pecas, aceitos)}


def _ajuste_clima(look: list[Peca], clima: Clima) -> float:
    fator = float(np.prod([clima.penalidades.get(p.codigo, 1.0) for p in look]))
    if clima.camada == "sempre" and not any(p.papel == "camada" for p in look):
        fator *= FATOR_SEM_CAMADA
    return fator


def _permitido(look: list[Peca], ocasiao: Ocasiao | None, clima: Clima | None) -> bool:
    for peca in look:
        if ocasiao and peca.codigo in ocasiao.categorias_proibidas:
            return False
        if clima and peca.codigo in clima.categorias_proibidas:
            return False
    return True


def _compatibilidades(candidatos: list[list[Peca]], checkpoint_path: Path | None) -> list[float]:
    """Score do par (cima, baixo); com camada, mistura o par (camada, baixo)
    com peso PESO_CAMADA. Cada par unico passa pelo modelo uma vez so."""
    pares: dict[tuple[str, str], tuple[Peca, Peca]] = {}
    for look in candidatos:
        baixo = next((p for p in look if p.papel == "baixo"), None)
        if baixo is None:
            continue
        for peca in look:
            if peca.papel in ("cima", "camada"):
                pares[(peca.id, baixo.id)] = (peca, baixo)

    chaves = list(pares)
    scores = dict(zip(chaves, pontuar_pares([pares[c] for c in chaves], checkpoint_path)))

    resultado = []
    for look in candidatos:
        baixo = next((p for p in look if p.papel == "baixo"), None)
        if baixo is None:
            resultado.append(COMPATIBILIDADE_VESTIDO)
        else:
            cima = next(p for p in look if p.papel == "cima")
            camada = next((p for p in look if p.papel == "camada"), None)
            compat = scores[(cima.id, baixo.id)]
            if camada is not None:
                compat = (1 - PESO_CAMADA) * compat + PESO_CAMADA * scores[(camada.id, baixo.id)]
            resultado.append(compat)
    return resultado


def _escolher_com_diversidade(looks: list[Look], top_k: int) -> list[Look]:
    restantes = sorted(looks, key=lambda look: look.score, reverse=True)
    escolhidos: list[Look] = []
    uso: Counter[str] = Counter()
    while restantes and len(escolhidos) < top_k:
        melhor = max(
            restantes,
            key=lambda look: look.score - PENALIDADE_REPETICAO * sum(uso[p.id] for p in look.pecas),
        )
        restantes.remove(melhor)
        escolhidos.append(melhor)
        uso.update(p.id for p in melhor.pecas)
    return escolhidos


def recomendar(
    pecas: list[Peca],
    ocasiao: str | None = None,
    clima: str | None = None,
    top_k: int = 12,
    checkpoint_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Devolve ate `top_k` looks como {"pecas": [ids], "score", "detalhes"},
    na ordem em que devem ser mostrados."""
    regra_ocasiao = OCASIOES[ocasiao] if ocasiao else None
    regra_clima = CLIMAS[clima] if clima else None

    candidatos = _gerar_candidatos(pecas, regra_clima)
    permitidos = [look for look in candidatos if _permitido(look, regra_ocasiao, regra_clima)]
    # Guarda-roupa pequeno pode nao ter nada que passe nos filtros duros:
    # melhor sugerir o menos ruim (com penalidade) do que nada.
    candidatos = permitidos or candidatos
    if not candidatos:
        return []

    pesos = {"compatibilidade": PESOS["compatibilidade"]}
    if regra_ocasiao:
        pesos["ocasiao"] = PESOS["ocasiao"]
    if regra_clima:
        pesos["clima"] = PESOS["clima"]
    total = sum(pesos.values())

    ajuste_por_peca = _ajustes_ocasiao(pecas, regra_ocasiao) if regra_ocasiao else {}
    looks = []
    for look_pecas, compat in zip(candidatos, _compatibilidades(candidatos, checkpoint_path)):
        look = Look(pecas=look_pecas, compatibilidade=compat)
        if regra_ocasiao:
            look.ocasiao = float(np.mean([ajuste_por_peca[p.id] for p in look_pecas]))
        if regra_clima:
            look.clima = _ajuste_clima(look_pecas, regra_clima)
        look.score = sum(getattr(look, nome) * peso for nome, peso in pesos.items()) / total
        looks.append(look)

    return [look.como_dict() for look in _escolher_com_diversidade(looks, top_k)]
