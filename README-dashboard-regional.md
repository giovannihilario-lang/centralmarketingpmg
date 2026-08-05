# Correção do Dashboard Regional

## O que causava o erro

O arquivo `public/dashboard-regional.html` estava chamando `http://localhost:3001/api` mesmo quando publicado na Vercel. Além disso, os endpoints do dashboard tinham sido movidos para fora de `/api` para respeitar o limite do plano Hobby.

## O que foi alterado

- Criada uma única função serverless: `api/regional.js`.
- As oito consultas do dashboard foram movidas para `src/regional-api/` e são importadas pela função única.
- O dashboard agora chama `/api/regional?rota=...`, funcionando no localhost e na Vercel.
- `api/campanhas.js`, diagnósticos e APIs regionais antigas foram movidos para `api-legacy/`.
- A pasta `/api` ficou com exatamente 12 funções, dentro do limite do plano Hobby.

## Publicação

```powershell
git add .
git commit -m "Corrige API do dashboard regional na Vercel"
git push origin main
```

Depois acompanhe o novo deployment na Vercel.
