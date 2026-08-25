# PMG Connect — Central de Acompanhamentos UX V2.1.0

Esta revisão concentra de uma vez a passada completa de design e UX da Central, preservando a lógica das Planilhas Vivas e a regra financeira vigente: uma linha possui um único valor e um único estado de confirmação.

## Dashboard como página principal

- Hero executivo com Receita prevista, Receita confirmada e diferença em relação ao previsto.
- Cards clicáveis com drill-down para Receita, Pagamentos e Planejamento.
- Bloco “Atenção agora” baseado em pendências reais, não em indicadores inventados.
- Timeline anual Janeiro → Dezembro com estados: fechado, parcial, pendente e sem dados.
- Ranking de fornecedores clicável.
- Gráfico de receita com clique no mês para abrir a competência correspondente.

## Planilha de Pagamentos

- Interface otimizada para trabalhar em 100% de zoom em desktop.
- Sidebar e topbar ficam mais compactas no modo planilha.
- Competências viraram uma timeline anual com percentual e valor confirmado por mês.
- Ano, mês, filtro de pendentes, fornecedor e densidade são persistidos no navegador.
- Drill-down do Dashboard, Receita e Fornecedores abre a planilha já no mês/filtro certo.
- Status simplificado visualmente para `○ Pendente` / `✓ Confirmado`.
- Fornecedor pode ser aberto num painel lateral sem sair da planilha.
- Seleção múltipla com ações em lote:
  - confirmar pendentes;
  - definir NF/documento;
  - arquivar linhas;
  - limpar seleção.

## Edição inline

- Ícone de edição não polui mais a tabela no estado normal.
- Feedback direto na célula: `Salvando`, `Salvo` e `Erro`.
- Enter salva e Esc cancela.
- Estados de foco e erro foram reforçados visualmente.

## Receita anual

- Clicar no fornecedor abre o painel lateral do parceiro.
- Clicar em qualquer competência abre Pagamentos naquele mês e fornecedor.
- Blocos de Receita confirmada / A receber são clicáveis.
- Gráfico anual também possui drill-down por mês.

## Fornecedores

- Cards inteiros são clicáveis.
- Novo drawer lateral por fornecedor com:
  - previsão 2026;
  - confirmado;
  - diferença vs. previsão;
  - visão Janeiro → Dezembro;
  - linhas de pagamento por competência;
  - NF e status;
  - histórico de alterações;
  - atalho para abrir a Planilha de Pagamentos já filtrada.

## Busca inteligente

`Ctrl + K` agora entende contexto, além de texto simples. Exemplos:

- `pendentes julho`
- `NF 12846`
- nome do fornecedor
- `acima da previsão`
- `abaixo da previsão`
- `confirmados agosto`

## Layout e responsividade

- Planilhas usam praticamente todo o viewport em desktop.
- Pagamentos cabe em tela cheia sem depender de zoom do navegador.
- Planejamento e Receita usam `table-layout` adaptativo em telas grandes.
- Em notebooks menores, somente as matrizes realmente largas usam rolagem horizontal.
- Mobile mantém rolagem onde é matematicamente necessária.
- `prefers-reduced-motion` continua respeitado.

## Cache

`acompanhamento.html` foi atualizado para carregar `acompanhamento.css?v=2.1.0` e `acompanhamento.js?v=2.1.0`, evitando que o navegador continue servindo assets antigos após o deploy.

## Banco de dados

Nenhum SQL novo nesta revisão. A V2.1.0 utiliza a estrutura existente de confirmação na própria linha (`SQL 14 / V1.9.5`).
