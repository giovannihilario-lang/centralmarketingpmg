# PMG Connect — V2.3.7

## Receita 2026 reconciliada com a fonte oficial

Esta revisão corrige a divergência entre o Dashboard/Receita Anual e a aba `RECEITA` do arquivo `MKTG 2026.xlsx`.

### Fonte validada

- `PREV. RECEITA`: R$ 6.816.000,00
- `SOMA MENSAL / TOTAL`: **R$ 3.970.297,69**
- Janeiro: R$ 376.464,65
- Fevereiro: R$ 528.111,40
- Março: R$ 700.919,22
- Abril: R$ 672.694,56
- Maio: R$ 472.527,61
- Junho: R$ 583.854,89
- Julho: R$ 635.720,36
- Agosto a Dezembro: R$ 1,00 por mês, exatamente como consta na fonte.

### O que estava errado

O Dashboard calculava `Confirmada` somente a partir das linhas que possuíam confirmação manual no Supabase. Por isso exibiu R$ 2.263.426,43 mesmo com R$ 3.970.297,69 registrados na fonte oficial.

### Nova regra

1. A aba `RECEITA` do MKTG 2026 passa a ser a fonte oficial do realizado anual e mensal.
2. Dashboard, gráfico e Receita Anual usam a linha `SOMA MENSAL` para os totais oficiais.
3. Linhas da Planilha de Pagamentos que já constam no MKTG como recebidas são marcadas automaticamente como confirmadas.
4. Confirmação manual continua disponível somente para lançamentos novos que ainda não constam no MKTG.
5. O SQL V2.3.7 sincroniza no banco as linhas já existentes que constam na fonte oficial.
6. A Receita Anual mostra uma linha `AJUSTES DA FONTE` quando a própria planilha possui marcadores sem fornecedor, evitando diferença entre a soma das linhas e o `SOMA MENSAL`.

### Validação

- 1.326 acompanhamentos
- 1.603 movimentos
- MKTG 2026: 101 registros / 384 movimentos / 0 avisos
- Planejamento: 15 frentes / 104 parcelas / 73 pagas
- Julho 2026: 34/34 linhas da planilha de fornecedores reconhecidas pela fonte oficial
- Receita oficial 2026: **R$ 3.970.297,69**
- JavaScript: sintaxe OK
- Teste de documentos: OK

## SQL

Execute uma vez:

`sql/20-SINCRONIZAR-RECEITA-MKTG-V2.3.7.sql`

O script é idempotente e pode ser executado novamente.
