-- PMG Connect V1.2.5
-- Atualiza a taxonomia da Caixa de Entrada sem perder documentos ja conferidos.
-- cadastro_pagamento + pedido_compra => desconto_nota
-- danfe => deposito

begin;

alter table public.acompanhamento_documentos_itens
  drop constraint if exists documentos_itens_tipo_valido;

update public.acompanhamento_documentos_itens
set tipo = case
  when tipo in ('cadastro_pagamento', 'pedido_compra') then 'desconto_nota'
  when tipo = 'danfe' then 'deposito'
  else tipo
end,
dados_extraidos = case
  when jsonb_typeof(dados_extraidos) = 'object' then
    jsonb_set(
      dados_extraidos,
      '{tipo}',
      to_jsonb(case
        when coalesce(dados_extraidos ->> 'tipo', tipo) in ('cadastro_pagamento', 'pedido_compra') then 'desconto_nota'
        when coalesce(dados_extraidos ->> 'tipo', tipo) = 'danfe' then 'deposito'
        else coalesce(dados_extraidos ->> 'tipo', tipo)
      end),
      true
    )
  else dados_extraidos
end
where tipo in ('cadastro_pagamento', 'pedido_compra', 'danfe')
   or dados_extraidos ->> 'tipo' in ('cadastro_pagamento', 'pedido_compra', 'danfe');

alter table public.acompanhamento_documentos_itens
  add constraint documentos_itens_tipo_valido check (
    tipo in ('desconto_nota', 'deposito', 'extrato_bancario', 'nao_identificado')
  );

commit;

-- Conferencia rapida:
select tipo, count(*) as quantidade
from public.acompanhamento_documentos_itens
group by tipo
order by tipo;
