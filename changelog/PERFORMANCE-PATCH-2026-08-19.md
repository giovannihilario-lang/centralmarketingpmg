# PMG Connect — Patch de performance 2026-08-19

Mudanças aplicadas sem alterar regras comerciais ou layout:

- Dashboard Regional limita a concorrência de gráficos pesados.
- Quando há período selecionado, o Regional identifica primeiro os pedidos candidatos pelo intervalo e só então aplica o ROW_NUMBER nesses pedidos, preservando a regra canônica e reduzindo o volume ordenado.
- API local possui fila de concorrência (padrão: 3) para não saturar Azure SQL.
- Pool SQL reduzido para 4 conexões por padrão e configurável via `SQL_POOL_MAX`.
- Filtros iniciais do Regional usam modo rápido, lendo Clientes/Produtos sem atravessar VendasProdutos.
- Períodos sem filtros são lidos diretamente de dbo.Vendas.
- Contagens contextuais dos filtros são atualizadas depois, sem bloquear a tela principal.
- Cache do Regional ampliado: 10 min para agregações e 30 min para catálogo.
- Cache do navegador do Regional ampliado para 5 min.
- Campanhas mantém cache de apuração por 10 min.
- Campanhas identifica primeiro os pedidos dos períodos atual/anterior e executa o ROW_NUMBER somente sobre esses pedidos, preservando a escolha da linha canônica e reduzindo o conjunto ordenado.
- A apuração do Campanhas usa timeout de navegador compatível com o backend para não exibir erro falso aos 20 s enquanto o SQL ainda executa.

Não foram criados nem alterados índices no banco de dados.
