/**
 * Mapeamento entre os nomes "lógicos" que o código usa e os nomes reais
 * das tabelas no SQL Server (Azure SQL "powerbi").
 *
 * Situação atual (checado em 31/07/2026 via GET /api/_schema):
 *
 * - O catálogo de produtos (preço, imagem, descrição, destaque) NÃO tem
 *   fonte nesse banco — dbo.Produtos existe, mas só com dados logísticos
 *   do ERP (palete, comissão, NCM...). Por decisão do time, o catálogo
 *   continua vindo direto da API externa da PMG
 *   (api/produtos-supabase.js), sem depender de tabela nenhuma aqui.
 *
 * - Fornecedores (com % de sell-in) e Notas Fiscais também não têm tabela
 *   equivalente nesse banco. Por decisão do time, essa parte (débitos de
 *   sell-in) fica ADIADA por enquanto — os endpoints que dependem disso
 *   (notificar-debitos.js, processar-sellin.js) vão retornar erro até que
 *   se defina onde esses dados vão morar.
 *
 * - dbo.Vendas / dbo.VendasProdutos existem e parecem equivaler a
 *   "pedidos"/itens de pedido, mas com estrutura de colunas bem diferente
 *   do que processar-xlsx.js espera (que vem de upload de planilha, não do
 *   ERP). NÃO mapeado ainda — avaliar com calma antes de conectar.
 *
 * As únicas tabelas realmente em uso hoje são as próprias do projeto
 * (criadas via sql/schema.sql): campanhas_*, catalogo_estado e
 * push_subscriptions.
 */
export const TABELAS = {
  // ---- em uso: tabelas próprias do projeto (sql/schema.sql) ----
  catalogo_estado: 'catalogo_estado',
  push_subscriptions: 'push_subscriptions',
  campanhas: 'campanhas',
  campanhas_representantes: 'campanhas_representantes',
  campanhas_vendas: 'campanhas_vendas',
  campanhas_regras: 'campanhas_regras',
  campanhas_regras_produto: 'campanhas_regras_produto',
  campanhas_mapeamentos: 'campanhas_mapeamentos',
  campanhas_apuracoes: 'campanhas_apuracoes',

  // ---- adiado: sem tabela equivalente confirmada ainda ----
  fornecedores: null, // TODO: decidir onde vive isso (sell-in)
  notas_fiscais: null, // TODO: decidir onde vive isso (sell-in)
  pedidos: null, // candidato: dbo.Vendas, mas colunas divergem — avaliar
  pedidos_fornecedor: null, // candidato: dbo.VendasProdutos — avaliar
};
