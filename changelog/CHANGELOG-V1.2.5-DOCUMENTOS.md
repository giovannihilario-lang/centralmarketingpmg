# PMG Connect V1.2.5 — Taxonomia de documentos

## Alterações

- “Cadastro de pagamento” passa a ser **Desconto em nota**.
- “Pedido de compra” passa a ser **Desconto em nota**.
- “Nota fiscal / DANFE” passa a ser **Depósito**.
- Gemini e OCR local passam a produzir os novos tipos internos `desconto_nota` e `deposito`.
- Registros antigos (`cadastro_pagamento`, `pedido_compra`, `danfe`) continuam sendo reconhecidos e são normalizados automaticamente.
- Incluída a migração `sql/10-TAXONOMIA-DOCUMENTOS-V1.2.5.sql` para atualizar a constraint e os registros existentes no Supabase.
- Mantida conferência humana obrigatória antes do lançamento.
