"""Constantes que o app e a API (Python) precisam ter iguais. Mudar um lado e
esquecer o outro so apareceria em producao: o app mandaria uma ocasiao que a
API recusa com 422, ou nao reanalisaria pecas antigas.

Confere os dois apps enquanto os dois existirem: o Expo (`mobile/`, que vai
pro ar) e o Flutter (`app/`, em migracao). Cada um pula sozinho se a pasta
nao estiver aqui (ex.: dentro do container da API)."""

from __future__ import annotations

import re
import typing
from dataclasses import dataclass
from pathlib import Path

import pytest

from api.main import PecaGuardaRoupa
from features.embedding_neural import VERSAO_FEATURES
from model.recomendar import CLIMAS, OCASIOES


@dataclass(frozen=True)
class App:
    nome: str
    servico: Path
    categorias: Path
    versao: str  # regex com um grupo: o numero da versao das features
    ocasioes: str  # nome da constante com o mapa rotulo -> chave
    climas: str

    def mapa(self, nome: str) -> dict[str, str]:
        """Le o mapa `nome = { rotulo: 'chave', ... }`. No Dart os rotulos
        vem entre aspas; no TypeScript, so os que tem espaco."""
        bloco = re.search(rf"{nome}\b[^=]*=\s*\{{(.*?)\}};", self.servico.read_text(), re.S)
        assert bloco, f"{nome} nao encontrado em {self.servico}"
        pares = re.findall(r"(?:'([^']*)'|(\w+))\s*:\s*'([^']*)'", bloco.group(1))
        return {aspas or nu: chave for aspas, nu, chave in pares}

    def categorias_do_app(self) -> set[str]:
        texto = self.categorias.read_text()
        if self.categorias.suffix == ".dart":
            enum = re.search(r"enum ClothingCategory\s*\{(.*?);", texto, re.S)
            assert enum, f"enum ClothingCategory nao encontrado em {self.categorias}"
            return set(re.findall(r"^\s*(\w+)\(", enum.group(1), re.M))
        lista = re.search(r"CLOTHING_CATEGORIES\s*=\s*\[(.*?)\]", texto, re.S)
        assert lista, f"CLOTHING_CATEGORIES nao encontrado em {self.categorias}"
        return set(re.findall(r"'([^']*)'", lista.group(1)))


APPS = [
    App(
        nome="expo",
        servico=Path("mobile/src/services/recommendation.ts"),
        categorias=Path("mobile/src/models/clothingCategory.ts"),
        versao=r"FEATURES_VERSION\s*=\s*(\d+)",
        ocasioes="occasionKeys",
        climas="weatherKeys",
    ),
    App(
        nome="flutter",
        servico=Path("app/lib/services/recommendation_service.dart"),
        categorias=Path("app/lib/models/clothing_category.dart"),
        versao=r"featuresVersion\s*=\s*(\d+)",
        ocasioes="occasionKeys",
        climas="weatherKeys",
    ),
]


@pytest.fixture(params=APPS, ids=lambda a: a.nome)
def app_cliente(request) -> App:
    app: App = request.param
    if not app.servico.exists():
        pytest.skip(f"{app.servico.parent.parts[0]}/ fora daqui (ex.: dentro do container)")
    return app


def test_versao_das_features(app_cliente: App):
    versao = re.search(app_cliente.versao, app_cliente.servico.read_text())
    assert versao, f"versao das features nao encontrada em {app_cliente.servico}"
    assert int(versao.group(1)) == VERSAO_FEATURES


def test_ocasioes(app_cliente: App):
    assert set(app_cliente.mapa(app_cliente.ocasioes).values()) == set(OCASIOES)


def test_climas(app_cliente: App):
    assert set(app_cliente.mapa(app_cliente.climas).values()) == set(CLIMAS)


def test_categorias(app_cliente: App):
    api = set(typing.get_args(PecaGuardaRoupa.model_fields["categoria"].annotation))
    assert app_cliente.categorias_do_app() == api
