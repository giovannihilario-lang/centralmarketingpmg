# Central de Acompanhamento — Planilhas Vivas V1.5.0

Base desta entrega: `pmg-marketing (3)(3).zip`, recebido em 25/08/2026.

## Objetivo

Transformar a Central de Acompanhamento em uma interface fiel às planilhas oficiais, mantendo a leitura que a equipe já conhece e acrescentando edição direta, filtros, estados visuais, animações e ações de um clique.

## O que mudou

### Planilha de Pagamentos
- Estrutura principal igual ao arquivo `Fornecedores`: `CAMPANHA | FORNECEDOR | VERBA | NF | VALOR`.
- Abas mensais de janeiro a dezembro, como uma pasta de trabalho.
- Seletor de ano 2024/2025/2026 conforme os dados disponíveis.
- Edição inline das cinco colunas principais.
- `Dar baixa` / `Pago` com um clique.
- `Conferir` / `Conferido` com um clique por linha.
- Conferência é individual por lançamento, mesmo quando o mesmo fornecedor aparece mais de uma vez no mês.
- Total do mês, valores específicos, quantidade de baixas e quantidade de linhas conferidas.
- Filtro de linhas ainda não conferidas.
- Inclusão de nova linha já vinculada ao mês e ano abertos.
- Pendências do mês visíveis abaixo da planilha e editáveis.

### Receita anual
- Matriz inspirada diretamente na aba `RECEITA` do `MKTG 2026`.
- Colunas: `FORNECEDORES | PREVISÃO | JAN ... DEZ | TOTAL | SALDO | %`.
- Previsão e valores mensais editáveis diretamente na célula.
- Totais, saldo e percentual recalculados automaticamente.
- Bloco `PREVISÃO ORÇAMENTÁRIA` com investimento, receita e saldo.

### Planejamento PMG 2026
- Mantida a lógica da aba `Planejamento` original: meses nas linhas e frentes nas colunas.
- As 15 frentes oficiais permanecem como colunas.
- Valores mensais editáveis diretamente na matriz.
- Totais por mês, por frente e total geral calculados automaticamente.

### Navegação e UX
- Navegação principal organizada em `Planilhas vivas`: Pagamentos, Planejamento, Receita e Fornecedores.
- `Documentos` e `Atualizar planilhas` ficam como ferramentas.
- Removido do fluxo principal o excesso de visões técnicas e conceitos que não existem nas planilhas.
- Removidos os rótulos visíveis `Controle Marcos` / `Controle Marketing` das áreas principais.
- Motion discreto em linhas, estados, edição e abas, sem prejudicar leitura ou velocidade.
- Busca global continua disponível.

### Fonte de dados
- `Fornecedores 2024.xlsx`, `Fornecedores 2025.xlsx` e `Fornecedores 2026.xlsx` conciliados com as planilhas enviadas.
- `MKTG 2026.xlsx` substituído pela versão mais recente enviada, contendo apenas `Planejamento`, `RECEITA` e `PENDÊNCIAS`.
- O gerador deixa de criar registros vazios para abas antigas inexistentes.
- Carga consolidada atual: 1.325 registros e 1.603 movimentos financeiros.

## Persistência

A edição inline reutiliza as RPCs já existentes de registros e pagamentos. A conferência de um clique utiliza a estrutura de conferência já entregue no `sql/11-GESTAO-MKT-V1.3.0.sql`. Não foi criada uma nova dependência externa.

## Validação

- `npm run acompanhamento:gerar-carga`: OK
- `npm run acompanhamento:testar`: OK
- `npm run documentos:testar`: OK
- Fornecedores 2024: 430 registros / 426 movimentos / 0 avisos
- Fornecedores 2025: 524 registros / 523 movimentos / 0 avisos
- Fornecedores 2026: 271 registros / 270 movimentos / 0 avisos
- MKTG 2026: 100 registros / 384 movimentos / 0 avisos
- `acompanhamento.html`: HTTP 200 no servidor local
- `central.html`: HTTP 200 no servidor local
