# Limpeza para Vercel Hobby

Este pacote foi consolidado para permanecer abaixo do limite de 12 Serverless Functions do plano Hobby.

## Resultado

- 9 funções ativas em `api/` + 1 entrypoint Express;
- 2 posições livres no limite do plano Hobby;
- `server.js` preservado como entrypoint exigido pela detecção Express da Vercel;
- cron vazio `sync-produtos` removido;
- endpoints antigos `produtos` e `analisar-banner` removidos por não terem consumidores ativos;
- cópias de API, servidor, dependências e documentação que estavam dentro de `public/` removidas;
- caches gerados, credenciais, `node_modules` e metadados Git não fazem parte do pacote.

## Conferência antes de publicar

```bash
npm install
npm run vercel:check
```

O comando deve informar:

```text
OK: 10 funções Serverless (9 rotas + Express). Há margem de 2 no plano Hobby.
```

## Publicação

O projeto pode seguir pelo fluxo já usado no GitHub/Vercel. A pasta `public/data` continua sendo publicada; somente a pasta `data` da raiz, usada pelo servidor local, é ignorada pela Vercel.
