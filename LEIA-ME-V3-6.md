# Campanhas PMG V3.6 — arquitetura híbrida

Este patch não altera o design, as regras visuais nem as métricas da V3.5.
Ele troca apenas a infraestrutura de dados:

- SQL Server / Power BI: fornecedores, produtos logísticos, vendedores ativos e apuração.
- Supabase: campanhas, regras, categorias, mapeamentos e resultados compartilhados.
- Vercel Function: uma única rota `/api/campanhas-data` faz o papel de BFF.
- Supabase Cache: mantém a última resposta válida do SQL para contingência.
- IndexedDB: cache no navegador e fila de alterações quando a internet/API falhar.

## Instalação

1. No Supabase, abra SQL Editor e execute `sql/campanhas_supabase_hibrido.sql`.
2. Copie `api`, `public` e `sql` deste patch para a raiz do projeto.
3. Confira na Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ENCRYPT=true`.
4. Faça commit e push.
5. Após o deploy, abra `/api/campanhas-data?recurso=diagnostico`.

O diagnóstico deve mostrar pelo menos um dos serviços como disponível. Para operação completa, SQL e Supabase devem aparecer com `ok: true`.
