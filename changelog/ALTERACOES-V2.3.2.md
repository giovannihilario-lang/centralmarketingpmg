# PMG Connect — Confirmação rápida V2.3.2

## Pagamentos

- Adicionado botão **Confirmar pendentes** diretamente na barra superior da Planilha de Pagamentos.
- O botão confirma todas as linhas pendentes atualmente visíveis no mês/filtro.
- Antes da ação, informa quantidade de pagamentos e valor total do lote.
- A confirmação em lote passa a usar `confirmar_pagamentos_lote_v1`, reduzindo várias chamadas de rede para uma única RPC.
- Caso a RPC de lote ainda não esteja instalada, o front utiliza fallback com confirmações paralelas em pequenos grupos.
- A confirmação individual deixou de fazer uma segunda consulta de verificação; a própria RPC já retorna a linha persistida após o UPDATE.
- Mantido o comportamento otimista: o estado visual responde imediatamente e é restaurado em caso de erro.
- Cache bust atualizado para `2.3.2`.

## Banco

Execute uma vez no Supabase SQL Editor:

`sql/19-HOTFIX-CONFIRMACAO-LOTE-V2.3.2.sql`

A função em lote reutiliza a regra oficial `confirmar_pagamento_linha_v1`, portanto mantém histórico, autoria e sincronização da tabela de pagamentos.

## Validação

- JavaScript: sintaxe OK.
- Acompanhamento: 1.325 registros, 1.603 movimentos, 15 frentes, 104 parcelas, zero avisos nas quatro planilhas.
- Documentos: teste OK.
