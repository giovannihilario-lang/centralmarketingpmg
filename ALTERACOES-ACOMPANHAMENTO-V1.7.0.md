# Central de Acompanhamento V1.7.0

## Objetivo
Transformar a Central em uma experiência de uso diário: dashboard como página inicial, planilhas ocupando o viewport em 100% de zoom e ações de pagamento mais rápidas e confiáveis.

## Mudanças

- Dashboard passa a ser a página inicial da Central.
- Nova área Pagamentos separada do Dashboard.
- Dashboard reúne receita prevista, recebido, investimento previsto, saldo orçamentário, situação do mês, pendências, pagamentos sem baixa, conferências e maiores fornecedores.
- Comparativo 2025 x 2026 disponível na página inicial.
- Atalhos diretos para Pagamentos, Planejamento e Receita anual.
- Previsão Orçamentária movida para o topo da Receita anual.
- Planilhas principais entram em modo de tela ampla, com menos margens e sidebar reduzida no desktop.
- Planilha de Pagamentos passa a caber integralmente no desktop em zoom de 100%.
- Planejamento 2026 deixa de usar largura fixa de 1770px e distribui as 15 frentes pela largura disponível.
- Receita anual deixa de usar largura fixa de 1970px e distribui as competências pelo viewport.
- Rolagem horizontal permanece apenas quando realmente necessária, especialmente em telas pequenas.
- Dar baixa recebeu feedback otimista: o estado muda imediatamente e é revertido automaticamente se o banco recusar a alteração.
- Erros de baixa passam a exibir a mensagem real no toast.
- Estado ocupado da baixa ganha feedback visual com carregamento.
- Modo demonstração passa a usar a carga consolidada das planilhas, facilitando validação visual.

## Banco de dados
Nenhuma migration nova é necessária. A V1.7.0 reutiliza `salvar_pagamento_acompanhamento_v1` já existente.

## Validação
- `npm run acompanhamento:testar`: OK
- `npm run documentos:testar`: OK
- 1.325 registros
- 1.603 movimentos financeiros
- 15 frentes de planejamento
- 104 parcelas previstas
- 0 avisos nas quatro fontes oficiais
- `/acompanhamento.html`: HTTP 200
- `/central.html`: HTTP 200
