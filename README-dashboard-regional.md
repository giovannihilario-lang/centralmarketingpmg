# Dashboard Regional — arquitetura ativa

## Como funciona agora

O Dashboard Regional é servido por `public/dashboard-regional.html` e, no ambiente local, chama `http://localhost:3001/api`.

As rotas SQL ativas ficam em `local-api/` e são registradas pelo `server.js`. Toda a lógica SQL compartilhada do Regional fica centralizada em `src/lib/regional-dashboard.js`.

`src/regional-api/` existe apenas como camada de compatibilidade e reexporta as implementações de `local-api/`. Não há mais duas cópias independentes das regras.

Os arquivos regionais antigos de `api-legacy/` e `api-backup/regional.js` foram removidos para evitar manutenção acidental da implementação errada.

## Regras de integridade aplicadas

- `Vendas`, `Clientes` e `Produtos` são reduzidos a uma linha por ID antes dos JOINs do Regional.
- O faturamento e o volume continuam vindo de `VendasProdutos`, sem deduplicar linhas de item legítimas.
- O ticket médio é `faturamento / pedidos distintos`, e não `faturamento / linhas de produto`.
- Cidades são contadas com normalização de caixa, espaços e collation sem diferenciação de acento.
- O heatmap agrupa por UF + ano + mês; anos diferentes nunca são somados no mesmo mês visual.
- O botão "Atualizar dados" envia `p_refresh=1` e ignora o cache do servidor naquele ciclo.
- Filtros exibem contagem de pedidos distintos e aceitam os demais filtros como contexto.
- Conexões SQL usam o pool compartilhado de `src/lib/db.js`.

## CORS / acesso local

Por padrão a API aceita:

- `localhost` e `127.0.0.1`;
- o projeto `pmg-marketing` na Vercel.

Origens extras devem ser informadas explicitamente na variável:

```env
PMG_ALLOWED_ORIGINS=https://exemplo.interno,https://outro-dominio.com
```

## Executar

```powershell
npm install
npm start
```

Dashboard:

```text
http://localhost:3001/dashboard-regional.html
```

## Diagnóstico de números

Na rede que consegue acessar o Azure SQL, execute:

```powershell
npm run diagnostico:regional
```

O comando compara o JOIN antigo com a base deduplicada e mostra o ticket médio por pedido. Ele também informa quantas duplicidades existem nos IDs de Clientes, Produtos e Vendas.
