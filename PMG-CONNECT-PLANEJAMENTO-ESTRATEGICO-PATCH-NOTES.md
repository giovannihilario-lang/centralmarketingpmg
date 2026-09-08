# PMG Connect — Patch Notes

## Novidades

- Adicionado o módulo **Planejamento Estratégico | Rumo aos R$ 200 milhões**.
- Criada visão executiva com meta, faturamento atual, distância da meta e portfólio de projetos estratégicos.
- Criado motor determinístico de oportunidades com sinais de região, categoria, fornecedor e cliente.
- Adicionados projetos estratégicos com objetivo, escopo, meta, prazo e ciclo padrão de 90 dias, incluindo meta de clientes positivados.
- Adicionado plano de ação interdepartamental com Comercial, Logística, Marketing, Compras, Financeiro, Estoque, Diretoria e Outros.
- Adicionado acompanhamento do projeto por baseline e medições posteriores.
- Adicionado fechamento do ciclo com resultado, acertos, falhas, gargalos e próximo passo.
- Adicionado modo de apresentação para reunião.
- Adicionada exportação da apresentação para `.pptx`.

## UX

- Nova navegação dedicada a Visão Executiva, Oportunidades, Projetos, Acompanhamento e Fechamentos.
- Dashboard responsivo com estados de fonte comercial, leitura parcial e persistência indisponível.
- Oportunidades mostram evidências e regra de origem em vez de recomendações opacas.
- Projeto mostra baseline, meta, evolução e ações relacionadas no mesmo contexto.
- O módulo é inserido na navegação principal e nos atalhos rápidos da Central por instalador idempotente, sem substituir a Central inteira.

## Dados

- Reutilizados os endpoints reais do Dashboard Regional para faturamento, volume, pedidos, cidades, fornecedores, evolução, grupos e regiões.
- Adicionada rota local `/api/estrategia-clientes` usando `dbo.Vendas` e `dbo.Clientes`.
- Adicionado KPI de **clientes positivados** por período.
- Adicionados sinais de reativação para clientes com faturamento anterior relevante e nenhuma compra no período atual.
- Adicionados sinais de queda para clientes com redução superior a 40% contra o mês anterior, respeitando faturamento mínimo de referência.
- Projetos de cliente usam o próprio cliente no baseline e nas medições, em vez de usar o total da empresa.
- Nenhum potencial financeiro externo ou tamanho de mercado é inventado pelo motor de oportunidades.

## Automações

- Ações estratégicas podem gerar uma Demanda real no módulo Demandas.
- O vínculo `ação estratégica → tarefa` é persistido e idempotente: uma ação que já possui tarefa retorna a tarefa existente.
- A oportunidade salva pode ser convertida em projeto estratégico e passa para status `convertida` na mesma transação de criação do projeto.

## Performance

- Não foi adicionada nova Serverless Function à Vercel.
- A consulta de clientes roda em `local-api`, reaproveitando o servidor SQL local já existente.
- Consulta de oportunidades limita resultados no SQL antes da transferência.
- Associação com cadastro de clientes evita multiplicação do mesmo sinal quando existirem linhas duplicadas para um ID de cliente.
- Chamadas comerciais do módulo possuem timeout de 15 segundos e carregamento parcial quando uma fonte específica falha.

## Segurança

- Criadas RLS policies para todas as tabelas estratégicas.
- RPCs estratégicas exigem sessão autenticada e colaborador PMG válido.
- Execução das RPCs foi revogada de `public` e `anon` e concedida somente a `authenticated`.
- Baseline e autoria original do projeto são protegidos por trigger contra alteração posterior.
- Medições são append-only para usuários comuns, sem `UPDATE` concedido.
- Exclusões de projetos, ações e medições ficam restritas a gestor pelas policies existentes do PMG Connect.
- Nenhuma credencial SQL ou chave privada foi incluída nos arquivos do patch.

## Correções

- O grid executivo foi preparado para acomodar o KPI adicional de clientes positivados sem quebrar o layout.
- Cálculo de progresso estratégico foi coberto por teste com baseline e meta percentual.
- Baseline de oportunidades específicas de cliente passa a medir aquele cliente de forma isolada.

## Validações realizadas

- Instalador executado em fixture compatível com a estrutura do PMG Connect: `PASS`.
- Teste `scripts/testar-planejamento-estrategico.mjs`: `PASS`.
- Validação de sintaxe Node em `estrategia-clientes.js`, `estrategia-core.js` e `estrategia.js`: sem erro.
- Verificação estática de integração do atalho na Central e do script `estrategia:testar` no `package.json`: `PASS`.
- Campos SQL usados pela rota de clientes conferidos contra a documentação atual da fonte comercial do PMG Connect.
- Migration preparada para aplicação no Supabase PMG, mas não executada nesta entrega porque o projeto PMG ativo não está acessível pelas conexões desta sessão.

## Arquivos alterados

- `public/planejamento-estrategico.html`
- `public/assets/estrategia-core.js`
- `public/assets/estrategia.js`
- `public/assets/estrategia.css`
- `local-api/estrategia-clientes.js`
- `sql/28-PLANEJAMENTO-ESTRATEGICO.sql`
- `sql/28-ROLLBACK-PLANEJAMENTO-ESTRATEGICO.sql`
- `scripts/instalar-planejamento-estrategico.mjs`
- `scripts/testar-planejamento-estrategico.mjs`
- `public/central.html` via instalador
- `package.json` via instalador
