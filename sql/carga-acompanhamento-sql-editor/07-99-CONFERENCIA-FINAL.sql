-- PMG CONNECT — CONFERENCIA FINAL DA CARGA HISTORICA
select
  count(*) as acompanhamentos_carregados,
  case when count(*) = 1182 then 'OK' else 'CONFERIR: esperado 1182' end as resultado
from public.acompanhamento_registros
where arquivado_em is null
  and dados_originais ->> 'arquivo' in ('Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx');

select
  count(*) as movimentos_carregados,
  case when count(*) = 1554 then 'OK' else 'CONFERIR: esperado 1554' end as resultado
from public.acompanhamento_pagamentos pagamento
join public.acompanhamento_registros registro on registro.id = pagamento.registro_id
where registro.arquivado_em is null
  and registro.dados_originais ->> 'arquivo' in ('Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx');
