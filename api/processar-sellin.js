import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function paraISODate(valor) {
  if (!valor) return null;

  // Se for o número serial do Excel
  if (typeof valor === 'number') {
    const dataDate = XLSX.SSF.parse_date_code(valor);
    if (dataDate) {
      const d = new Date(Date.UTC(dataDate.y, dataDate.m - 1, dataDate.d, dataDate.H, dataDate.M, dataDate.S));
      return !isNaN(d.getTime()) ? d.toISOString() : null;
    }
  }

  // Se já for um objeto Date
  if (valor instanceof Date) {
    return !isNaN(valor.getTime()) ? valor.toISOString() : null;
  }

  // Se for string formatada PT-BR (DD/MM/AAAA)
  if (typeof valor === 'string') {
    const limpo = valor.trim();
    const matchBR = limpo.match(/^(\d{2})[/\-](\d{2})[/\-](\d{4})/);
    if (matchBR) {
      const [_, dia, mes, ano] = matchBR;
      const d = new Date(`${ano}-${mes}-${dia}T12:00:00Z`);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const d = new Date(limpo);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

// Converte valor monetário vindo do Excel para Number, tratando tanto
// número nativo (raw) quanto string formatada em padrão BR ("13.997,94").
function paraNumero(valor) {
  if (valor === '' || valor == null) return 0;

  // Já é número (caso ideal, vem do XLSX com raw:true)
  if (typeof valor === 'number') return valor;

  let stringValor = String(valor).trim().replace(/\s/g, '');
  if (stringValor === '') return 0;

  // Formato BR: "13.997,94" -> remove ponto de milhar, troca vírgula por ponto
  if (stringValor.includes(',')) {
    stringValor = stringValor.replace(/\./g, '').replace(',', '.');
  }
  // Sem vírgula: já está em formato numérico padrão ("13997.94" ou "13997")
  // Não mexe no ponto, senão vira separador de milhar e infla o valor.

  const num = Number(stringValor);
  return isNaN(num) ? 0 : num;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  let rows = null;

  try {
    const { fileBase64, fornecedorId } = req.body;
    if (!fornecedorId) {
      return res.status(400).json({ erro: 'fornecedorId é obrigatório.' });
    }

    const buffer = Buffer.from(fileBase64, 'base64');

    // raw:true -> pega o valor numérico nativo da célula (evita depender da
    // formatação de exibição do Excel, que pode estar errada na origem).
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ erro: 'O arquivo enviado está vazio.' });
    }

    // FILTRO: apenas notas Autorizadas e de Natureza "venda"
    const filtradas = rows.filter(r => {
      const situacao = String(r['Situação'] || '').trim().toLowerCase();
      const natureza = String(r['Natureza de Operação'] || '').trim().toLowerCase();

      const ehAutorizada = situacao === 'autorizada';
      const ehVenda = natureza.includes('venda');

      return ehAutorizada && ehVenda;
    });

    const notas = filtradas.map(r => {
      const rawId = r['ID'];
      const nfe_id = rawId !== '' && rawId != null ? Number(String(rawId).replace(/\D/g, '')) : null;

      let compraIdLimpo = null;
      if (r['Compra_ID'] !== '' && r['Compra_ID'] != null) {
        compraIdLimpo = String(r['Compra_ID']).split('.')[0];
      }

      const valorConvertido = paraNumero(r['Valor']);

      // DEBUG: comparar valor bruto da planilha com o valor convertido.
      // Remover depois de confirmar que está correto em produção.
      console.log('NFe valor:', { numero: r['Número'], excel: r['Valor'], convertido: valorConvertido });

      return {
        fornecedor_id: Number(fornecedorId),
        nfe_id,
        numero: r['Número'] != null ? String(r['Número']).trim() : null,
        emissao: paraISODate(r['Emissão']),
        cnpj_emitente: r['CNPJ'] ? String(r['CNPJ']).trim() : null,
        emitente: r['Emitente'] ? String(r['Emitente']).trim() : null,
        valor: valorConvertido,
        situacao: r['Situação'] ? String(r['Situação']).trim() : null,
        compra_id: compraIdLimpo,
        natureza_operacao: r['Natureza de Operação'] ? String(r['Natureza de Operação']).trim() : null,
      };
    }).filter(n => n.nfe_id && n.emissao);

    if (notas.length === 0) {
      return res.status(200).json({ mensagem: "Nenhuma nota restou após os filtros estritos." });
    }

    // 1. Limpa registros anteriores deste fornecedor
    const { error: delErr } = await supabase
      .from('notas_fiscais')
      .delete()
      .eq('fornecedor_id', fornecedorId);
    if (delErr) throw delErr;

    // 2. Insere os lotes
    const LOTE = 500;
    let totalInseridos = 0;
    for (let i = 0; i < notas.length; i += LOTE) {
      const lote = notas.slice(i, i + LOTE);
      const { error: erroInsert } = await supabase.from('notas_fiscais').insert(lote);
      if (erroInsert) throw erroInsert;
      totalInseridos += lote.length;
    }

    res.status(200).json({
      inseridos: totalInseridos,
      total_linhas_arquivo: rows.length,
      filtradas_com_sucesso: totalInseridos,
      amostra: notas.slice(0, 3),
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: err.message });
  }
}