import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

const LOTE = 500;
let totalInseridos = 0;

for (let i = 0; i < pedidos.length; i += LOTE) {
  const lote = pedidos.slice(i, i + LOTE);
  const { error: erroInsert } = await supabase
  .from('pedidos')
  .upsert(lote, { onConflict: 'pedido_id,produto_id,data_entrega', ignoreDuplicates: true });
  if (erroInsert) throw erroInsert;
  totalInseridos += lote.length;
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