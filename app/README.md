# outfit_matcher (app)

Interface do Outfit Matcher em Flutter (web + iOS + Android), construída
a partir do mockup do projeto. O **guarda-roupa** (peças cadastradas pelo
usuário) fica no Supabase — ver [`../supabase/schema.sql`](../supabase/schema.sql).
A análise das fotos e os **looks sugeridos** ("Novo look", "Seus looks") vêm
da API Python ([`../api/main.py`](../api/main.py)), que roda o recomendador
em [`../model/recomendar.py`](../model/recomendar.py).

## Configurando o Supabase

O app precisa de um projeto Supabase (banco Postgres + storage de arquivos
+ autenticação) pra funcionar de verdade:

1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. No SQL Editor do projeto, rode o conteúdo de
   [`../supabase/schema.sql`](../supabase/schema.sql) — isso cria as
   tabelas (`clothing_items`, `wishlist_items`, `outfit_favorites`,
   `outfit_wears`), as políticas de Row Level Security e os buckets
   privados de fotos. Se o projeto já tinha rodado uma versão anterior do
   script, rode só a parte nova (os `create policy` falham se repetidos).
3. Em Project Settings > API, copie a **Project URL** e a **anon/public
   key**.
4. Ative "Confirm email" em Authentication > Providers > Email se quiser
   confirmação por e-mail no cadastro (fica ligado por padrão).

## Rodando

```bash
flutter pub get

flutter run -d chrome \
  --dart-define=SUPABASE_URL=https://SEU-PROJETO.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=SUA_ANON_KEY
```

Sem essas duas variáveis o app sobe mostrando uma tela avisando que a
configuração está ausente, sem quebrar.

Em outro terminal, na raiz do repositório, suba a API (recorte, análise das
fotos e sugestão de looks). O app procura em `http://localhost:8000`; pra
outro endereço, passe `--dart-define=API_BASE_URL=...`.

```bash
PYTHONPATH=. .venv/bin/uvicorn api.main:app --reload
```

## Estrutura

- `lib/theme/` — paleta de cores e tipografia
- `lib/models/` — `ClothingItem`, `Outfit`, categorias
- `lib/repositories/` — acesso ao Supabase: guarda-roupa, wishlist e
  histórico de looks (`OutfitHistoryRepository`)
- `lib/services/` — configuração do Supabase e da API, análise de fotos
  (`GarmentAnalysisService`), sugestão de looks (`RecommendationService`) e
  favoritos/uso dos looks compartilhados entre as telas (`OutfitHistory`)
- `lib/widgets/` — componentes reutilizáveis (nav, cards, peça, estrela decorativa)
- `lib/screens/` — telas (boas-vindas, login/cadastro, guarda-roupa, nova peça, looks, detalhe do look)

## Guarda-roupa: como funciona hoje

- Login/cadastro por e-mail e senha (Supabase Auth); cada usuário só
  enxerga as próprias peças (Row Level Security).
- O botão "+" em "Meu guarda-roupa" abre a tela de nova peça: escolher
  foto (câmera ou galeria), nome e categoria, e salvar.
- A foto vai pro bucket `clothing-images` (privado, uma pasta por
  usuário) e os metadados pra tabela `clothing_items`.
- Ao escolher a foto, a API recorta a peça (`/items/crop`) e, em paralelo,
  analisa a foto original (`/items/analyze`): cor real, categoria
  detectada, formalidade e o embedding usado pelo recomendador, salvos na
  coluna `features`. A categoria que vale é a escolhida pelo usuário.
- Peças salvas com a API fora do ar (ou antes dessa análise existir) ficam
  com `features` nulo e são analisadas na próxima vez que "Novo look" ou
  "Seus looks" abrir.

## Favoritos e histórico de uso

- O coração de um look (em "Novo look", "Looks" ou no detalhe) salva o look
  na tabela `outfit_favorites`; a aba "Favoritos" lista os looks salvos.
- No detalhe do look, "Usei hoje" grava o dia em `outfit_wears` e a tela
  passa a mostrar há quanto tempo o look foi usado.
- Um look é identificado pelo conjunto das peças (ids em ordem crescente),
  então o mesmo look sugerido de novo já aparece favoritado.
- Esses dados ainda não mudam as sugestões: são a base pra o recomendador
  evitar looks usados há pouco e aprender com os favoritos.

## Telas ainda não desenhadas

"Configurações" existe só como placeholder no menu — não fazia parte do
mockup original.
