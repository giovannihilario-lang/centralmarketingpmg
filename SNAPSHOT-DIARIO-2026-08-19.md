# Snapshot comercial diário — 19/08/2026

## Objetivo

O Dashboard Regional e o módulo de Campanhas deixam de consultar o Azure SQL a cada filtro/apuração. A instalação local do PMG Connect faz uma carga comercial por dia e usa o arquivo local durante o restante do expediente.

A Vercel continua no plano Hobby e não armazena o snapshot. O arquivo é persistido pelo `server.js` local em:

```text
data/pmg-comercial-diario-v1.json.gz
```

O arquivo está no `.gitignore` e não deve ser versionado.

## Fluxo

1. O usuário autentica no PMG Connect hospedado.
2. `public/assets/connect-auth.js` tenta chamar `http://localhost:3001/api/dados-diarios?acao=garantir` com o Bearer token da sessão.
3. A API local verifica se já existe snapshot do dia no fuso `America/Sao_Paulo`.
4. Se já existe, responde imediatamente e não abre o Azure SQL.
5. Se não existe, uma única Promise compartilhada executa a carga. Acessos concorrentes aguardam a mesma sincronização.
6. A carga copia somente as colunas usadas por Regional e Campanhas das tabelas `Vendas`, `VendasProdutos`, `Produtos` e `Clientes`.
7. O arquivo novo é gravado de forma atômica e o pool SQL é fechado após a carga.
8. Regional e Campanhas passam a calcular filtros, KPIs, rankings, auditorias e benefícios usando o snapshot local.

Se a chamada do site hospedado para `localhost` for bloqueada pelo navegador ou o Node não estiver aberto, o primeiro acesso ao Regional/Campanhas executa a mesma garantia de snapshot. O login não é bloqueado por essa falha.

## Segurança contra carga duplicada

A sincronização usa uma Promise global. Se três usuários/processos HTTP chegarem ao mesmo Node local ao mesmo tempo, somente a primeira requisição consulta o SQL; as outras aguardam o mesmo resultado.

Depois de uma falha de sincronização, o Node não tenta novamente em cada clique no mesmo dia. Se existir snapshot anterior, ele continua sendo servido com `stale: true`. Uma nova tentativa pode ser feita manualmente.

## Horário mínimo opcional

Se a carga do Azure termina, por exemplo, às 08:15, configure no `.env`:

```env
PMG_SNAPSHOT_TIMEZONE=America/Sao_Paulo
PMG_SNAPSHOT_NOT_BEFORE=08:15
PMG_SNAPSHOT_SQL_TIMEOUT_MS=600000
```

Antes desse horário, se houver snapshot anterior, ele continua sendo usado. O primeiro acesso após 08:15 faz a atualização. Se não houver snapshot algum, a instalação ainda tenta carregar para não deixar o sistema sem dados.

## Endpoints operacionais

Status, sem disparar atualização:

```text
GET /api/dados-diarios?acao=status
```

Garantir snapshot do dia:

```text
GET /api/dados-diarios?acao=garantir
```

Forçar nova sincronização manual no mesmo dia:

```text
POST /api/dados-diarios?acao=forcar
```

Todas essas rotas pertencem a `local-api/` e continuam exigindo autenticação do PMG Connect por padrão.

## Compatibilidade de dados

O snapshot preserva separadamente as regras de deduplicação que já existiam:

- Campanhas mantém a regra de pedido que prioriza data e vendedor preenchido.
- Regional mantém a regra histórica de pedido baseada em data e cliente.
- Campanhas mantém o cadastro de produto com preferência por registro ativo.
- Regional mantém a regra própria de completude cadastral do produto.
- `VendasProdutos` é copiada sem agregação para preservar a contagem e os somatórios originais do Regional.

Isso evita alterar números apenas por trocar a fonte das consultas.

## Escopo da regra “uma vez por dia”

A regra vale por instalação do `server.js`. Se cada computador executa seu próprio `npm start`, cada computador terá seu próprio snapshot e fará sua própria carga diária. Para uma única carga diária compartilhada por toda a empresa, o Node local precisa estar centralizado em uma máquina/servidor acessível aos usuários e os frontends precisam apontar para essa instalação em vez de `localhost`.
