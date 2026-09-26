-- Outfit Matcher (Wable) — schema do guarda-roupa dos usuários.
--
-- Rode este script uma vez no seu projeto Supabase:
-- Dashboard > SQL Editor > cole o conteúdo > Run.
--
-- Guarda uma linha por peça de roupa (metadados) e a foto em si num bucket
-- de Storage separado, sob o caminho "{user_id}/{item_id}.jpg" — nunca
-- direto como bytes no banco. `features` fica pronta pra receber o vetor
-- gerado pelo pipeline em Python (features/*.py) quando essa integração
-- for feita; até lá fica null.

create table if not exists public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null
    check (category in ('top', 'bottom', 'skirt', 'dress', 'accessory')),
  image_path text not null,
  -- bigint (não integer): o ARGB32 de uma cor opaca (alpha=0xFF) já passa
  -- de 2^31 e estoura o range de um integer/int4 do Postgres.
  swatch_color bigint not null,
  is_favorite boolean not null default false,
  features jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clothing_items_user_id_idx
  on public.clothing_items (user_id);

-- Row Level Security: cada usuário só enxerga e mexe nas próprias peças.
alter table public.clothing_items enable row level security;

create policy "clothing_items_select_own"
  on public.clothing_items for select
  using (auth.uid() = user_id);

create policy "clothing_items_insert_own"
  on public.clothing_items for insert
  with check (auth.uid() = user_id);

create policy "clothing_items_update_own"
  on public.clothing_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "clothing_items_delete_own"
  on public.clothing_items for delete
  using (auth.uid() = user_id);

-- Storage: bucket privado pras fotos. Cada usuário só acessa arquivos
-- dentro da própria pasta "{user_id}/...".
insert into storage.buckets (id, name, public)
values ('clothing-images', 'clothing-images', false)
on conflict (id) do nothing;

create policy "clothing_images_select_own"
  on storage.objects for select
  using (
    bucket_id = 'clothing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "clothing_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'clothing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "clothing_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'clothing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Wishlist — peças que a usuária ainda não tem mas quer comprar (foto +
-- descrição livre), separado do guarda-roupa em `clothing_items`.

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists wishlist_items_user_id_idx
  on public.wishlist_items (user_id);

alter table public.wishlist_items enable row level security;

create policy "wishlist_items_select_own"
  on public.wishlist_items for select
  using (auth.uid() = user_id);

create policy "wishlist_items_insert_own"
  on public.wishlist_items for insert
  with check (auth.uid() = user_id);

create policy "wishlist_items_update_own"
  on public.wishlist_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "wishlist_items_delete_own"
  on public.wishlist_items for delete
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('wishlist-images', 'wishlist-images', false)
on conflict (id) do nothing;

create policy "wishlist_images_select_own"
  on storage.objects for select
  using (
    bucket_id = 'wishlist-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "wishlist_images_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'wishlist-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "wishlist_images_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'wishlist-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Histórico de looks — favoritos e o que a usuária usou, primeiros sinais
-- de feedback pro recomendador. Um look é o conjunto das peças que o
-- compõem: `item_ids` guarda os ids de `clothing_items` sempre em ordem
-- crescente (o app ordena antes de salvar), então o mesmo look vira
-- sempre o mesmo array. Peça apagada não some daqui; o app ignora looks
-- com peças que não existem mais.
--
-- Projeto que já rodou o script acima: rode só daqui pra baixo (os
-- `create policy` de cima falham se rodados de novo).

create table if not exists public.outfit_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_ids uuid[] not null check (cardinality(item_ids) between 1 and 4),
  created_at timestamptz not null default now(),
  unique (user_id, item_ids)
);

-- Uma linha por look por dia; `worn_on` é o dia local da usuária,
-- mandado pelo app (o `current_date` do servidor está em UTC).
create table if not exists public.outfit_wears (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_ids uuid[] not null check (cardinality(item_ids) between 1 and 4),
  worn_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_ids, worn_on)
);

create index if not exists outfit_wears_user_worn_on_idx
  on public.outfit_wears (user_id, worn_on desc);

-- Looks que a usuária rejeitou ("Não curti" em Novo look). `ocasiao` é a
-- chave da ocasião em que foi rejeitado (ex.: 'trabalho', ver OCASIOES em
-- model/recomendar.py): a rejeição só vale nela — "não é pra trabalho" não
-- é "não gosto". Nula = rejeição geral.
create table if not exists public.outfit_rejections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_ids uuid[] not null check (cardinality(item_ids) between 1 and 4),
  ocasiao text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, item_ids, ocasiao)
);

alter table public.outfit_favorites enable row level security;
alter table public.outfit_wears enable row level security;
alter table public.outfit_rejections enable row level security;

create policy "outfit_favorites_select_own"
  on public.outfit_favorites for select
  using (auth.uid() = user_id);

create policy "outfit_favorites_insert_own"
  on public.outfit_favorites for insert
  with check (auth.uid() = user_id);

create policy "outfit_favorites_delete_own"
  on public.outfit_favorites for delete
  using (auth.uid() = user_id);

create policy "outfit_wears_select_own"
  on public.outfit_wears for select
  using (auth.uid() = user_id);

create policy "outfit_wears_insert_own"
  on public.outfit_wears for insert
  with check (auth.uid() = user_id);

create policy "outfit_wears_delete_own"
  on public.outfit_wears for delete
  using (auth.uid() = user_id);

create policy "outfit_rejections_select_own"
  on public.outfit_rejections for select
  using (auth.uid() = user_id);

create policy "outfit_rejections_insert_own"
  on public.outfit_rejections for insert
  with check (auth.uid() = user_id);

create policy "outfit_rejections_delete_own"
  on public.outfit_rejections for delete
  using (auth.uid() = user_id);
