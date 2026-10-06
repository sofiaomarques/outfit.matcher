"""Constantes que o app (Dart) e a API (Python) precisam ter iguais. Mudar
um lado e esquecer o outro so apareceria em producao: o app mandaria uma
ocasiao que a API recusa com 422, ou nao reanalisaria pecas antigas."""

from __future__ import annotations

import re
import typing
from pathlib import Path

import pytest

from api.main import PecaGuardaRoupa
from features.embedding_neural import VERSAO_FEATURES
from model.recomendar import CLIMAS, OCASIOES

SERVICO = Path("app/lib/services/recommendation_service.dart")
CATEGORIAS = Path("app/lib/models/clothing_category.dart")

pytestmark = pytest.mark.skipif(not SERVICO.exists(), reason="app/ fora daqui (ex.: dentro do container)")


def _mapa_dart(nome: str) -> dict[str, str]:
    """Le `const Map<String, String> nome = {'Rotulo': 'chave', ...};`."""
    bloco = re.search(rf"{nome}\s*=\s*\{{(.*?)\}};", SERVICO.read_text(), re.S)
    assert bloco, f"{nome} nao encontrado em {SERVICO}"
    return dict(re.findall(r"'([^']*)'\s*:\s*'([^']*)'", bloco.group(1)))


def test_versao_das_features():
    versao = re.search(r"featuresVersion\s*=\s*(\d+)", SERVICO.read_text())
    assert versao, f"featuresVersion nao encontrado em {SERVICO}"
    assert int(versao.group(1)) == VERSAO_FEATURES


def test_ocasioes():
    assert set(_mapa_dart("occasionKeys").values()) == set(OCASIOES)


def test_climas():
    assert set(_mapa_dart("weatherKeys").values()) == set(CLIMAS)


def test_categorias():
    enum = re.search(r"enum ClothingCategory\s*\{(.*?);", CATEGORIAS.read_text(), re.S)
    assert enum, f"enum ClothingCategory nao encontrado em {CATEGORIAS}"
    dart = set(re.findall(r"^\s*(\w+)\(", enum.group(1), re.M))
    api = set(typing.get_args(PecaGuardaRoupa.model_fields["categoria"].annotation))
    assert dart == api
