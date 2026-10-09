import os
from pathlib import Path

# A API e os testes leem tudo por caminho relativo a raiz (model/*.pt,
# tests/fixtures, app/lib): roda da raiz mesmo chamado de outra pasta (ex.: IDE
# com cwd em tests/). Senao os modelos "somem" e os testes do Dart pulam.
os.chdir(Path(__file__).resolve().parents[1])

# Os testes do contrato chamam a API sem login; o login tem os testes dele
# (test_protecao.py), que ligam a checagem com chaves geradas na hora.
os.environ.setdefault("API_SEM_AUTH", "1")
