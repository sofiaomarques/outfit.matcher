-- Métricas mínimas de uso do Wable (#20). Rodar no SQL Editor do Supabase
-- (como postgres, que passa por cima do RLS: soma todas as usuárias). Cada
-- consulta é independente: selecione uma e rode. Dá pra salvar cada uma como
-- "snippet" no SQL Editor.
--
-- Só contagens: nenhuma consulta mostra e-mail, nome de peça ou foto.
--
-- Favoritos e usos não guardam a ocasião (só as rejeições guardam). A
-- quantidade de looks PEDIDOS por ocasião vem do log da API
-- (`jsonPayload.evento="requisicao"`, README, seção API): é ela que dá a taxa
-- de rejeição por ocasião.


-- 1. Resumo geral ------------------------------------------------------------
select
  (select count(*) from auth.users) as contas,
  (select count(*) from auth.users where email_confirmed_at is not null) as contas_confirmadas,
  (select count(distinct user_id) from public.clothing_items) as contas_com_pecas,
  (select count(*) from public.clothing_items) as pecas,
  (select count(*) from public.clothing_items where features is not null) as pecas_analisadas,
  (select count(*) from public.outfit_favorites) as looks_favoritados,
  (select count(*) from public.outfit_rejections) as looks_rejeitados,
  (select count(*) from public.outfit_wears) as looks_usados,
  (select count(*) from public.wishlist_items) as itens_wishlist;


-- 2. Atividade por semana (mais recente primeiro) ----------------------------
with semanas as (
  select generate_series(
    date_trunc('week', coalesce((select min(created_at) from auth.users), now())),
    date_trunc('week', now()),
    interval '1 week'
  ) as semana
)
select
  s.semana::date as semana,
  (select count(*) from auth.users u where date_trunc('week', u.created_at) = s.semana) as contas_novas,
  (select count(*) from public.clothing_items c where date_trunc('week', c.created_at) = s.semana) as pecas_novas,
  (select count(*) from public.outfit_favorites f where date_trunc('week', f.created_at) = s.semana) as favoritos,
  (select count(*) from public.outfit_rejections r where date_trunc('week', r.created_at) = s.semana) as rejeicoes,
  (select count(*) from public.outfit_wears w where date_trunc('week', w.created_at) = s.semana) as usos,
  -- Contas que fizeram qualquer coisa na semana (peça, favorito, rejeição ou uso).
  (select count(distinct user_id) from (
     select user_id, created_at from public.clothing_items
     union all select user_id, created_at from public.outfit_favorites
     union all select user_id, created_at from public.outfit_rejections
     union all select user_id, created_at from public.outfit_wears
   ) a where date_trunc('week', a.created_at) = s.semana) as contas_ativas
from semanas s
order by s.semana desc;


-- 3. Rejeições por ocasião ---------------------------------------------------
-- Nula = rejeição geral ("Não curti" sem ocasião escolhida).
select
  coalesce(ocasiao, '(geral)') as ocasiao,
  count(*) as rejeicoes,
  count(distinct user_id) as contas,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from public.outfit_rejections
group by 1
order by rejeicoes desc;


-- 4. Até onde as contas chegam (funil) ---------------------------------------
with por_conta as (
  select
    u.id,
    (select count(*) from public.clothing_items c where c.user_id = u.id) as pecas,
    (select count(*) from public.outfit_favorites f where f.user_id = u.id) as favoritos,
    (select count(*) from public.outfit_rejections r where r.user_id = u.id) as rejeicoes,
    (select count(*) from public.outfit_wears w where w.user_id = u.id) as usos
  from auth.users u
)
select
  count(*) as contas,
  count(*) filter (where pecas > 0) as cadastraram_peca,
  -- Com menos de ~5 peças (2 tops + 2 baixos + algo) o recomendador quase não tem o que combinar.
  count(*) filter (where pecas >= 5) as com_5_pecas_ou_mais,
  count(*) filter (where favoritos + rejeicoes + usos > 0) as deram_feedback,
  count(*) filter (where usos > 0) as marcaram_usei_hoje,
  percentile_cont(0.5) within group (order by pecas) as mediana_de_pecas
from por_conta;


-- 5. Dá pra recalibrar os pesos do recomendador? -----------------------------
-- Proposta (#20): recalibrar `model/recomendar.py` quando houver pelo menos
-- ~200 avaliações (favoritos + rejeições) vindas de 10 contas ou mais, pra
-- que o gosto de uma pessoa só não puxe os pesos de todo mundo.
select
  count(*) as avaliacoes,
  count(distinct user_id) as contas_avaliando,
  count(*) >= 200 and count(distinct user_id) >= 10 as pronto_pra_recalibrar
from (
  select user_id from public.outfit_favorites
  union all
  select user_id from public.outfit_rejections
) avaliacoes;
