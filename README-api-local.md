# API local e Vercel

O PMG Connect usa duas camadas de API:

- `api/`: funções publicadas na Vercel, limitadas a 12 no plano Hobby.
- `local-api/`: consultas do Dashboard Regional que acessam o SQL Server disponível apenas na rede local.

O `server.js` carrega as duas pastas e publica todas localmente em `/api/<nome>`.
A Vercel ignora `local-api/`, portanto essas consultas não consomem o limite de Serverless Functions.

## Iniciar o servidor local

```powershell
npm install
npm start
```

Depois acesse:

```text
http://localhost:3001/dashboard-regional.html
```

O arquivo `public/dashboard-regional.html` permanece configurado com:

```js
const API_BASE = 'http://localhost:3001/api';
```

Se o frontend for aberto pela Vercel na mesma máquina, ele ainda tentará consultar o servidor local desse computador. O servidor Node precisa estar rodando.
