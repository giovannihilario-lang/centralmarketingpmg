# PMG Connect — Planilhas Vivas UX V1.6.0

Esta versão mantém a arquitetura e a lógica da V1.5.0. O foco é acabamento visual, leitura e velocidade de uso.

## Pagamentos
- Mantém Campanha e Fornecedor fixos durante a rolagem horizontal.
- Aumenta tipografia, altura das linhas e áreas clicáveis.
- Torna edição inline visível sem poluir a grade.
- Melhora os botões de Dar baixa, Pago, Conferir e Conferido.
- Adiciona progresso visual aos indicadores de baixas e conferências.
- Destaca o mês atual e torna a aba selecionada mais evidente.
- Inclui lembretes rápidos de edição: clique, Enter para salvar e Esc para cancelar.
- Melhora diferenciação de linhas conferidas e valores específicos.

## Planejamento
- Mantém meses x frentes exatamente na lógica da planilha.
- Melhora contraste do cabeçalho verde e total vermelho sem descaracterizar a fonte.
- Destaca o mês atual.
- Aumenta células e leitura dos totais.

## Receita anual
- Mantém fornecedor, previsão, JAN–DEZ, total, saldo e percentual.
- Aumenta largura e legibilidade das células.
- Refina cabeçalhos, total, saldo e barra percentual.
- Mantém a primeira coluna fixa durante a rolagem.
- Refina o bloco Previsão de Investimento / Receita / Saldo.

## UX geral
- Hierarquia visual mais clara nos títulos e ações.
- Cards de resumo menos genéricos e mais informativos.
- Estados de hover e foco mais claros.
- Melhor navegação por teclado.
- Melhor comportamento em telas menores.
- Nenhuma alteração de banco ou SQL é necessária para esta versão.

## Validação
- `npm run acompanhamento:testar`: OK
- `npm run documentos:testar`: OK
- `acompanhamento.html`: HTTP 200
- `central.html`: HTTP 200
- Carga: 1.325 registros / 1.603 movimentos
- Planejamento: 15 frentes / 104 parcelas / 0 baixas automáticas
