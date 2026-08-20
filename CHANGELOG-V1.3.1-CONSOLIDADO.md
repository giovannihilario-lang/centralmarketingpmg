# PMG Connect V1.3.1 — Consolidação das linhas de desenvolvimento

Data: 19/08/2026

## Base escolhida

A consolidação parte da master mais recente do PMG Connect que já continha o snapshot comercial diário local e o hotfix de detecção de documento/CNPJ no Azure SQL. Esses arquivos foram preservados como fonte principal para Regional e Campanhas.

## O que foi incorporado da evolução Gestão MKT V1.3.0

- Planejamento PMG 2026 com previsto, realizado, saldo e execução.
- Regra corrigida: parcela planejada não vira paga apenas porque o mês passou.
- Receita com previsão de recebíveis, recebido real, a receber, investimento previsto/realizado, saldo projetado e saldo realizado.
- Comparativo mensal 2026 x 2025.
- Fechamento Mensal Marketing → Marcos em ordem alfabética.
- Assinatura de conferência e marcação de divergência pelo Supabase.
- Centro de custo obrigatório em lançamentos manuais.
- Abertura automática da coluna VALOR das planilhas Fornecedores.
- MTRIX / Emitrix: investimento adicional fora da VERBA.
- Incentivo e demais centros de custo: detalhamento já contido na VERBA, sem dupla soma.
- SQL `11-GESTAO-MKT-V1.3.0.sql`.

## O que foi preservado da master atual

- Snapshot comercial diário em `src/lib/daily-commercial-snapshot.js`.
- Primeiro acesso do dia dispara uma única sincronização; acessos concorrentes compartilham a mesma carga.
- Regional e Campanhas consomem o snapshot local durante o restante do dia.
- Fallback para o último snapshot válido quando a atualização falha.
- Detecção dinâmica do campo de documento em `dbo.Clientes`, sem depender de uma coluna fixa `CNPJ/CPF`.
- Caixa de Documentos, Gemini + OCR local, exclusão segura e taxonomia Desconto em nota / Depósito.
- Central de Demandas e demais módulos da master não foram substituídos por cópias antigas.

## Reconciliação das quatro planilhas oficiais

- Fornecedores 2024: 430 acompanhamentos / 426 movimentos.
- Fornecedores 2025: 524 / 523.
- Fornecedores 2026: 271 / 270.
- MKTG 2026: 110 / 488.
- Total: 1.335 acompanhamentos / 1.707 movimentos.
- Avisos de conciliação: 0.

Planejamento 2026:

- 15 frentes.
- 104 parcelas.
- 0 parcelas baixadas automaticamente.

Regras de amostra validadas:

- ALFAMA julho/2026: VERBA R$ 59.731,00 + MTRIX R$ 11.946,20 adicional.
- AJINOMOTO maio/2026: VERBA R$ 51.666,66 com Incentivo R$ 10.000,00 já contido na verba.

## Arquivos centrais alterados

- `public/acompanhamento.html`
- `public/assets/acompanhamento.js`
- `public/assets/acompanhamento.css`
- `scripts/gerar-carga-acompanhamento.js`
- `scripts/testar-acompanhamento.js`
- `data/acompanhamento-carga-inicial.json`
- `sql/07-CARGA-HISTORICA-ACOMPANHAMENTO.sql` e lotes SQL derivados
- `sql/11-GESTAO-MKT-V1.3.0.sql`
- `README-acompanhamento.md`

## Segurança da entrega

O ZIP de distribuição não deve conter `.env`, `.vercel`, `node_modules` nem o snapshot comercial diário gerado em runtime. Chaves e credenciais permanecem somente no ambiente onde o projeto é executado.
