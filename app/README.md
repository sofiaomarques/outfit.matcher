# outfit_matcher (app)

Interface do Outfit Matcher em Flutter (web + iOS + Android), construída
a partir do mockup do projeto. Os **looks sugeridos** ("Seus looks", "Look
do dia") ainda usam dados fake em `lib/data/mock_wardrobe.dart` — a troca
pelo pipeline real em Python (`model/gerar_outfit.py`) fica pra depois, já
que o formato dos looks (`Outfit.items` + `score`) segue o mesmo contrato
que o modelo retorna. O **guarda-roupa** (peças cadastradas pelo usuário)
já é real, guardado no Supabase — ver [`../supabase/schema.sql`](../supabase/schema.sql).

## Configurando o Supabase

O app precisa de um projeto Supabase (banco Postgres + storage de arquivos
+ autenticação) pra funcionar de verdade:

1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. No SQL Editor do projeto, rode o conteúdo de
   [`../supabase/schema.sql`](../supabase/schema.sql) — isso cria a
   tabela `clothing_items`, as políticas de Row Level Security e o bucket
   privado `clothing-images`.
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

## Estrutura

- `lib/theme/` — paleta de cores e tipografia
- `lib/models/` — `ClothingItem`, `Outfit`, categorias
- `lib/data/` — mock dos looks sugeridos (ainda não conectados ao pipeline Python)
- `lib/repositories/` — `WardrobeRepository`, acesso ao guarda-roupa no Supabase
- `lib/services/` — configuração do Supabase (`SupabaseConfig`)
- `lib/widgets/` — componentes reutilizáveis (nav, cards, peça, estrela decorativa)
- `lib/screens/` — telas (boas-vindas, login/cadastro, guarda-roupa, nova peça, looks, detalhe do look)

## Guarda-roupa: como funciona hoje

- Login/cadastro por e-mail e senha (Supabase Auth); cada usuário só
  enxerga as próprias peças (Row Level Security).
- O botão "+" em "Meu guarda-roupa" abre a tela de nova peça: escolher
  foto (câmera ou galeria), nome e categoria, e salvar.
- A foto vai pro bucket `clothing-images` (privado, uma pasta por
  usuário) e os metadados pra tabela `clothing_items`.
- A cor de placeholder e a categoria são as que o usuário escolhe na hora
  do cadastro — o pipeline de extração de features em Python
  (`features/cores.py`, `features/categoria.py`) ainda não roda sobre o
  upload. A coluna `features` na tabela já existe pronta pra isso, como
  próximo passo.

## Telas ainda não desenhadas

"Favoritos" e "Configurações" existem só como placeholder no menu — não
faziam parte do mockup original.
