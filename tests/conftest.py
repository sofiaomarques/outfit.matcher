import os
from pathlib import Path

import pytest

# A API e os testes leem tudo por caminho relativo a raiz (model/*.pt,
# tests/fixtures, app/lib): roda da raiz mesmo chamado de outra pasta (ex.: IDE
# com cwd em tests/). Senao os modelos "somem" e os testes do Dart pulam.
os.chdir(Path(__file__).resolve().parents[1])

# Os testes do contrato chamam a API sem login; o login tem os testes dele
# (test_protecao.py), que ligam a checagem com chaves geradas na hora.
os.environ.setdefault("API_SEM_AUTH", "1")


@pytest.fixture
def linhas_de_uso():
    """As linhas do registro de uso (api/uso.py), ja como dict. O logger nao
    propaga pro root, entao o caplog nao ve: captura direto nele."""
    import json
    import logging

    linhas: list[dict] = []

    class Captura(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            linhas.append(json.loads(record.getMessage()))

    logger = logging.getLogger("wable.uso")
    handler = Captura()
    logger.addHandler(handler)
    yield linhas
    logger.removeHandler(handler)
