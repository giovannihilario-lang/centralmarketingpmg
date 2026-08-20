# Campanhas V3.3 — regras visuais e apuração SQL

## Instalação

Extraia o patch sobre a raiz do projeto e aceite substituir os arquivos.

```powershell
npm install
npm start
```

Abra:

```text
http://localhost:3001/campanhas.html
```

Na primeira abertura, use `Ctrl + F5`.

## Vercel

A V3.3 adiciona `api/campanhas-data.js`. O projeto fica com 11 arquivos JavaScript dentro de `/api`.

Cadastre no projeto da Vercel as mesmas variáveis usadas localmente:

```text
SQL_SERVER
SQL_DATABASE
SQL_USER
SQL_PASSWORD
SQL_ENCRYPT=true
SQL_TRUSTED_CONNECTION=false
```

Depois faça um novo deploy.

## Fonte dos dados

- Fornecedores e produtos: `dbo.Produtos`
- Vendedores: união de `dbo.Vendas.[Vendedor]` e `dbo.Clientes.[Vendedor]`
- Apuração: `dbo.Vendas`, `dbo.VendasProdutos`, `dbo.Produtos` e `dbo.Clientes`
- Data utilizada: `dbo.Vendas.[Data]`

## Convenção de período

As datas de início e fechamento precisam ser segundas-feiras. A data final é exclusiva.

Exemplo:

```text
Início: 06/07/2026
Fechamento: 20/07/2026
Vendas da campanha: 06/07/2026 a 19/07/2026
Período anterior: 22/06/2026 a 05/07/2026
```
