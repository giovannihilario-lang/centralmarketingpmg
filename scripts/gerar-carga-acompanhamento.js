import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sourceDir = path.resolve(process.argv[2] || path.join(projectRoot, 'fontes', 'acompanhamento'));
const jsonOutput = path.join(projectRoot, 'data', 'acompanhamento-carga-inicial.json');
const sqlOutput = path.join(projectRoot, 'sql', '07-CARGA-HISTORICA-ACOMPANHAMENTO.sql');
const sqlEditorOutputDir = path.join(projectRoot, 'sql', 'carga-acompanhamento-sql-editor');
const reportOutput = path.join(projectRoot, 'RELATORIO-CONSOLIDACAO-PLANILHAS.md');

const MONTHS = [
  ['JANEIRO', 'Janeiro'], ['FEVEREIRO', 'Fevereiro'], ['MARÇO', 'Março'],
  ['ABRIL', 'Abril'], ['MAIO', 'Maio'], ['JUNHO', 'Junho'],
  ['JULHO', 'Julho'], ['AGOSTO', 'Agosto'], ['SETEMBRO', 'Setembro'],
  ['OUTUBRO', 'Outubro'], ['NOVEMBRO', 'Novembro'], ['DEZEMBRO', 'Dezembro'],
];

const SOURCE_FILES = [
  ['Fornecedores 2024.xlsx', 'marketing', 2024],
  ['Fornecedores 2025.xlsx', 'marketing', 2025],
  ['Fornecedores 2026.xlsx', 'marketing', 2026],
  ['MKTG 2026.xlsx', 'marcos', 2026],
];

const SUPPLIER_ALIASES = new Map([
  ['LAWBWESTON', 'Lamb Weston'], ['LAMB WESTON', 'Lamb Weston'], ['QUATA', 'Quatá'],
  ['J MACEDO', 'J. Macêdo'], ['PQ ALIMENTOS', 'PQ Alimentos'], ['GL FOODS', 'GL Foods'],
  ['GT FOODS', 'GT Foods'], ['MISTER BEEF', 'Mister Beef'], ['BEM BRASIL', 'Bem Brasil'],
  ['GOMES DA COSTA', 'Gomes da Costa'], ['CLARA MILK', 'Clara Milk'],
  ['DAUPHINE FARM FRITES', 'Dauphine / Farm Frites'], ['AZEITE LISBOA', 'Azeite Lisboa'],
  ['ARCO BELLO', 'Arco Bello'], ['MONTE CASTELO', 'Monte Castelo'],
]);

const PLANNING_CATEGORY = {
  'PROMOCOES': 'campanha_incentivo',
  'CATALOGO FOLD': 'material',
  'PODCAST': 'midia',
  'FUNCIONARIO MES': 'equipe',
  'BOLETIM': 'midia',
  'FEIRAS EVENTOS': 'feira',
  'GOOGLE': 'midia',
  'EDM2': 'midia',
  'VIDEOS PMG': 'midia',
  'BRINDES': 'material',
  'GRAAC AACD': 'social',
  'IFB': 'parceria',
  'ABAD': 'parceria',
  'DIVERSOS': 'outro',
  'CONVENCAO': 'evento',
};

const currentDate = new Date('2026-08-19T12:00:00-03:00');
const items = [];
const reconciliation = [];
const sourceSummary = [];

function normalized(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function titleCase(value) {
  const lowerWords = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR').split(/\s+/).map((word, index) => {
    if (index && lowerWords.has(word)) return word;
    return word ? `${word[0].toLocaleUpperCase('pt-BR')}${word.slice(1)}` : '';
  }).join(' ');
}

function supplierName(value) {
  const key = normalized(value);
  if (!key) return '';
  if (SUPPLIER_ALIASES.has(key)) return SUPPLIER_ALIASES.get(key);
  return titleCase(String(value).replace(/\s*\/\s*/g, ' / '))
    .replace(/\bPmg\b/g, 'PMG').replace(/\bIfb\b/g, 'IFB').replace(/\bAbad\b/g, 'ABAD');
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? roundMoney(value) : 0;
  let raw = String(value ?? '').trim().replace(/R\$|\s/g, '');
  if (!raw || raw === '-') return 0;
  if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) raw = raw.replace(',', '.');
  const parsed = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
}

function isoDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthEnd(year, monthIndex) {
  return isoDate(year, monthIndex, new Date(year, monthIndex + 1, 0).getDate());
}

function fingerprint(...parts) {
  const value = parts.map(part => String(part ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean).join('|');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `pmg-${(hash >>> 0).toString(16)}-${value.slice(0, 160)}`;
}

function inferCategory(value) {
  const text = normalized(value);
  if (/PENDENT|FALTA|HAVER/.test(text)) return 'pendencia';
  if (/INCENTIVO|CAMPANHA|PROMOCAO/.test(text)) return 'campanha_incentivo';
  if (/FIPAN|FISPAL|ANUGA|FEIRA|EXPO/.test(text)) return 'feira';
  if (/CONVENCAO|EVENTO|30 ANOS|COPA|DIA DO MOTORISTA|TREINAMENTO/.test(text)) return 'evento';
  if (/PODCAST|MTRIX|MIDIA|VIDEO|GOOGLE|EDM|BOLETIM/.test(text)) return 'midia';
  if (/BRINDE|CATALOGO|FOLD|FOLDER|MATERIAL/.test(text)) return 'material';
  if (/BONIFIC/.test(text)) return 'bonificacao';
  if (/COTA|PLANO ANUAL/.test(text)) return 'cota_anual';
  if (/ACAO|TRADE|DEGUST/.test(text)) return 'acao_trade';
  return 'outro';
}

function inferMethod(value) {
  const text = normalized(value);
  const deposit = /DEPOSITO|DESPOSITO/.test(text);
  const discount = /DESCONTO|ABATIMENTO/.test(text);
  if (deposit && discount) return 'Depósito + abatimento em verba';
  if (deposit) return 'Depósito';
  if (discount) return 'Abatimento em verba';
  if (/PIX/.test(text)) return 'PIX';
  if (/BOLETO/.test(text)) return 'Boleto';
  if (/TRANSFER/.test(text)) return 'Transferência bancária';
  if (/BONIFIC/.test(text)) return 'Bonificação';
  if (/\d/.test(text)) return 'Nota fiscal / faturamento';
  return 'Não informado';
}

function rawTags(value) {
  const text = normalized(value);
  const checks = [
    ['cota', /COTA/], ['incentivo', /INCENTIVO|CAMPANHA|PROMOCAO/], ['podcast', /PODCAST/],
    ['convenção', /CONVENCAO/], ['feira', /FEIRA|FIPAN|FISPAL|ANUGA|EXPO/],
    ['evento', /EVENTO|30 ANOS|COPA|DIA DO MOTORISTA/], ['mtrix', /MTRIX/],
  ];
  return checks.filter(([, regex]) => regex.test(text)).map(([tag]) => tag);
}

function costCenterFromCampaign(value) {
  const text = normalized(value);
  if (/MTRIX|EMITRIX/.test(text)) return 'MTRIX / Emitrix';
  if (/INCENTIVO|CAMPANHA|PROMOCAO/.test(text)) return 'Campanha de incentivo';
  if (/PODCAST/.test(text)) return 'Podcast';
  if (/CONVENCAO/.test(text)) return 'Convenção';
  if (/COPA/.test(text)) return 'Copa';
  if (/30 ANOS/.test(text)) return 'Evento 30 anos';
  if (/FEIRA|FIPAN|FISPAL|ANUGA/.test(text)) return 'Feiras / eventos';
  if (/CATALOGO|FOLD|FOLDER/.test(text)) return 'Catálogo / material';
  if (/COTA/.test(text)) return 'Cota';
  return String(value || 'Outros').replace(/\s+/g, ' ').trim();
}

function specificCostValue(row) {
  // A regra oficial da planilha usa exclusivamente a coluna E (VALOR).
  // Células auxiliares mais à direita não são centros de custo e não entram na importação.
  const direct = parseMoney(row?.[4]);
  return { value: direct > 0 ? direct : 0, columnIndex: 4, legacy: false };
}

function addItem(registro, pagamentos = []) {
  const recordFingerprint = registro.fingerprint || fingerprint(
    registro.controle, registro.ano_referencia, registro.titulo, registro.fornecedor,
    registro.data_inicio, registro.origem_importacao, registro.linha_origem,
  );
  const normalizedRecord = {
    controle: 'marketing', ano_referencia: 2026, fornecedor: '', fornecedor_codigo: '',
    natureza: 'neutro', impacta_totais: true, categoria: 'outro', titulo: '', descricao: '',
    referencia: '', status: 'rascunho', prioridade: 'normal', data_inicio: '', data_fim: '',
    valor_acordado: 0, centro_custo: '', numero_documento: '', tags: [], observacoes: '',
    origem_importacao: '', linha_origem: null, dados_originais: {},
    ...registro, fingerprint: recordFingerprint,
  };
  const normalizedPayments = pagamentos.filter(Boolean).map((payment, index) => ({
    parcela: index + 1, descricao: `Movimento ${index + 1}`, valor_previsto: 0, valor_pago: 0,
    vencimento: '', pago_em: '', status: 'previsto', forma_pagamento: '', favorecido: '',
    numero_documento: '', observacoes: '', ...payment,
    fingerprint: payment.fingerprint || fingerprint(recordFingerprint, index + 1, payment.descricao, payment.vencimento),
  }));
  items.push({ registro: normalizedRecord, pagamentos: normalizedPayments });
  return normalizedRecord;
}

function validSupplierRow(row) {
  const category = normalized(row[0]);
  const supplier = normalized(row[1]);
  return supplier && supplier !== 'FORNECEDOR' && category !== 'TOTAL'
    && !MONTHS.some(([source]) => normalized(source) === category);
}

function extractNoteSupplier(note, knownSuppliers) {
  const normalizedNote = normalized(note);
  const matches = knownSuppliers.filter(name => normalizedNote.includes(normalized(name)));
  return matches.length === 1 ? matches[0] : '';
}

function loadWorkbook(fileName) {
  return XLSX.readFile(path.join(sourceDir, fileName), { cellFormula: true, cellDates: true, cellStyles: true, bookFiles: true });
}

function parseSupplierWorkbook(fileName, year) {
  const workbook = loadWorkbook(fileName);
  const monthTotals = [];
  const knownSuppliers = new Set();
  let sourceRows = 0;
  let importedRows = 0;
  let total = 0;

  workbook.SheetNames.forEach((sheetName, fallbackIndex) => {
    const monthIndex = Math.max(0, MONTHS.findIndex(([source]) => normalized(source) === normalized(sheetName)));
    const label = MONTHS[monthIndex]?.[1] || sheetName;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: false });
    const monthItems = [];
    let sourceTotal = 0;

    rows.slice(2).forEach((row, offset) => {
      const line = offset + 3;
      if (validSupplierRow(row)) {
        sourceRows += 1;
        const value = parseMoney(row[2]);
        if (value <= 0) return;
        const rawCategory = String(row[0] ?? '').trim() || 'COTA';
        const supplier = supplierName(row[1]);
        const document = String(row[3] ?? '').trim();
        const specific = specificCostValue(row);
        const highlightedValue = specific.value;
        const recordFingerprint = fingerprint('marketing', 'fornecedores', year, label, supplier, rawCategory);
        const extraDescription = highlightedValue > 0
          ? ` A fonte destaca ${formatBRL(highlightedValue)} para a ação específica indicada na coluna VALOR.` : '';
        knownSuppliers.add(supplier);
        sourceTotal += value;
        total += value;
        importedRows += 1;

        addItem({
          controle: 'marketing', ano_referencia: year, fornecedor: supplier, natureza: 'receita',
          impacta_totais: true, categoria: inferCategory(rawCategory),
          titulo: `${rawCategory.replace(/\s+/g, ' ').trim()} — ${supplier} — ${label} ${year}`,
          descricao: `Verba mensal de fornecedor registrada pelo Marketing.${extraDescription}`,
          referencia: rawCategory, status: 'concluido', prioridade: 'normal',
          data_inicio: isoDate(year, monthIndex, 1), data_fim: monthEnd(year, monthIndex),
          valor_acordado: value, numero_documento: document,
          tags: ['marketing', 'fornecedores', String(year), label.toLocaleLowerCase('pt-BR'), ...rawTags(rawCategory)],
          observacoes: highlightedValue > 0 ? `Valor específico destacado na planilha: ${formatBRL(highlightedValue)}.` : '',
          origem_importacao: fileName, linha_origem: line, fingerprint: recordFingerprint,
          dados_originais: {
            arquivo: fileName, aba: sheetName, linha: line, campanha: rawCategory,
            fornecedor_original: String(row[1] ?? '').trim(), verba: value, nf: document,
            valor_especifico: highlightedValue || null,
          },
        }, [{
          parcela: 1, descricao: `Competência ${label} ${year}`, valor_previsto: value, valor_pago: value,
          vencimento: monthEnd(year, monthIndex), pago_em: monthEnd(year, monthIndex), status: 'pago',
          forma_pagamento: inferMethod(document), favorecido: supplier, numero_documento: document,
          observacoes: 'A fonte informa apenas a competência mensal; a data exata do movimento não foi registrada.',
          fingerprint: fingerprint(recordFingerprint, 'competencia', year, monthIndex + 1),
        }]);
        if (highlightedValue > 0) {
          const center = costCenterFromCampaign(rawCategory);
          const outsideVerba = /MTRIX|EMITRIX/.test(normalized(rawCategory));
          const legacyOutsideColumn = specific.legacy;
          const detailFingerprint = fingerprint('marketing', 'centro-custo', year, label, supplier, rawCategory, center);
          addItem({
            controle: 'marketing', ano_referencia: year, fornecedor: supplier, natureza: 'despesa',
            impacta_totais: outsideVerba && !legacyOutsideColumn, categoria: inferCategory(rawCategory),
            titulo: `Centro de custo — ${center} — ${supplier} — ${label} ${year}`,
            descricao: outsideVerba ? 'Investimento MTRIX / Emitrix adicional, fora da VERBA recebida do fornecedor.' : 'Abertura do centro de custo já contida na VERBA recebida; não deve ser somada novamente à receita.',
            referencia: rawCategory, status: 'concluido', prioridade: 'normal',
            data_inicio: isoDate(year, monthIndex, 1), data_fim: monthEnd(year, monthIndex),
            valor_acordado: highlightedValue, centro_custo: center, numero_documento: document,
            tags: ['marketing', 'centro-custo', String(year), label.toLocaleLowerCase('pt-BR'), outsideVerba ? 'adicional-investimento' : 'dentro-verba', ...(legacyOutsideColumn ? ['legado-fora-coluna-valor'] : []), ...rawTags(rawCategory)],
            observacoes: legacyOutsideColumn ? `Valor legado encontrado na coluna ${XLSX.utils.encode_col(specific.columnIndex)}; preservado para auditoria e excluído dos KPIs automáticos.` : (outsideVerba ? 'MTRIX / Emitrix fica fora da VERBA e entra como investimento adicional.' : 'Valor já incluído na VERBA. O registro serve para de-para e centro de custo.'),
            origem_importacao: fileName, linha_origem: line, fingerprint: detailFingerprint,
            dados_originais: { arquivo:fileName, aba:sheetName, linha: line, campanha:rawCategory, fornecedor_original:String(row[1] ?? '').trim(), verba_recebida:value, valor_centro_custo:highlightedValue, incluido_na_verba:!outsideVerba, coluna_valor:XLSX.utils.encode_col(specific.columnIndex), legado_fora_coluna_valor:legacyOutsideColumn },
          }, [{
            parcela:1, descricao:`Centro de custo — ${label} ${year}`, valor_previsto:highlightedValue, valor_pago:highlightedValue,
            vencimento:monthEnd(year, monthIndex), pago_em:monthEnd(year, monthIndex), status:'pago', forma_pagamento:inferMethod(document),
            favorecido:supplier, numero_documento:document, observacoes:outsideVerba ? 'Investimento adicional fora da verba.' : 'Detalhamento já incluído na verba recebida.',
            fingerprint:fingerprint(detailFingerprint, 'centro-custo', year, monthIndex + 1),
          }]);
        }
        monthItems.push(value);
        return;
      }

      const firstCell = String(row[0] ?? '').trim();
      if (normalized(firstCell) === 'TOTAL') sourceTotal = parseMoney(row[2]);
    });

    const calculated = roundMoney(monthItems.reduce((sum, value) => sum + value, 0));
    monthTotals.push({ monthIndex, sheet: sheetName, sourceTotal: roundMoney(sourceTotal), calculated });

    rows.slice(2).forEach((row, offset) => {
      const noteCell = (row || []).find(value => /PENDENT|FALTA|AINDA NAO|FALTOU/i.test(normalized(value)));
      const note = String(noteCell ?? '').trim();
      if (!note) return;
      const line = offset + 3;
      const noteValue = parseMoney(note.match(/R\$\s*[\d.,]+/i)?.[0]);
      const supplier = extractNoteSupplier(note, [...knownSuppliers]);
      addItem({
        controle: 'marketing', ano_referencia: year, fornecedor: supplier, natureza: 'receita',
        impacta_totais: noteValue > 0, categoria: 'pendencia', titulo: `Pendência — ${label} ${year}`,
        descricao: note, referencia: 'Observação da planilha mensal', status: 'negociacao', prioridade: 'alta',
        data_inicio: monthEnd(year, monthIndex), valor_acordado: noteValue,
        tags: ['marketing', 'pendência', String(year), label.toLocaleLowerCase('pt-BR')], observacoes: note,
        origem_importacao: fileName, linha_origem: line,
        fingerprint: fingerprint('marketing', 'fornecedores', year, sheetName, line, note),
        dados_originais: { arquivo: fileName, aba: sheetName, linha: line, observacao: note },
      });
    });
  });

  monthTotals.forEach(entry => {
    reconciliation.push({
      type: 'total_fonte', source: fileName, period: entry.sheet,
      expected: entry.sourceTotal, found: entry.calculated, difference: roundMoney(entry.calculated - entry.sourceTotal),
    });
  });
  sourceSummary.push({ file: fileName, control: 'marketing', year, sourceRows, importedRows, total: roundMoney(total) });
  return { workbook, monthTotals };
}

function cellValue(sheet, address) {
  return sheet[address]?.v ?? null;
}


function workbookXmlText(workbook, filePath) {
  const content = workbook?.files?.[filePath]?.content;
  if (!content) return '';
  return Buffer.isBuffer(content) ? content.toString('utf8') : Buffer.from(content).toString('utf8');
}

function planningPaidMask(workbook) {
  const stylesXml = workbookXmlText(workbook, 'xl/styles.xml');
  const sheetMeta = workbook?.Workbook?.Sheets?.find(item => normalized(item?.name) === 'PLANEJAMENTO');
  const sheetXml = workbookXmlText(workbook, `xl/worksheets/sheet${sheetMeta?.sheetId || 1}.xml`);
  if (!stylesXml || !sheetXml) return null;
  const fontsBlock = stylesXml.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/i)?.[1] || '';
  const fonts = fontsBlock.match(/<font[\s\S]*?<\/font>/gi) || [];
  const redFontIds = new Set(fonts.map((font,index) => /<color[^>]*rgb=["'](?:FF)?FF0000["']/i.test(font) ? index : -1).filter(index => index >= 0));
  const xfsBlock = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/i)?.[1] || '';
  const xfs = xfsBlock.match(/<xf\b[^>]*\/?>/gi) || [];
  const redStyleIds = new Set(xfs.map((xf,index) => { const fontId = Number(xf.match(/fontId=["'](\d+)["']/i)?.[1] ?? -1); return redFontIds.has(fontId) ? index : -1; }).filter(index => index >= 0));
  const mask = Array.from({ length: 15 }, () => Array(12).fill(false));
  const cellRe = /<c\b[^>]*r=["']([B-P])(\d+)["'][^>]*s=["'](\d+)["'][^>]*>/gi;
  let match;
  while ((match = cellRe.exec(sheetXml))) {
    const columnIndex = match[1].charCodeAt(0) - 66;
    const monthIndex = Number(match[2]) - 3;
    const styleId = Number(match[3]);
    if (columnIndex >= 0 && columnIndex < 15 && monthIndex >= 0 && monthIndex < 12 && redStyleIds.has(styleId)) mask[columnIndex][monthIndex] = true;
  }
  return mask;
}

function parseMarcosWorkbook(fileName) {
  const workbook = loadWorkbook(fileName);
  let importedRows = 0;

  const receita = workbook.Sheets.RECEITA;
  const receitaRows = XLSX.utils.sheet_to_json(receita, { header: 1, defval: null, raw: true, blankrows: false });

  receitaRows.slice(2, 38).forEach((row, offset) => {
    const originalName = String(row[0] ?? '').trim();
    const value = parseMoney(row[1]);
    if (!originalName || normalized(originalName) === 'SOMA' || value <= 0) return;
    const isPodcast = normalized(originalName) === 'PODCAST';
    const supplier = isPodcast ? '' : supplierName(originalName);
    const recordFingerprint = fingerprint('marcos', 'fechado', 2025, originalName);
    addItem({
      controle: 'marcos', ano_referencia: 2025, fornecedor: supplier, natureza: 'receita',
      impacta_totais: true, categoria: isPodcast ? 'midia' : 'cota_anual',
      titulo: isPodcast ? 'Fechamento anual — Podcast 2025' : `Fechamento anual de verba 2025 — ${supplier}`,
      descricao: 'Valor anual indicado como FECHADO no controle da Presidência.',
      referencia: 'Previsão de Verbas 2025 — FECHADO', status: 'concluido',
      data_inicio: '2025-01-01', data_fim: '2025-12-31', valor_acordado: value,
      tags: ['marcos', 'fechado', '2025', isPodcast ? 'podcast' : 'fornecedor'],
      origem_importacao: fileName, linha_origem: offset + 3, fingerprint: recordFingerprint,
      dados_originais: { arquivo: fileName, aba: 'RECEITA', linha: offset + 3, fornecedor_original: originalName, fechado: value },
    }, [{
      parcela: 1, descricao: 'Fechamento anual 2025', valor_previsto: value, valor_pago: value,
      vencimento: '2025-12-31', pago_em: '2025-12-31', status: 'pago',
      forma_pagamento: 'Consolidado anual', favorecido: supplier,
      observacoes: 'Data contábil de encerramento usada porque a fonte contém apenas o valor anual fechado.',
      fingerprint: fingerprint(recordFingerprint, 'fechamento-2025'),
    }]);
    importedRows += 1;
  });

  const marcosMonthly = Array.from({ length: 12 }, () => 0);
  receitaRows.slice(2, 51).forEach((row, offset) => {
    const originalName = String(row[3] ?? '').trim();
    if (!originalName || /SOMA|PREVISAO|PREV\./.test(normalized(originalName))) return;
    const forecast = parseMoney(row[4]);
    const monthly = Array.from({ length: 12 }, (_, monthIndex) => parseMoney(row[5 + monthIndex]));
    const movements = monthly.map((value, monthIndex) => ({ value, monthIndex })).filter(({ value }) => value > 1.01);
    const paidTotal = roundMoney(movements.reduce((sum, item) => sum + item.value, 0));
    if (forecast <= 0 && paidTotal <= 0) return;
    const supplier = supplierName(originalName);
    const agreed = forecast;
    const recordFingerprint = fingerprint('marcos', 'previsao-verba', 2026, supplier);
    movements.forEach(({ value, monthIndex }) => { marcosMonthly[monthIndex] += value; });
    addItem({
      controle: 'marcos', ano_referencia: 2026, fornecedor: supplier, natureza: 'receita',
      impacta_totais: true, categoria: 'cota_anual', titulo: `Previsão anual de verba 2026 — ${supplier}`,
      descricao: 'Previsão anual acompanhada pela Presidência, com os movimentos mensais informados na planilha.',
      referencia: 'PAGAMENTOS FORNECEDORES 2026', status: paidTotal >= agreed && agreed > 0 ? 'concluido' : 'em_andamento',
      data_inicio: '2026-01-01', data_fim: '2026-12-31', valor_acordado: agreed,
      tags: ['marcos', 'previsão', 'fornecedor', '2026'],
      observacoes: forecast <= 0 && paidTotal > 0 ? `A previsão original estava zerada; o valor acompanhado foi ajustado ao realizado de ${formatBRL(paidTotal)}.` : '',
      origem_importacao: fileName, linha_origem: offset + 3, fingerprint: recordFingerprint,
      dados_originais: {
        arquivo: fileName, aba: 'RECEITA', linha: offset + 3, fornecedor_original: originalName,
        previsao: forecast, pagamentos_mensais: monthly, marcadores_um_real_ignorados: monthly.filter(value => value === 1).length,
      },
    }, movements.map(({ value, monthIndex }, index) => ({
      parcela: index + 1, descricao: `Recebimento — ${MONTHS[monthIndex][1]} 2026`,
      valor_previsto: value, valor_pago: value, vencimento: monthEnd(2026, monthIndex),
      pago_em: monthEnd(2026, monthIndex), status: 'pago', forma_pagamento: 'Não informado',
      favorecido: supplier,
      observacoes: 'A fonte informa apenas a competência mensal; valores iguais a R$ 1,00 usados como marcador foram ignorados.',
      fingerprint: fingerprint(recordFingerprint, 'recebimento', monthIndex + 1),
    })));
    importedRows += 1;
  });

  const somaMensalRow = receitaRows.find(row => normalized(row?.[3]) === 'SOMA MENSAL');
  if (somaMensalRow) {
    const monthlyTotals = Array.from({ length: 12 }, (_, monthIndex) => parseMoney(somaMensalRow[5 + monthIndex]));
    const exactTotal = parseMoney(somaMensalRow[17]) || roundMoney(monthlyTotals.reduce((sum, value) => sum + value, 0));
    monthlyTotals.forEach((value, monthIndex) => { marcosMonthly[monthIndex] = value; });
    addItem({
      controle: 'marcos', ano_referencia: 2026, natureza: 'indicador', impacta_totais: false,
      categoria: 'meta_financeira', titulo: 'Receita realizada 2026 — total oficial',
      descricao: 'Total realizado preservado exatamente da linha SOMA MENSAL da aba RECEITA do MKTG 2026.',
      referencia: 'SOMA MENSAL', status: 'concluido', data_inicio: '2026-01-01', data_fim: '2026-12-31',
      valor_acordado: exactTotal, tags: ['marcos', 'indicador', '2026', 'receita-realizada', 'soma-mensal'],
      origem_importacao: fileName, linha_origem: receitaRows.indexOf(somaMensalRow) + 1,
      fingerprint: fingerprint('marcos', 'indicador', 2026, 'receita-realizada'),
      dados_originais: { arquivo: fileName, aba: 'RECEITA', indicador: 'receita-realizada', pagamentos_mensais: monthlyTotals, total: exactTotal },
    });
    importedRows += 1;
  }

  const planning = workbook.Sheets.Planejamento;
  const planningRows = XLSX.utils.sheet_to_json(planning, { header: 1, defval: null, raw: true, blankrows: false });
  const planningHeaders = planningRows[1];
  const planningPaid = planningPaidMask(workbook);
  for (let columnIndex = 1; columnIndex <= 15; columnIndex += 1) {
    const originalHeader = String(planningHeaders[columnIndex] ?? '').trim();
    if (!originalHeader) continue;
    const monthly = Array.from({ length: 12 }, (_, monthIndex) => parseMoney(planningRows[2 + monthIndex]?.[columnIndex]));
    const total = roundMoney(monthly.reduce((sum, value) => sum + value, 0));
    if (total <= 0) continue;
    const category = PLANNING_CATEGORY[normalized(originalHeader)] || inferCategory(originalHeader);
    const recordFingerprint = fingerprint('marcos', 'planejamento', 2026, originalHeader);
    addItem({
      controle: 'marcos', ano_referencia: 2026, natureza: 'despesa', impacta_totais: true,
      categoria: category, titulo: `Planejamento 2026 — ${originalHeader}`,
      descricao: 'Planejamento anual de investimento do Marketing acompanhado pela Presidência.',
      referencia: originalHeader, status: 'em_andamento', data_inicio: '2026-01-01', data_fim: '2026-12-31',
      valor_acordado: total, centro_custo: 'Marketing', tags: ['marcos', 'planejamento', 'despesa', '2026', normalized(originalHeader).toLocaleLowerCase('pt-BR')],
      origem_importacao: fileName, linha_origem: 2, fingerprint: recordFingerprint,
      dados_originais: { arquivo: fileName, aba: 'Planejamento', coluna: XLSX.utils.encode_col(columnIndex), categoria_original: originalHeader, valores_mensais: monthly, pagos_mensais: Array.from({ length: 12 }, (_, monthIndex) => monthly[monthIndex] > 0 && Boolean(planningPaid?.[columnIndex - 1]?.[monthIndex])) },
    }, monthly.map((value, monthIndex) => ({ value, monthIndex })).filter(({ value }) => value > 0).map(({ value, monthIndex }, index) => ({
      parcela: index + 1, descricao: `${originalHeader} — ${MONTHS[monthIndex][1]} 2026`,
      valor_previsto: value, valor_pago: planningPaid?.[columnIndex - 1]?.[monthIndex] ? value : 0, vencimento: monthEnd(2026, monthIndex),
      pago_em: planningPaid?.[columnIndex - 1]?.[monthIndex] ? monthEnd(2026, monthIndex) : '', status: planningPaid?.[columnIndex - 1]?.[monthIndex] ? 'pago' : 'previsto',
      forma_pagamento: 'Não informado', observacoes: planningPaid?.[columnIndex - 1]?.[monthIndex] ? 'Marcado em vermelho na fonte oficial: tratado como já pago.' : 'Valor planejado ainda não marcado como pago na fonte oficial.',
      fingerprint: fingerprint(recordFingerprint, 'planejamento', monthIndex + 1),
    })));
    importedRows += 1;
  }

  addExecutiveIndicator(fileName, 'Previsão de receita 2026', parseMoney(cellValue(receita, 'E58')), 'receita');
  addExecutiveIndicator(fileName, 'Previsão de investimento 2026', parseMoney(cellValue(receita, 'E56')), 'investimento');
  addExecutiveIndicator(fileName, 'Previsão de saldo 2026', parseMoney(cellValue(receita, 'E60')), 'saldo');

  parseDetailSheets(workbook, fileName);

  sourceSummary.push({
    file: fileName, control: 'marcos', year: 2026, sourceRows: receitaRows.length,
    importedRows, total: roundMoney(parseMoney(cellValue(receita, 'E58'))),
  });
  return { workbook, marcosMonthly: marcosMonthly.map(roundMoney) };
}

function addExecutiveIndicator(fileName, title, value, key) {
  if (value <= 0) return;
  addItem({
    controle: 'marcos', ano_referencia: 2026, natureza: 'indicador', impacta_totais: false,
    categoria: 'meta_financeira', titulo: title, descricao: 'Indicador executivo preservado exatamente como informado no controle MKTG 2026.',
    referencia: 'PREVISÃO ORÇAMENTÁRIA', status: 'aprovado', data_inicio: '2026-01-01', data_fim: '2026-12-31',
    valor_acordado: value, tags: ['marcos', 'indicador', '2026', key],
    origem_importacao: fileName, fingerprint: fingerprint('marcos', 'indicador', 2026, key),
    dados_originais: { arquivo: fileName, aba: 'RECEITA', indicador: key, valor: value },
  });
}

function detailRecord({ fileName, sheetName, title, nature, category, value, lines, status = 'em_andamento', reference = '', startDate = '', observations = '' }) {
  if ((!Array.isArray(lines) || !lines.length) && !(Number(value) > 0)) return;
  const recordFingerprint = fingerprint('marcos', 'detalhamento', 2026, sheetName, title);
  addItem({
    controle: 'marcos', ano_referencia: 2026, natureza: nature, impacta_totais: false,
    categoria: category, titulo: title, descricao: 'Detalhamento operacional preservado da aba específica do controle MKTG 2026.',
    referencia: reference || sheetName, status, data_inicio: startDate, valor_acordado: value,
    centro_custo: 'Marketing', tags: ['marcos', 'detalhamento', '2026', normalized(sheetName).toLocaleLowerCase('pt-BR')],
    observacoes: observations, origem_importacao: fileName, fingerprint: recordFingerprint,
    dados_originais: { arquivo: fileName, aba: sheetName, linhas: lines },
  }, lines.filter(line => line.value > 0).map((line, index) => ({
    parcela: index + 1, descricao: line.description || `Item ${index + 1}`, valor_previsto: line.value,
    valor_pago: line.status === 'pago' ? line.value : 0, vencimento: line.due || '', pago_em: line.status === 'pago' ? (line.paidAt || line.due || '') : '',
    status: line.status || 'previsto', forma_pagamento: line.method || 'Não informado', favorecido: line.favored || '',
    observacoes: line.observations || '', fingerprint: fingerprint(recordFingerprint, index + 1, line.description),
  })));
}

function rowsFromSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, blankrows: false }) : [];
}

function parseDetailSheets(workbook, fileName) {
  const podcast = rowsFromSheet(workbook, 'PODCAST');
  const sponsors = podcast.slice(0, 9).map(row => ({
    description: supplierName(row[0]), value: parseMoney(row[1]), status: normalized(row[2]) === 'PAGO' ? 'pago' : 'previsto',
    favored: supplierName(row[0]), method: 'Patrocínio',
  })).filter(line => line.description && line.value > 0);
  detailRecord({ fileName, sheetName: 'PODCAST', title: 'Patrocínios — Podcast 2026', nature: 'receita', category: 'midia',
    value: roundMoney(sponsors.reduce((sum, line) => sum + line.value, 0)), lines: sponsors, status: 'concluido', reference: 'Patrocínios do Podcast' });
  const podcastCosts = podcast.slice(17, 27).map(row => ({ description: String(row[0] ?? '').trim(), value: parseMoney(row[1]), status: 'previsto' })).filter(line => line.description && line.value > 0);
  detailRecord({ fileName, sheetName: 'PODCAST', title: 'Investimento — Podcast 2026', nature: 'despesa', category: 'midia',
    value: parseMoney(podcast[15]?.[1]) || roundMoney(podcastCosts.reduce((sum, line) => sum + line.value, 0)), lines: podcastCosts,
    reference: 'Estrutura e equipamentos do Podcast', observations: `Itens detalhados: ${formatBRL(podcastCosts.reduce((sum, line) => sum + line.value, 0))}.` });

  const copa = rowsFromSheet(workbook, 'COPA');
  const copaSponsors = copa.slice(0, 9).map(row => ({ description: supplierName(row[0]), value: parseMoney(row[1]), favored: supplierName(row[0]), status: 'previsto', method: 'Patrocínio' })).filter(line => line.description && line.value > 0);
  detailRecord({ fileName, sheetName: 'COPA', title: 'Apoios de fornecedores — Copa 2026', nature: 'receita', category: 'evento',
    value: roundMoney(copaSponsors.reduce((sum, line) => sum + line.value, 0)), lines: copaSponsors, reference: 'Apoios para a Copa' });
  const copaCosts = copa.slice(13, 19).map(row => ({
    description: String(row[0] ?? '').trim(), value: parseMoney(row[3]) || roundMoney(parseMoney(row[1]) * parseMoney(row[2])), status: 'previsto',
  })).filter(line => line.description && line.value > 0);
  detailRecord({ fileName, sheetName: 'COPA', title: 'Materiais promocionais — Copa 2026', nature: 'despesa', category: 'evento',
    value: roundMoney(copaCosts.reduce((sum, line) => sum + line.value, 0)), lines: copaCosts, reference: 'Materiais e estrutura para a Copa' });

  const convention = rowsFromSheet(workbook, 'CONV FORNEC');
  const conventionLines = convention.map(row => ({
    description: String(row[0] ?? '').trim() || 'Saldo a pagar', value: parseMoney(row[1]),
    status: normalized(row[2]).includes('PAGO') && !normalized(row[2]).includes('FALTA') ? 'pago' : 'previsto',
    observations: String(row[2] ?? '').trim(),
  })).filter(line => line.value > 0);
  detailRecord({ fileName, sheetName: 'CONV FORNEC', title: 'Convenção de Fornecedores 2026', nature: 'despesa', category: 'evento',
    value: roundMoney(conventionLines.reduce((sum, line) => sum + line.value, 0)), lines: conventionLines,
    reference: 'Locação, espaço e buffet da Convenção de Fornecedores' });

  const pending = rowsFromSheet(workbook, 'PENDÊNCIAS');
  const pendingValue = parseMoney(pending[1]?.[2]);
  if (pendingValue > 0) addItem({
    controle: 'marcos', ano_referencia: 2026, natureza: 'receita', impacta_totais: true,
    categoria: 'pendencia', titulo: 'Pendência — haver Edilson', descricao: 'Valor registrado como HAVER na aba de pendências.',
    referencia: 'PENDÊNCIAS', status: 'negociacao', prioridade: 'alta', valor_acordado: pendingValue,
    tags: ['marcos', 'pendência', 'haver', '2026'], origem_importacao: fileName, linha_origem: 2,
    fingerprint: fingerprint('marcos', 'pendencia', 'edilson'),
    dados_originais: { arquivo: fileName, aba: 'PENDÊNCIAS', responsavel: 'EDILSON', tipo: 'HAVER', valor: pendingValue },
  });

  const detailDefinitions = [
    ['ANUGA', 'ANUGA 2026', 'feira', '2026-04-01'],
    ['FISPAL', 'FISPAL 2026', 'feira', '2026-06-01'],
    ['FIPAN', 'FIPAN 2026', 'feira', '2026-07-01'],
    ['CONV VENDAS', 'Convenção de Vendas 2026', 'evento', '2026-03-01'],
  ];
  detailDefinitions.forEach(([sheetName, title, category, startDate]) => {
    const rows = rowsFromSheet(workbook, sheetName);
    let lastDescription = '';
    const occurrence = new Map();
    const lines = rows.map(row => {
      const rawDescription = String(row[0] ?? '').trim();
      if (rawDescription) lastDescription = rawDescription;
      if (!lastDescription) return null;
      const value = parseMoney(row[1]);
      if (value <= 0) return null;
      const key = normalized(lastDescription);
      occurrence.set(key, (occurrence.get(key) || 0) + 1);
      const suffix = occurrence.get(key) > 1 ? ` — parcela ${occurrence.get(key)}` : '';
      return { description: `${lastDescription}${suffix}`, value, status: 'previsto' };
    }).filter(Boolean);
    const total = roundMoney(lines.reduce((sum, line) => sum + line.value, 0));
    detailRecord({ fileName, sheetName, title, nature: 'despesa', category, value: total, lines, startDate, reference: `${sheetName} — detalhamento de custos` });
  });

  const card = rowsFromSheet(workbook, 'CARTÃO');
  let cardDate = '';
  const cardLines = [];
  card.forEach(row => {
    if (typeof row[0] === 'number' && row[0] > 20000) {
      const parsed = XLSX.SSF.parse_date_code(row[0]);
      if (parsed) cardDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const label = String(row[1] ?? '').trim() || 'Lançamento sem descrição';
    [row[2], row[3]].forEach((cell, columnOffset) => {
      const value = parseMoney(cell);
      if (value > 0) cardLines.push({ description: `${label} — coluna ${columnOffset ? 'D' : 'C'}`, value, status: 'previsto', due: cardDate });
    });
  });
  detailRecord({ fileName, sheetName: 'CARTÃO', title: 'Lançamentos de cartão — Julho 2026', nature: 'despesa', category: 'outro',
    value: roundMoney(cardLines.reduce((sum, line) => sum + line.value, 0)), lines: cardLines, startDate: cardDate,
    reference: 'Cartão', observations: 'A fonte não identifica todos os lançamentos; as colunas originais foram preservadas.' });
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function buildSql(payload) {
  const seedJson = JSON.stringify(payload.items);
  return `-- ============================================================
-- PMG CONNECT — CARGA HISTÓRICA DA CENTRAL DE ACOMPANHAMENTO
-- Fontes: Fornecedores 2024/2025/2026 + MKTG 2026
-- Gerado automaticamente. Execute depois do script 06.
-- A carga é idempotente: reexecutar atualiza os mesmos fingerprints.
-- ============================================================

drop table if exists pg_temp.tmp_acompanhamento_seed;
create temporary table tmp_acompanhamento_seed (item jsonb not null);

insert into tmp_acompanhamento_seed(item)
select value from jsonb_array_elements($pmg_seed$${seedJson}$pmg_seed$::jsonb);

insert into public.acompanhamento_registros (
  controle, ano_referencia, fornecedor, fornecedor_codigo, natureza, impacta_totais,
  categoria, titulo, descricao, referencia, status, prioridade, data_inicio, data_fim,
  valor_acordado, centro_custo, numero_documento, tags, observacoes,
  origem_importacao, linha_origem, fingerprint, dados_originais
)
select
  item -> 'registro' ->> 'controle',
  (item -> 'registro' ->> 'ano_referencia')::integer,
  nullif(item -> 'registro' ->> 'fornecedor', ''),
  nullif(item -> 'registro' ->> 'fornecedor_codigo', ''),
  coalesce(nullif(item -> 'registro' ->> 'natureza', ''), 'neutro'),
  coalesce((item -> 'registro' ->> 'impacta_totais')::boolean, true),
  coalesce(nullif(item -> 'registro' ->> 'categoria', ''), 'outro'),
  item -> 'registro' ->> 'titulo',
  nullif(item -> 'registro' ->> 'descricao', ''),
  nullif(item -> 'registro' ->> 'referencia', ''),
  coalesce(nullif(item -> 'registro' ->> 'status', ''), 'rascunho'),
  coalesce(nullif(item -> 'registro' ->> 'prioridade', ''), 'normal'),
  nullif(item -> 'registro' ->> 'data_inicio', '')::date,
  nullif(item -> 'registro' ->> 'data_fim', '')::date,
  greatest(coalesce((item -> 'registro' ->> 'valor_acordado')::numeric, 0), 0),
  nullif(item -> 'registro' ->> 'centro_custo', ''),
  nullif(item -> 'registro' ->> 'numero_documento', ''),
  coalesce(array(select jsonb_array_elements_text(item -> 'registro' -> 'tags')), '{}'::text[]),
  nullif(item -> 'registro' ->> 'observacoes', ''),
  nullif(item -> 'registro' ->> 'origem_importacao', ''),
  nullif(item -> 'registro' ->> 'linha_origem', '')::integer,
  item -> 'registro' ->> 'fingerprint',
  coalesce(item -> 'registro' -> 'dados_originais', '{}'::jsonb)
from tmp_acompanhamento_seed
on conflict (fingerprint) where fingerprint is not null and arquivado_em is null
do update set
  controle = excluded.controle,
  ano_referencia = excluded.ano_referencia,
  fornecedor = excluded.fornecedor,
  fornecedor_codigo = excluded.fornecedor_codigo,
  natureza = excluded.natureza,
  impacta_totais = excluded.impacta_totais,
  categoria = excluded.categoria,
  titulo = excluded.titulo,
  descricao = excluded.descricao,
  referencia = excluded.referencia,
  status = excluded.status,
  prioridade = excluded.prioridade,
  data_inicio = excluded.data_inicio,
  data_fim = excluded.data_fim,
  valor_acordado = excluded.valor_acordado,
  centro_custo = excluded.centro_custo,
  numero_documento = excluded.numero_documento,
  tags = excluded.tags,
  observacoes = excluded.observacoes,
  origem_importacao = excluded.origem_importacao,
  linha_origem = excluded.linha_origem,
  dados_originais = excluded.dados_originais,
  atualizado_em = now();

insert into public.acompanhamento_pagamentos (
  registro_id, parcela, descricao, valor_previsto, valor_pago, vencimento, pago_em,
  status, forma_pagamento, favorecido, numero_documento, observacoes, fingerprint
)
select
  registro.id,
  greatest(coalesce((pagamento ->> 'parcela')::integer, 1), 1),
  nullif(pagamento ->> 'descricao', ''),
  greatest(coalesce((pagamento ->> 'valor_previsto')::numeric, 0), 0),
  greatest(coalesce((pagamento ->> 'valor_pago')::numeric, 0), 0),
  nullif(pagamento ->> 'vencimento', '')::date,
  nullif(pagamento ->> 'pago_em', '')::date,
  coalesce(nullif(pagamento ->> 'status', ''), 'previsto'),
  nullif(pagamento ->> 'forma_pagamento', ''),
  nullif(pagamento ->> 'favorecido', ''),
  nullif(pagamento ->> 'numero_documento', ''),
  nullif(pagamento ->> 'observacoes', ''),
  pagamento ->> 'fingerprint'
from tmp_acompanhamento_seed seed
join public.acompanhamento_registros registro
  on registro.fingerprint = seed.item -> 'registro' ->> 'fingerprint'
  and registro.arquivado_em is null
cross join lateral jsonb_array_elements(coalesce(seed.item -> 'pagamentos', '[]'::jsonb)) pagamento
on conflict (registro_id, fingerprint) where fingerprint is not null
do update set
  parcela = excluded.parcela,
  descricao = excluded.descricao,
  valor_previsto = excluded.valor_previsto,
  valor_pago = excluded.valor_pago,
  vencimento = excluded.vencimento,
  pago_em = excluded.pago_em,
  status = excluded.status,
  forma_pagamento = excluded.forma_pagamento,
  favorecido = excluded.favorecido,
  numero_documento = excluded.numero_documento,
  observacoes = excluded.observacoes,
  atualizado_em = now();

-- Concilia movimentos de versoes anteriores da carga. Lancamentos manuais,
-- que nao possuem fingerprint gerado, permanecem preservados.
delete from public.acompanhamento_pagamentos pagamento_antigo
using public.acompanhamento_registros registro
where pagamento_antigo.registro_id = registro.id
  and registro.dados_originais ->> 'arquivo' in ('Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx')
  and pagamento_antigo.fingerprint like 'pmg-%'
  and not exists (
    select 1
    from tmp_acompanhamento_seed seed
    cross join lateral jsonb_array_elements(coalesce(seed.item -> 'pagamentos', '[]'::jsonb)) pagamento_atual
    where seed.item -> 'registro' ->> 'fingerprint' = registro.fingerprint
      and pagamento_atual ->> 'fingerprint' = pagamento_antigo.fingerprint
  );

with registros_arquivados as (
  update public.acompanhamento_registros registro
  set arquivado_em = now(), atualizado_em = now()
  where registro.arquivado_em is null
    and registro.dados_originais ->> 'arquivo' in ('Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx')
    and registro.fingerprint is not null
    and not exists (
      select 1 from tmp_acompanhamento_seed seed
      where seed.item -> 'registro' ->> 'fingerprint' = registro.fingerprint
    )
  returning registro.id, registro.dados_originais ->> 'arquivo' as arquivo
)
insert into public.acompanhamento_atividades(registro_id, tipo, resumo, detalhes)
select id, 'arquivado', 'arquivado por conciliacao da carga historica', jsonb_build_object('arquivo', arquivo)
from registros_arquivados;

insert into public.acompanhamento_atividades(registro_id, tipo, resumo, detalhes)
select registro.id, 'importado', 'importado da carga histórica oficial',
  jsonb_build_object('arquivo', registro.origem_importacao, 'linha', registro.linha_origem)
from public.acompanhamento_registros registro
where registro.origem_importacao in ('Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx')
  and registro.arquivado_em is null
  and not exists (
    select 1 from public.acompanhamento_atividades atividade
    where atividade.registro_id = registro.id and atividade.tipo = 'importado'
  );

drop table tmp_acompanhamento_seed;

-- Conferência rápida após a carga:
select controle, ano_referencia, natureza, count(*) as registros,
       sum(valor_acordado) filter (where impacta_totais) as valor_consolidado
from public.acompanhamento_registros
where origem_importacao in ('Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx')
  and arquivado_em is null
group by controle, ano_referencia, natureza
order by ano_referencia, controle, natureza;
`;
}

function buildSqlEditorBatch(batchItems, batchNumber, totalBatches) {
  const label = String(batchNumber).padStart(2, '0');
  let sql = buildSql({ items: batchItems });

  sql = sql.replace(
    '-- PMG CONNECT — CARGA HISTÓRICA DA CENTRAL DE ACOMPANHAMENTO',
    `-- PMG CONNECT — CARGA HISTÓRICA — LOTE ${label}/${String(totalBatches).padStart(2, '0')}`,
  );

  // Um lote só pode reconciliar movimentos dos registros contidos nele.
  // Assim, executar arquivos separados nunca afeta os lotes anteriores.
  sql = sql.replace(
    "  and pagamento_antigo.fingerprint like 'pmg-%'",
    `  and exists (
    select 1 from tmp_acompanhamento_seed registro_do_lote
    where registro_do_lote.item -> 'registro' ->> 'fingerprint' = registro.fingerprint
  )
  and pagamento_antigo.fingerprint like 'pmg-%'`,
  );

  // O arquivamento global exige a carga completa na mesma sessão e, portanto,
  // permanece apenas no arquivo integral/CLI. Os lotes continuam idempotentes.
  sql = sql.replace(/\nwith registros_arquivados as \([\s\S]*?\nfrom registros_arquivados;\n/, '\n');

  return `-- Arquivo otimizado para o limite do SQL Editor do Supabase.
-- Execute depois do SQL 06 e respeite a ordem numérica dos lotes.
-- Este lote contém ${batchItems.length} acompanhamentos.

begin;
${sql}
commit;
`;
}

function buildSqlEditorReadme(totalBatches, maxBytes) {
  const files = Array.from({ length:totalBatches }, (_, index) =>
    `- \`07-${String(index + 1).padStart(2, '0')}-CARGA.sql\``).join('\n');
  return `# Carga da Central pelo SQL Editor do Supabase

O arquivo integral ultrapassa o limite de tamanho do editor. Use estes lotes menores.

## Ordem

1. Execute primeiro \`sql/06-CENTRAL-ACOMPANHAMENTO.sql\`.
2. Execute os arquivos abaixo, um de cada vez, na ordem:

${files}

3. Execute \`07-99-CONFERENCIA-FINAL.sql\`.

Todos os lotes são idempotentes: se um deles falhar por conexão, ele pode ser executado novamente. O maior lote possui ${(maxBytes / 1024).toFixed(1)} KB.
`;
}

function buildFinalCheck() {
  return `-- PMG CONNECT — CONFERENCIA FINAL DA CARGA HISTORICA
select
  count(*) as acompanhamentos_carregados,
  case when count(*) = 1182 then 'OK' else 'CONFERIR: esperado 1182' end as resultado
from public.acompanhamento_registros
where arquivado_em is null
  and dados_originais ->> 'arquivo' in ('Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx');

select
  count(*) as movimentos_carregados,
  case when count(*) = 1554 then 'OK' else 'CONFERIR: esperado 1554' end as resultado
from public.acompanhamento_pagamentos pagamento
join public.acompanhamento_registros registro on registro.id = pagamento.registro_id
where registro.arquivado_em is null
  and registro.dados_originais ->> 'arquivo' in ('Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx');
`;
}

function buildReport(payload, marketingMonthly2026, marcosMonthly2026) {
  const byControlYearNature = new Map();
  payload.items.forEach(({ registro }) => {
    const key = `${registro.controle}|${registro.ano_referencia}|${registro.natureza}`;
    const current = byControlYearNature.get(key) || { count: 0, value: 0 };
    current.count += 1;
    if (registro.impacta_totais) current.value += registro.valor_acordado;
    byControlYearNature.set(key, current);
  });
  const summaryRows = [...byControlYearNature].sort().map(([key, value]) => {
    const [control, year, nature] = key.split('|');
    return `| ${control === 'marcos' ? 'Marcos' : 'Marketing'} | ${year} | ${nature} | ${value.count} | ${formatBRL(value.value)} |`;
  }).join('\n');
  const monthRows = MONTHS.map(([, label], index) => {
    const marketing = roundMoney(marketingMonthly2026[index]?.calculated || 0);
    const marcos = roundMoney(marcosMonthly2026[index] || 0);
    return `| ${label} | ${formatBRL(marketing)} | ${formatBRL(marcos)} | ${formatBRL(marcos - marketing)} |`;
  }).join('\n');
  const discrepancyRows = reconciliation.filter(item => Math.abs(item.difference) >= 0.01)
    .map(item => `| ${item.source} | ${item.period} | ${formatBRL(item.expected)} | ${formatBRL(item.found)} | ${formatBRL(item.difference)} |`).join('\n') || '| — | — | — | — | Nenhuma |';
  return `# Relatório de consolidação das planilhas

Gerado em 19/08/2026 para a Central de Acompanhamento do PMG Connect.

## Fontes processadas

${sourceSummary.map(source => `- **${source.file}**: ${source.importedRows} linhas úteis importadas para o Controle ${source.control === 'marcos' ? 'Marcos' : 'Marketing'}.`).join('\n')}

## Carga consolidada

| Controle | Ano | Natureza | Registros | Valor que impacta indicadores |
|---|---:|---|---:|---:|
${summaryRows}

Os registros marcados como detalhamento preservam linhas de eventos, cartões e patrocínios, mas não duplicam os totais do planejamento.

## Conciliação de recebimentos de fornecedores — 2026

| Competência | Controle Marketing | Controle Marcos | Diferença Marcos − Marketing |
|---|---:|---:|---:|
${monthRows}

A linha **SOMA MENSAL** do MKTG 2026 é preservada como fonte oficial do realizado, inclusive os valores de R$ 1,00 presentes na própria planilha. Assim, Dashboard e Receita Anual reproduzem exatamente o total exibido no arquivo.

## Conferência dos totais mensais das planilhas Fornecedores

| Arquivo | Aba | Total informado | Soma das linhas importadas | Diferença |
|---|---|---:|---:|---:|
${discrepancyRows}

As abas com total sem divergência também foram validadas, mas foram omitidas desta tabela para manter o relatório objetivo.

## Regras aplicadas

- Linhas vazias, cabeçalhos, rodapés e totais não viraram lançamentos.
- Valores zerados não viraram receita ou pagamento.
- Observações de pendência foram preservadas como acompanhamentos de prioridade alta.
- A coluna **VALOR** das planilhas de 2025 e 2026 foi preservada em “dados originais” como detalhamento da verba total.
- Competências mensais sem data exata usam o último dia do mês apenas como referência contábil, com observação explícita no lançamento.
- Previsões, receitas, despesas e indicadores executivos permanecem separados.
- Abas de eventos e projetos foram preservadas como detalhamento sem duplicar o planejamento anual nos indicadores.
`;
}

async function main() {
  for (const [fileName] of SOURCE_FILES) await fs.access(path.join(sourceDir, fileName));
  const supplierResults = [
    parseSupplierWorkbook('Fornecedores 2024.xlsx', 2024),
    parseSupplierWorkbook('Fornecedores 2025.xlsx', 2025),
    parseSupplierWorkbook('Fornecedores 2026.xlsx', 2026),
  ];
  const marcos = parseMarcosWorkbook('MKTG 2026.xlsx');
  const payload = {
    version: '3.8.0', generated_at: '2026-08-19T12:00:00-03:00',
    source_files: SOURCE_FILES.map(([file, control, year]) => ({ file, control, year })),
    summary: sourceSummary, reconciliation, items,
  };
  await fs.mkdir(path.dirname(jsonOutput), { recursive: true });
  await fs.writeFile(jsonOutput, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(sqlOutput, buildSql(payload), 'utf8');
  const batchSize = 75;
  const batches = Array.from({ length:Math.ceil(items.length / batchSize) }, (_, index) => items.slice(index * batchSize, (index + 1) * batchSize));
  await fs.rm(sqlEditorOutputDir, { recursive:true, force:true });
  await fs.mkdir(sqlEditorOutputDir, { recursive:true });
  const batchContents = batches.map((batch, index) => buildSqlEditorBatch(batch, index + 1, batches.length));
  await Promise.all(batchContents.map((content, index) => fs.writeFile(
    path.join(sqlEditorOutputDir, `07-${String(index + 1).padStart(2, '0')}-CARGA.sql`), content, 'utf8',
  )));
  await fs.writeFile(path.join(sqlEditorOutputDir, '07-99-CONFERENCIA-FINAL.sql'), buildFinalCheck(), 'utf8');
  const maxBatchBytes = Math.max(...batchContents.map(content => Buffer.byteLength(content, 'utf8')));
  await fs.writeFile(path.join(sqlEditorOutputDir, '00-LEIA-ME.md'), buildSqlEditorReadme(batches.length, maxBatchBytes), 'utf8');
  await fs.writeFile(reportOutput, buildReport(payload, supplierResults[2].monthTotals, marcos.marcosMonthly), 'utf8');
  console.log(JSON.stringify({
    records: items.length,
    payments: items.reduce((sum, item) => sum + item.pagamentos.length, 0),
    jsonOutput, sqlOutput, sqlEditorOutputDir, sqlEditorBatches:batches.length, maxBatchBytes, reportOutput,
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
