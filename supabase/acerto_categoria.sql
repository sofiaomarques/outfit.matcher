-- Taxa de acerto do classificador de categoria nas fotos reais do app (#26).
--
-- Rodar no SQL Editor do Supabase (como postgres, que passa por cima do RLS:
-- conta as peças de todas as usuárias). A categoria salva em
-- `clothing_items.category` é a que a usuária confirmou no cadastro; a
-- detectada vem de `features.categoria_codigo`, com o mesmo mapeamento de
-- `ClothingCategory.fromDetectedCode` no app.
--
-- `com_sugestao`: a detecção apareceu na tela antes de salvar
-- (`features.categoria_sugerida`). Sem ela, a peça foi salva com a API
-- acordando e analisada depois, então a escolha da usuária não teve
-- influência do modelo. Com ela, um acerto pode ser só a usuária aceitando
-- a sugestão sem olhar; as correções são os rótulos mais confiáveis.
--
-- Acessório fica de fora: o classificador não tem essa classe.
--
-- `inicio`: só conta peças cadastradas depois que o app passou a marcar a
-- categoria detectada (#34). Antes disso toda peça começava em Tops e muitas
-- foram salvas assim sem ninguém olhar; sem `categoria_sugerida`, elas
-- cairiam em `com_sugestao = false` e sujariam os rótulos sem influência do
-- modelo. Ajustar pra data em que a versão nova do app foi publicada.

with params as (
  select timestamptz '2026-10-21' as inicio
),
pecas as (
  select
    category as confirmada,
    case
      when (features->>'categoria_codigo')::int in (1, 2) then 'bottom'
      when (features->>'categoria_codigo')::int = 3 then 'skirt'
      when (features->>'categoria_codigo')::int = 4 then 'dress'
      when (features->>'categoria_codigo')::int between 5 and 10 then 'top'
    end as detectada,
    features ? 'categoria_sugerida' as com_sugestao
  from public.clothing_items, params
  where features ? 'categoria_codigo'
    and created_at >= params.inicio
    and category <> 'accessory'
)
select
  confirmada,
  com_sugestao,
  count(*) as pecas,
  count(*) filter (where detectada = confirmada) as acertos,
  round(100.0 * count(*) filter (where detectada = confirmada) / count(*), 1)
    as acerto_pct,
  -- Pra onde vão os erros, ex.: {"top": 3} numa linha de 'skirt'.
  jsonb_object_agg(detectada, n) filter (where detectada <> confirmada)
    as erros
from (
  select *, count(*) over (partition by confirmada, com_sugestao, detectada) as n
  from pecas
) p
group by confirmada, com_sugestao
order by confirmada, com_sugestao;
