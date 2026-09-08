# V1.8.0 — Receita confirmada

Fluxo oficial:

`Previsão -> Pagamento -> Baixa -> Conferência -> Receita realizada`

A Receita Anual deixa de considerar os movimentos mensais do MKTG como realizado. Eles continuam preservados na fonte para auditoria/comparação, enquanto o valor exibido como realizado é calculado pelas linhas da Planilha de Pagamentos que estejam `Pago + Conferido`.

Não há SQL novo nesta versão. A conferência utiliza `sql/11-GESTAO-MKT-V1.3.0.sql`, já presente no projeto.
