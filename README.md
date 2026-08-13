# PMG Connect

Portal interno da PMG para Demandas, Campanhas, dashboards, fornecedores e ferramentas de Marketing.

## Arquitetura atual

- **Vercel / `api/`**: portal público/interno e funções serverless que não dependem do SQL Server da rede.
- **Node local / `local-api/`**: Campanhas e Dashboard Regional, que consultam o SQL Server acessível na rede PMG.
- **Supabase Auth**: sessão única do PMG Connect. As páginas internas não usam mais senha em JSON ou `sessionStorage`.
- **Supabase**: dados de Demandas e módulos que já possuem tabelas próprias, sempre controlados por RLS.
- **Persistência de Campanhas**: IndexedDB continua como cache rápido, com sincronização automática para `data/campanhas-studio-v5.json` no serviço local.

## Instalação local

```powershell
npm install
copy .env.example .env
npm start
```

Preencha o `.env` com as credenciais da instalação. O arquivo `.env` é deliberadamente ignorado pelo Git e não deve ser enviado em ZIPs.

O servidor local usa por padrão:

```text
http://localhost:3001
```

Campanhas e Dashboard Regional abertos pelo portal hospedado transferem a sessão autenticada para o serviço local por um fragmento temporário da URL, removido após a validação.

## Segurança

Antes de publicar esta versão pela primeira vez, execute no **SQL Editor do Supabase**:

```text
sql/SEGURANCA-PMG-CONNECT.sql
```

O script remove escrita pelo papel `anon` nas tabelas administrativas e mantém leitura pública somente onde o dashboard compartilhável por fornecedor exige.

## Variáveis importantes

Consulte `.env.example`. Além de SQL Server e Supabase, o catálogo externo precisa de `PMG_API_URL`, `PMG_USUARIO` e `PMG_SENHA`. O proxy de imagens só aceita o host de `PMG_API_URL` ou hosts listados explicitamente em `PMG_IMAGE_PROXY_HOSTS`. Cadastre também o mesmo `CRON_SECRET` nas variáveis da Vercel e em **GitHub > Settings > Secrets and variables > Actions**, pois o workflow de débitos usa esse segredo para chamar o endpoint.

## Diagnóstico

```powershell
npm run diagnostico:regional
```

Para validar sintaxe do backend/front-end JavaScript:

```powershell
node --check server.js
```
