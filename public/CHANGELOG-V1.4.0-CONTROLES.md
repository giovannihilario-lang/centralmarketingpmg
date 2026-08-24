# PMG Connect V1.4.0 — Controles operacionais

Data: 21/08/2026

## Base oficial

Esta versão foi reconciliada com `Fornecedores 2024.xlsx`, `Fornecedores 2025.xlsx`, `Fornecedores 2026.xlsx` e `MKTG 2026.xlsx`. A consolidação permanece em 1.335 acompanhamentos e 1.707 movimentos, sem avisos de conciliação.

## Melhorias entregues

- Kanban de execução das 15 frentes do Planejamento 2026, com responsável, prazo, progresso, custo previsto/realizado, bloqueio e evidência.
- Vínculo opcional de uma atividade com um pagamento realizado; a atividade é concluída em 100% sem transformar previsão vencida em baixa.
- Baixa manual exige data realizada, forma de pagamento e documento/NF no navegador e no banco.
- PDFs só entram pelo fluxo de documentos e continuam sujeitos à conferência humana obrigatória.
- Exclusão segura de documentos pendentes; documentos aprovados permanecem bloqueados para preservar a auditoria.
- Importação e assinatura do fechamento reservadas a gestores, com proteção equivalente no banco.
- Fingerprints oficiais sem número físico de linha ou coluna, permitindo reorganizar planilhas sem duplicar acompanhamentos.
- Compatibilidade de migração para atualizar os registros gerados pelas cargas anteriores.
- Foco por teclado, diálogos com contenção de foco e textos operacionais mais legíveis.
- Cópias das planilhas e da carga consolidada removidas da pasta pública; as fontes oficiais continuam preservadas fora da área publicada.

## Ativação

Depois dos SQLs `06` a `11`, execute:

```text
sql/12-CONTROLES-OPERACIONAIS-V1.4.0.sql
```

O script é idempotente e pode ser executado novamente.
