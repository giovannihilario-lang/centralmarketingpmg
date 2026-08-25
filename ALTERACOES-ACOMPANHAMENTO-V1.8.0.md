# PMG Connect — Acompanhamento V1.8.0

## Regra oficial de Receita

A Receita Anual de 2026 passa a separar completamente previsão e realizado.

- `MKTG 2026 / RECEITA` continua sendo a fonte da **previsão anual** por fornecedor.
- `Fornecedores 2026` continua sendo a fonte operacional da **Planilha de Pagamentos**.
- Um valor mensal só entra como **Receita confirmada** quando a linha correspondente estiver simultaneamente:
  1. com pagamento em `Pago`;
  2. com conferência em `Conferido`.
- `Pago` sem conferência fica em **Aguardando conferência** e não entra no realizado.
- Sem baixa fica em **A receber**.
- Reabrir a baixa ou a conferência retira o valor do realizado automaticamente.

## Receita Anual

- Os meses deixaram de ser editados diretamente na matriz de Receita.
- Os valores mensais agora são derivados da Planilha de Pagamentos.
- A coluna `PREVISÃO` continua editável.
- Foi adicionada uma faixa de status com:
  - Receita confirmada;
  - Aguardando conferência;
  - A receber.
- Células mensais possuem estado visual para confirmado, aguardando, aberto ou misto.

## Dashboard

O Dashboard agora usa a mesma regra:

- Receita prevista = MKTG 2026;
- Receita confirmada = Baixa + Conferência;
- Aguardando conferência = baixa sem assinatura;
- A receber = sem baixa.

Ranking de fornecedores, competência atual, evolução mensal e percentual realizado também usam somente receita confirmada em 2026.

## Planilha de Pagamentos

- A conferência agora respeita a ordem do fluxo.
- Antes da baixa, o botão exibe `Baixe primeiro`.
- Após a baixa, a ação `Conferir` é liberada.
- A conferência continua podendo ser reaberta.

## Compatibilidade

- 2024 e 2025 continuam tratados como histórico fechado, anterior ao fluxo de conferência.
- Nenhuma migration SQL nova é necessária além da estrutura de conferência já existente no SQL 11.
