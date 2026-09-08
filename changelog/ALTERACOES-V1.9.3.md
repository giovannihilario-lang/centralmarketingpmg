# PMG Connect — Hotfix V1.9.3

## Problema corrigido

Linhas da Planilha de Pagamentos que ainda não possuíam um registro em `acompanhamento_pagamentos` usavam um fluxo diferente do botão de confirmação de pagamentos existentes. O front exibia sucesso, recarregava a base e a linha voltava para pendente.

## Correção

- O botão `Confirmar pagamento` agora usa sempre `confirmar_pagamento_acompanhamento_v1`.
- A RPC foi atualizada para aceitar `p_pagamento_id = null`.
- Quando não existe pagamento, a própria RPC cria e confirma o pagamento na mesma transação.
- Quando já existe, a mesma RPC confirma ou desfaz.
- A RPC devolve o registro persistido e o front verifica o status antes de exibir sucesso.
- O SQL força atualização do schema cache do PostgREST com `notify pgrst, 'reload schema'`.
- Não existe mais fallback silencioso para o caminho antigo de criação.

## Arquivos alterados

- `public/assets/acompanhamento.js`
- `sql/13-HOTFIX-CONFIRMACAO-PAGAMENTO-V1.9.3.sql`

## Instalação

1. Substitua `public/assets/acompanhamento.js`.
2. Execute `sql/13-HOTFIX-CONFIRMACAO-PAGAMENTO-V1.9.3.sql` no SQL Editor do Supabase.
3. Atualize/deploy o site e faça um hard refresh no navegador (`Ctrl+F5`).
