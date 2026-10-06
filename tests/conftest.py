import os
from pathlib import Path

# A API e os testes leem tudo por caminho relativo a raiz (model/*.pt,
# tests/fixtures, app/lib): roda da raiz mesmo chamado de outra pasta (ex.: IDE
# com cwd em tests/). Senao os modelos "somem" e os testes do Dart pulam.
os.chdir(Path(__file__).resolve().parents[1])
