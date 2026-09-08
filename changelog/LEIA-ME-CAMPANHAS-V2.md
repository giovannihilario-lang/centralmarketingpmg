# Teste do Construtor de Campanhas PMG

## O que este patch adiciona

- Produtos consultados diretamente de `dbo.Produtos` no SQL Server.
- Busca e filtros por fornecedor, grupo, subgrupo e status.
- Categorias personalizadas dentro de cada campanha.
- Drag and drop do catálogo para as categorias e entre categorias.
- Produtos usados como escopo da campanha e como base do mix.
- Pontuação configurável por peça, quilo, real faturado ou item de venda.
- Campanhas, regras e apurações salvas em JSON local, sem criar tabelas no SQL Server.
- Positivação tratada como clientes únicos no período.
- Saldo de clientes separado da positivação.

## Instalação

1. Faça uma cópia de segurança do projeto.
2. Extraia o conteúdo deste ZIP dentro da raiz de `pmg-marketing`, mantendo as pastas.
3. Confirme a substituição de `public/campanhas.html`.
4. Exclua o arquivo antigo:

```powershell
Remove-Item .\api\campanhas-data.js
```

5. Inicie o servidor:

```powershell
npm start
```

6. Abra:

```text
http://localhost:3001/campanhas.html
```

7. Entre em **Campanhas**, crie ou edite uma campanha e abra **Regras de Produto**.

## Teste rápido da API

```text
http://localhost:3001/api/campanhas-data?recurso=produtos&limite=10
```

A resposta deve trazer produtos de `dbo.Produtos`.

Teste da persistência local:

```text
http://localhost:3001/api/campanhas-data?tabela=campanhas
```

Na primeira execução, o servidor cria automaticamente:

```text
data/campanhas-db.json
```

## Importante

Este patch muda o cadastro e a configuração visual das campanhas. A apuração atual ainda usa as vendas importadas pela própria tela. A conexão automática de `dbo.Vendas` e `dbo.VendasProdutos` deve ser feita na próxima etapa, depois de validarmos o construtor de produtos e regras.
