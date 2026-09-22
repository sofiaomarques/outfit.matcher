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
