import * as XLSX from 'xlsx';
import { getPool, sql } from '../src/lib/db.js';
import { TABELAS } from '../src/lib/tabelas.js';

import { requireSupabaseUser, sendAuthError } from '../src/lib/supabase-auth.js';
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
  if (!TABELAS.notas_fiscais) {
    return res.status(501).json({
      erro: 'Upload de sell-in ainda não migrado: falta definir a tabela de notas fiscais no SQL Server (veja src/lib/tabelas.js).',
    });
  }
  if (req.method !== 'POST') return res.status(405).end();
  try { await requireSupabaseUser(req); } catch (error) { return sendAuthError(res, error); }

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

    const pool = await getPool();

    // 1. Limpa registros anteriores deste fornecedor
    const delRequest = pool.request();
    delRequest.input('fornecedorId', sql.Int, fornecedorId);
    await delRequest.query(`DELETE FROM ${TABELAS.notas_fiscais} WHERE fornecedor_id = @fornecedorId`);

    // 2. Insere as notas (uma a uma, via parâmetros — evita SQL injection)
    let totalInseridos = 0;
    for (const n of notas) {
      const request = pool.request();
      request.input('fornecedorId', sql.Int, n.fornecedor_id);
      request.input('nfeId', sql.BigInt, n.nfe_id);
      request.input('numero', sql.NVarChar, n.numero);
      request.input('emissao', sql.DateTime2, n.emissao ? new Date(n.emissao) : null);
      request.input('cnpjEmitente', sql.NVarChar, n.cnpj_emitente);
      request.input('emitente', sql.NVarChar, n.emitente);
      request.input('valor', sql.Decimal(18, 2), n.valor);
      request.input('situacao', sql.NVarChar, n.situacao);
      request.input('compraId', sql.NVarChar, n.compra_id);
      request.input('naturezaOperacao', sql.NVarChar, n.natureza_operacao);

      await request.query(`
        INSERT INTO ${TABELAS.notas_fiscais}
          (fornecedor_id, nfe_id, numero, emissao, cnpj_emitente, emitente, valor, situacao, compra_id, natureza_operacao)
        VALUES
          (@fornecedorId, @nfeId, @numero, @emissao, @cnpjEmitente, @emitente, @valor, @situacao, @compraId, @naturezaOperacao)
      `);
      totalInseridos++;
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
