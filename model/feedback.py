"""Feedback da usuaria como sinal pro recomendador (model/recomendar.py):
looks favoritados, rejeitados ("Nao curti") e usados ("Usei hoje"), que o
app guarda no Supabase (outfit_favorites, outfit_rejections, outfit_wears).

- Rejeitado: o look exato some, mas so na ocasiao em que foi rejeitado
  ("nao e pra trabalho" nao e "nao gosto"); rejeicao sem ocasiao vale sempre.
- Pares: cada par de pecas de um look favoritado ganha +1 e de um look
  rejeitado (na mesma ocasiao) perde 1. Um look novo que repete esses pares
  herda o sinal — generaliza pra combinacoes que a usuaria ainda nao viu.
- Usado: look usado ha poucos dias perde pontos, mais quanto mais recente,
  pra nao sugerir o que ela vestiu ontem.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from itertools import combinations

PESO_AFINIDADE = 0.1
# Os scores dos melhores looks ficam muito proximos (e a diversidade empurra
# pro fim quem perde a vez), entao o peso decide na pratica em quantos dias um
# look usado volta ao topo. Escolha da usuaria: ~2-3 dias. Medido num
# guarda-roupa de teste (trabalho): 0.03 -> volta no 3o dia; 0.05 -> 4o-5o;
# 0.3 -> so no 7o.
PESO_USO = 0.03
DIAS_SEM_REPETIR = 7
# Saldo de um par (favoritos - rejeicoes) a partir do qual o sinal satura.
SALDO_MAXIMO = 2


@dataclass(frozen=True)
class Feedback:
    favoritos: list[frozenset[str]] = field(default_factory=list)
    rejeitados: list[tuple[frozenset[str], str | None]] = field(default_factory=list)  # (pecas, ocasiao)
    usos: list[tuple[frozenset[str], int]] = field(default_factory=list)  # (pecas, dias desde o uso)

    @classmethod
    def de_dict(cls, dados: dict) -> Feedback:
        """Formato do JSON de /looks/recommend (ver api/main.py)."""
        return cls(
            favoritos=[frozenset(ids) for ids in dados.get("favoritos", [])],
            rejeitados=[(frozenset(r["pecas"]), r.get("ocasiao")) for r in dados.get("rejeitados", [])],
            usos=[(frozenset(u["pecas"]), int(u["dias"])) for u in dados.get("usos", [])],
        )


def _pares(ids: frozenset[str]) -> list[frozenset[str]]:
    return [frozenset(par) for par in combinations(sorted(ids), 2)]


class AjusteFeedback:
    """Pre-calcula o feedback pra uma ocasiao e ajusta cada look candidato."""

    def __init__(self, feedback: Feedback, ocasiao: str | None):
        rejeitados_aqui = [ids for ids, oc in feedback.rejeitados if oc is None or oc == ocasiao]
        self._rejeitados = set(rejeitados_aqui)
        self._saldo_pares: Counter[frozenset[str]] = Counter()
        for ids in feedback.favoritos:
            self._saldo_pares.update(_pares(ids))
        for ids in rejeitados_aqui:
            self._saldo_pares.subtract(_pares(ids))
        self._dias_desde_uso: dict[frozenset[str], int] = {}
        for ids, dias in feedback.usos:
            self._dias_desde_uso[ids] = min(dias, self._dias_desde_uso.get(ids, dias))

    def rejeitado(self, ids: frozenset[str]) -> bool:
        return ids in self._rejeitados

    def afinidade(self, ids: frozenset[str]) -> float:
        """Media do saldo dos pares do look, em [-1, 1]; 0 sem historico."""
        pares = _pares(ids)
        if not pares:
            return 0.0
        saldos = [max(-SALDO_MAXIMO, min(SALDO_MAXIMO, self._saldo_pares[p])) for p in pares]
        return sum(saldos) / (len(saldos) * SALDO_MAXIMO)

    def uso_recente(self, ids: frozenset[str]) -> float:
        """1 se foi usado hoje, caindo ate 0 em DIAS_SEM_REPETIR dias."""
        dias = self._dias_desde_uso.get(ids)
        if dias is None or dias >= DIAS_SEM_REPETIR:
            return 0.0
        return 1 - max(dias, 0) / DIAS_SEM_REPETIR

    def ajuste(self, ids: frozenset[str]) -> float:
        """Quanto somar ao score do look."""
        return PESO_AFINIDADE * self.afinidade(ids) - PESO_USO * self.uso_recente(ids)
