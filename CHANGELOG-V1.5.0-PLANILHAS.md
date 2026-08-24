# PMG Connect V1.5.0 — Espelho inteligente das planilhas

## O que mudou

- O menu principal foi reduzido a seis entradas. Receita, Agenda, Fechamento e Parceiros agora ficam dentro da **Central Financeira**.
- O Planejamento 2026 ganhou uma matriz mensal por categoria, espelhando as 15 frentes da planilha do Marcos.
- Células vermelhas do Planejamento são importadas como realizadas; células pretas continuam previstas. A passagem do mês não gera baixa automática.
- Os quatro tipos de recebimento do Marketing passaram a ser classificados: **desconto em boleto**, **depósito**, **bonificação** e **sobra Marketing**. Movimentos mistos continuam explícitos.
- O texto original da coluna NF permanece preservado como documento e em `dados_originais`.
- Pendências e valores em haver ganharam uma fila visível dentro da leitura financeira.
- A coluna E das planilhas Fornecedores continua como abertura do investimento dentro da verba. MTRIX/Emitrix permanece como investimento adicional fora da verba.

## Dados reconciliados

- 1.335 acompanhamentos.
- 1.707 movimentos financeiros.
- 15 frentes estratégicas e 104 competências no Planejamento 2026.
- 73 competências realizadas em vermelho, somando R$ 1.740.817,68.
- 397 recebimentos úteis em 2024, 423 em 2025 e 246 em 2026.
- Nenhuma divergência nos totais mensais das planilhas Fornecedores.

## Atualização do ambiente

Não há nova tabela obrigatória nesta versão. Depois de publicar os arquivos, reexecute a carga histórica pelos lotes `sql/carga-acompanhamento-sql-editor/07-01` até `07-18` ou reimporte as quatro planilhas pela Central. A carga é idempotente e atualiza os mesmos registros sem duplicá-los.
