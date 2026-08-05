import * as XLSX from 'xlsx';
import { getPool, sql } from '../src/lib/db.js';
import { TABELAS } from '../src/lib/tabelas.js';

// Separa "7337 - COSTELA BOVINA CONGELADA..." em { id: 7337, nome: "COSTELA BOVINA CONGELADA..." }
function separarCodigoNome(texto) {
  if (!texto || typeof texto !== 'string') return { id: null, nome: null };
  const match = texto.match(/^(\d+)\s*-\s*(.+)$/);
  if (match) {
    return { id: Number(match[1]), nome: match[2].trim() };
  }
  return { id: null, nome: texto.trim() };
}

// Converte data, aceitando tanto objeto Date quanto string ISO/texto
function paraISODate(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'string') {
    const d = new Date(valor);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

export default async function handler(req, res) {
  if (!TABELAS.pedidos) {
    return res.status(501).json({
      erro: 'Upload de pedidos ainda não migrado: falta definir a tabela de pedidos no SQL Server (veja src/lib/tabelas.js).',
    });
  }
  if (req.method !== 'POST') return res.status(405).end();

  let rows = null;

  try {
    const { fileBase64 } = req.body;
    const buffer = Buffer.from(fileBase64, 'base64');

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Cabeçalho está no índice 7. Dados começam no índice 8.
    const dataRows = rows.slice(8).filter(row => row[0] && row[0] !== '');

    const pedidos = dataRows.map(row => {
      const clienteId = separarCodigoNome(row[1]).id; // "195684 - ESPIHARIA PREMIUM" -> 195684
      const produto = separarCodigoNome(row[11]); // "7337 - COSTELA BOVINA..."

      const dataEmissao = paraISODate(row[5]);
      const dataEntrega = paraISODate(row[8]);

      return {
        pedido_id:        row[0] ? Number(row[0]) : null,
        cliente_id:       clienteId,
        segmento:         row[3] || null,
        data_emissao:     dataEmissao,
        data_entrega:     dataEntrega ? dataEntrega.split('T')[0] : null,
        vendedor:         row[9] || null,
        digitador:        row[10] || null,
        produto_id:       produto.id,
        produto:          produto.nome,
        qtde:             row[12] !== '' && row[12] != null ? Number(row[12]) : null,
        unidade:          row[13] || null,
        valor_unitario:   row[15] !== '' && row[15] != null ? Number(row[15]) : null,
        total_venda:      row[16] !== '' && row[16] != null ? Number(row[16]) : null,
        total_pedido:     row[17] !== '' && row[17] != null ? Number(row[17]) : null,
        peso_kg:          row[18] !== '' && row[18] != null ? Number(row[18]) : null,
      };
    }).filter(p => p.pedido_id);

const pool = await getPool();
let totalInseridos = 0;

for (const p of pedidos) {
  const request = pool.request();
  request.input('pedidoId', sql.Int, p.pedido_id);
  request.input('clienteId', sql.Int, p.cliente_id);
  request.input('segmento', sql.NVarChar, p.segmento);
  request.input('dataEmissao', sql.DateTime2, p.data_emissao ? new Date(p.data_emissao) : null);
  request.input('dataEntrega', sql.Date, p.data_entrega ? new Date(p.data_entrega) : null);
  request.input('vendedor', sql.NVarChar, p.vendedor);
  request.input('digitador', sql.NVarChar, p.digitador);
  request.input('produtoId', sql.Int, p.produto_id);
  request.input('produto', sql.NVarChar, p.produto);
  request.input('qtde', sql.Decimal(18, 3), p.qtde);
  request.input('unidade', sql.NVarChar, p.unidade);
  request.input('valorUnitario', sql.Decimal(18, 2), p.valor_unitario);
  request.input('totalVenda', sql.Decimal(18, 2), p.total_venda);
  request.input('totalPedido', sql.Decimal(18, 2), p.total_pedido);
  request.input('pesoKg', sql.Decimal(18, 3), p.peso_kg);

  // Só insere se a combinação pedido_id + produto_id + data_entrega ainda
  // não existir (equivalente ao upsert com ignoreDuplicates do Supabase).
  await request.query(`
    MERGE ${TABELAS.pedidos} AS destino
    USING (SELECT @pedidoId AS pedido_id, @produtoId AS produto_id, @dataEntrega AS data_entrega) AS origem
      ON destino.pedido_id = origem.pedido_id
     AND destino.produto_id = origem.produto_id
     AND destino.data_entrega = origem.data_entrega
    WHEN NOT MATCHED THEN INSERT
      (pedido_id, cliente_id, segmento, data_emissao, data_entrega, vendedor, digitador,
       produto_id, produto, qtde, unidade, valor_unitario, total_venda, total_pedido, peso_kg)
    VALUES
      (@pedidoId, @clienteId, @segmento, @dataEmissao, @dataEntrega, @vendedor, @digitador,
       @produtoId, @produto, @qtde, @unidade, @valorUnitario, @totalVenda, @totalPedido, @pesoKg);
  `);
  totalInseridos++;
}

res.status(200).json({
  inseridos: totalInseridos,
  amostra: pedidos.slice(0, 2),
});

  } catch (err) {
    console.error(err);
    res.status(500).json({
      erro: err.message,
      debug_total_linhas_arquivo: rows ? rows.length : null,
    });
  }
}