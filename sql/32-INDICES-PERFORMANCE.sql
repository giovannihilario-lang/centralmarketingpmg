-- 32-INDICES-PERFORMANCE.sql
--
-- Índices que faltam nas tabelas de vendas/clientes/produtos do SQL Server.
-- Sem eles, consultas como o Planejamento Estratégico (sinais de clientes)
-- escaneiam a tabela inteira e podem estourar o timeout de 120s.
--
-- Seguro rodar mais de uma vez: cada bloco verifica se o índice já existe
-- antes de criar. Não apaga nem altera nenhum dado, só acelera leituras.
--
-- Requer um login com permissão de ALTER/DDL nas tabelas abaixo (o login
-- que o aplicativo usa no dia a dia só tem permissão de leitura, de
-- propósito). Rodar no Query editor do Portal do Azure (SQL databases ->
-- o banco -> Query editor) ou em qualquer cliente (SSMS, Azure Data
-- Studio) logado como admin do servidor.

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VendasProdutos_Pedido')
  CREATE NONCLUSTERED INDEX IX_VendasProdutos_Pedido
    ON dbo.VendasProdutos ([ID Pedido de Venda])
    INCLUDE (Valor, [Qtde Kg], [ID Produto]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VendasProdutos_Produto')
  CREATE NONCLUSTERED INDEX IX_VendasProdutos_Produto
    ON dbo.VendasProdutos ([ID Produto])
    INCLUDE (Valor, [Qtde Kg], [ID Pedido de Venda]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Vendas_Cliente')
  CREATE NONCLUSTERED INDEX IX_Vendas_Cliente
    ON dbo.Vendas ([ID Cliente])
    INCLUDE (Data);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Vendas_Data')
  CREATE NONCLUSTERED INDEX IX_Vendas_Data
    ON dbo.Vendas (Data)
    INCLUDE ([ID Cliente]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Clientes_Zona')
  CREATE NONCLUSTERED INDEX IX_Clientes_Zona
    ON dbo.Clientes (Zona)
    INCLUDE (Cidade, UF, [ID Cliente]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Clientes_UF')
  CREATE NONCLUSTERED INDEX IX_Clientes_UF
    ON dbo.Clientes (UF)
    INCLUDE (Cidade, Zona, [ID Cliente]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Clientes_Segmento')
  CREATE NONCLUSTERED INDEX IX_Clientes_Segmento
    ON dbo.Clientes (Segmento)
    INCLUDE ([ID Cliente]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Produtos_Grupo')
  CREATE NONCLUSTERED INDEX IX_Produtos_Grupo
    ON dbo.Produtos (Grupo)
    INCLUDE ([ID Produto], Fornecedor);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Produtos_Fornecedor')
  CREATE NONCLUSTERED INDEX IX_Produtos_Fornecedor
    ON dbo.Produtos (Fornecedor)
    INCLUDE ([ID Produto], Grupo);
