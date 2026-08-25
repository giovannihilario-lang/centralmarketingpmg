# Hotfix Confirmação V1.9.3

Este patch corrige o caso em que `Confirmar pagamento` mostrava sucesso mas a linha permanecia pendente após o reload.

O SQL deve ser executado uma vez no Supabase. Ao final, a consulta de diagnóstico deve mostrar a função `confirmar_pagamento_acompanhamento_v1` com os argumentos `p_pagamento_id uuid, p_registro_id uuid, p_confirmado boolean`.

Depois do deploy, uma confirmação bem-sucedida exibe a mensagem `Pagamento confirmado e lançado na Receita.`. Se ainda aparecer apenas `Pagamento confirmado.`, o navegador ou o deploy ainda está servindo o JavaScript antigo.
