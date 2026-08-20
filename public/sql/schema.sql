-- Tabelas próprias deste projeto (não existiam antes no SQL Server da
-- empresa — as de negócio, como produtos/fornecedores/notas_fiscais/pedidos,
-- já existem no banco com outros nomes; ajuste em src/lib/tabelas.js).
--
-- Rode este script uma vez no banco (SSMS, Azure Data Studio, ou sqlcmd).

CREATE TABLE campanhas (
  id NVARCHAR(100) NOT NULL PRIMARY KEY,
  nome NVARCHAR(200) NOT NULL DEFAULT '',
  dados NVARCHAR(MAX) NOT NULL,
  atualizado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE campanhas_representantes (
  id NVARCHAR(100) NOT NULL PRIMARY KEY,
  dados NVARCHAR(MAX) NOT NULL,
  atualizado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE campanhas_vendas (
  id NVARCHAR(100) NOT NULL PRIMARY KEY,
  campanha_id NVARCHAR(100) NOT NULL,
  dados NVARCHAR(MAX) NOT NULL,
  atualizado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE campanhas_regras (
  id NVARCHAR(100) NOT NULL PRIMARY KEY,
  campanha_id NVARCHAR(100) NOT NULL,
  dados NVARCHAR(MAX) NOT NULL,
  atualizado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE campanhas_regras_produto (
  id NVARCHAR(100) NOT NULL PRIMARY KEY,
  campanha_id NVARCHAR(100) NOT NULL,
  dados NVARCHAR(MAX) NOT NULL,
  atualizado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE campanhas_mapeamentos (
  id NVARCHAR(100) NOT NULL PRIMARY KEY,
  campanha_id NVARCHAR(100) NOT NULL,
  dados NVARCHAR(MAX) NOT NULL,
  atualizado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE campanhas_apuracoes (
  id NVARCHAR(100) NOT NULL PRIMARY KEY,
  campanha_id NVARCHAR(100) NOT NULL,
  dados NVARCHAR(MAX) NOT NULL,
  atualizado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE catalogo_estado (
  id INT NOT NULL PRIMARY KEY,
  estado NVARCHAR(MAX) NOT NULL,
  atualizado_em DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
INSERT INTO catalogo_estado (id, estado) VALUES (1, '{}');

CREATE TABLE push_subscriptions (
  endpoint NVARCHAR(450) NOT NULL PRIMARY KEY,
  p256dh NVARCHAR(200) NOT NULL,
  auth NVARCHAR(200) NOT NULL
);

-- As tabelas de negócio abaixo são exemplos do formato esperado pelo código
-- (api/notificar-debitos.js, api/processar-sellin.js). Se as que já existem
-- no banco tiverem colunas com nomes diferentes, ajuste as queries nos
-- arquivos api/*.js correspondentes (não dá pra só trocar em tabelas.js,
-- porque os nomes de COLUNA também podem ser diferentes).
--
-- CREATE TABLE notas_fiscais (
--   fornecedor_id INT NOT NULL,
--   nfe_id BIGINT NOT NULL,
--   numero NVARCHAR(50),
--   emissao DATETIME2,
--   cnpj_emitente NVARCHAR(20),
--   emitente NVARCHAR(200),
--   valor DECIMAL(18,2),
--   situacao NVARCHAR(50),
--   compra_id NVARCHAR(50),
--   natureza_operacao NVARCHAR(100)
-- );
