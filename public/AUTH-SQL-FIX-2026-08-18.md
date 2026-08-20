# Correção da ponte PMG Connect → API local → SQL Server

Data: 18/08/2026

## Falha identificada

O `server.js` exige uma sessão válida do PMG Connect para todas as rotas de `local-api`.
A versão atual do `connect-auth.js` conseguia **receber** `#pmg_auth` no localhost, porém a versão hospedada não criava mais essa ponte a partir da sessão do Supabase.

Além disso, páginas como `dashboard.html`, `fornecedores.html` e `upload-sellin.html` ainda dependiam de `window.PMGConnect`, removido na refatoração de autenticação.

No Dashboard Regional, os `fetch()` para `/api/*` também não incluíam `Authorization`, portanto o Node respondia `PMG_AUTH_REQUIRED` antes de qualquer tentativa de conexão ao SQL Server.

## Ajustes

- restaurado `window.PMGConnect` nas páginas hospedadas;
- restaurada validação de sessão nas páginas com `data-pmg-auth`;
- restaurada a ponte de sessão completa (access token + refresh token) para `localhost:3001`;
- mantido o refresh automático introduzido nas versões mais novas;
- chamadas `/api/*` no Node local agora recebem Bearer automaticamente;
- `campanhas.html` volta a aguardar a sessão antes de redirecionar ao localhost;
- `dashboard-regional.html` volta a redirecionar com sessão válida;
- cache-busting do `connect-auth.js` atualizado para `v=1.2.0`.

## Importante sobre Azure SQL

A autenticação local acontece antes da conexão SQL. Portanto, enquanto houver `PMG_AUTH_REQUIRED`, o estado real do Azure SQL fica mascarado. Depois que a autenticação passar, qualquer erro de limite, login, firewall ou indisponibilidade do SQL voltará a aparecer como erro do banco.

## Diagnóstico HTTP da API local

O `server.js` agora diferencia:

- `PMG_AUTH_REQUIRED`: não chegou Bearer;
- `PMG_AUTH_INVALID`: Bearer chegou, mas a sessão foi recusada/expirou;
- `PMG_AUTH_UNAVAILABLE`: configuração do Supabase não está disponível no Node local.

Isso evita que problemas distintos sejam apresentados como se fossem sempre ausência de sessão.
