# Migração: Supabase → SQL Server da rede local

## O que mudou

O projeto até então tinha duas formas de acessar dados:

1. **Rotas em `/api/*.js`** (formato serverless, mesmo padrão do Vercel) —
   já convertidas para usar o SQL Server via `mssql` em vez do Supabase:
   `produtos-supabase.js`, `campanhas-data.js`, `catalogo-estado.js`,
   `salvar-subscricao.js`, `notificar-debitos.js`, `sync-produtos.js`,
   `processar-sellin.js`, `processar-xlsx.js`. **As URLs continuam as
   mesmas** (`/api/produtos-supabase`, `/api/campanhas-data`, etc.), então
   nenhum `fetch(...)` no front-end precisa mudar.

2. **Algumas páginas HTML conectavam DIRETO no Supabase pelo navegador**
   (`dashboard.html`, `dashboard-regional.html`, `fornecedor/slug.html`,
   `fornecedores.html`, `upload-sellin.html`, `central.html`), usando o
   `supabase-js` no `<script>` da página. **Isso não é possível com SQL
   Server** — não existe um "SQL Server para navegador" equivalente à API
   REST do Supabase. Essas páginas ainda **não foram convertidas** e
   precisam de um endpoint em `/api/` próprio pra cada consulta que hoje
   fazem direto — é a próxima etapa (ver "Pendências" abaixo).

## Novo servidor: `server.js`

Criei um servidor Express (`server.js`) que substitui o Vercel:
- Serve os arquivos estáticos de `public/` (então o site inteiro roda por
  ele — `http://localhost:3001/dashboard.html`, por exemplo).
- Carrega **automaticamente** qualquer arquivo `api/<nome>.js` como a rota
  `/api/<nome>` — igual ao Vercel. Não precisa registrar rota na mão.
- Escuta em `0.0.0.0`, ou seja, fica acessível tanto pelo seu PC
  (`localhost`) quanto por outros PCs da rede, pelo IP da sua máquina.

### Como rodar

```bash
npm install
cp .env.example .env
# edite o .env com os dados reais do SQL Server (veja abaixo)
npm start
```

Depois disso, no seu PC: `http://localhost:3001`.
Em outro PC da rede: `http://<IP-do-seu-PC>:3001` (descubra o IP com
`ipconfig` no seu PC, procurando "Endereço IPv4"). Se não conectar de
outro PC, confira se o Firewall do Windows está bloqueando a porta 3001 —
pode ser preciso liberar em "Windows Defender Firewall" → "Regra de
Entrada" → permitir a porta.

**Sobre o Live Server do VS Code:** ele só serve HTML/CSS/JS estático, não
roda o back-end nem fala com o banco. Recomendo abrir o site direto pelo
`server.js` (`npm start` + acessar `http://localhost:3001`) em vez do Live
Server, assim front e API ficam na mesma origem e você evita configuração
extra de CORS/porta. Se ainda assim quiser usar o Live Server só pro
front, ele vai funcionar (deixei `cors()` habilitado no servidor pra isso),
mas vai rodar em uma porta diferente da API.

## Configurando o `.env`

Você disse que o SQL Server **não pede login** — isso normalmente é
Autenticação do Windows (usa o usuário do Windows logado, sem usuário/senha
digitados). Configurei o `.env.example` já para esse caso
(`SQL_TRUSTED_CONNECTION=true`), mas isso exige um pacote extra:

```bash
npm install msnodesqlv8
```

Esse pacote compila um módulo nativo — no Windows, normalmente funciona
direto (ele já traz binários prontos), mas se der erro de compilação, pode
ser necessário instalar o "Build Tools for Visual Studio" com a carga de
trabalho "Desenvolvimento para desktop com C++". Se isso for complicado
demais, me avise e testamos a alternativa: pedir pro DBA/TI criar um login
SQL Server simples (usuário/senha) — aí é só trocar
`SQL_TRUSTED_CONNECTION=false` e preencher `SQL_USER`/`SQL_PASSWORD`, sem
precisar de módulo nativo nenhum.

## Descobrindo os nomes reais das tabelas

Você disse que as tabelas já existem no SQL Server, só que com nomes
diferentes dos usados no código (`produtos`, `fornecedores`,
`notas_fiscais`, `pedidos`, `pedidos_fornecedor`). Depois de configurar o
`.env`, acesse:

```
http://localhost:3001/api/_schema
```

Isso lista todas as tabelas e colunas do banco conectado. Com essa lista em
mãos, edite **`src/lib/tabelas.js`** e troque os nomes lógicos pelos nomes
reais — é o único lugar que precisa mexer para a maioria dos casos, porque
todos os endpoints usam esse arquivo central em vez de nomes fixos.

Atenção: se os **nomes das colunas** também forem diferentes (não só da
tabela), aí só o `tabelas.js` não resolve — vai precisar ajustar as colunas
diretamente dentro do arquivo `api/*.js` correspondente. Me manda a lista
do `/api/_schema` que eu ajusto isso com você.

## Tabelas que são só deste projeto

`campanhas`, `campanhas_representantes`, `campanhas_vendas`,
`campanhas_regras`, `campanhas_regras_produto`, `campanhas_mapeamentos`,
`campanhas_apuracoes`, `catalogo_estado` e `push_subscriptions` não
existiam antes no SQL Server da empresa — foram criadas especificamente
para esta aplicação. Rode o script **`sql/schema.sql`** uma vez no banco
(pelo SSMS, Azure Data Studio, ou `sqlcmd`) pra criá-las.

## Pendências (próxima etapa)

Estas páginas ainda conectam direto no Supabase pelo navegador e precisam
ser convertidas para chamar um endpoint `/api/` (que eu ainda não criei,
porque a consulta de cada uma depende dos nomes reais das colunas, que a
gente só vai saber depois do `/api/_schema`):

- `public/dashboard.html`
- `public/dashboard-regional.html`
- `public/fornecedor/slug.html`
- `public/fornecedores.html`
- `public/upload-sellin.html`
- `public/central.html`

O padrão de conversão é sempre o mesmo: trocar
`const db = supabase.createClient(...)` + `db.from('tabela').select(...)`
por um `fetch('/api/algum-endpoint')` que chama um novo arquivo em `api/`
seguindo o mesmo modelo dos que já converti. Quando você rodar o
`/api/_schema` e me passar os nomes reais, eu sigo convertendo essas
páginas uma a uma.
