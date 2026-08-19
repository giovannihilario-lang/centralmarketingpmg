/* PMG Connect - OCR local de documentos V1.2.2 */
(() => {
  'use strict';

  const scope = typeof window !== 'undefined' ? window : globalThis;
  const PDF_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  const MAX_OCR_PAGES = 30;
  const TYPE_LABELS = {
    cadastro_pagamento:'Cadastro de pagamento',
    pedido_compra:'Pedido de compra',
    danfe:'Nota fiscal / DANFE',
    extrato_bancario:'Extrato bancário',
    nao_identificado:'Documento não identificado',
  };

  const fold = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9$.,:/º°%+\-\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const textLines = value => String(value || '').split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);

  function parseBrazilianMoney(value) {
    let raw = String(value || '').replace(/R\$|\s/g, '').replace(/[^0-9,.-]/g, '');
    if (!raw) return null;
    if (raw.includes(',') && raw.includes('.')) {
      raw = raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '');
    }
    else if (raw.includes(',')) raw = raw.replace(',', '.');
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
  }

  function moneyValues(value) {
    const prepared = String(value || '').replace(/(\d)[.]\s+(\d{3}[,.]\d{2})/g, '$1.$2');
    const matches = prepared.match(/(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+,\d{2}|\d+\.\d{2})/gi) || [];
    return matches.map(parseBrazilianMoney).filter(amount => amount !== null);
  }

  function dateToIso(value) {
    const match = String(value || '').match(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
    if (!match) return null;
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const month = Number(match[2]);
    const day = Number(match[1]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function lineWith(lines, keywords) {
    return lines.find(line => keywords.some(keyword => fold(line).includes(keyword))) || '';
  }

  function evidenceLines(lines) {
    const keywords = ['marketing', 'mkt', 'acordo', 'sobra', 'valor total', 'valor liquido', 'pedido', 'danfe', 'nota fiscal', 'bonif', 'ted', 'pix', 'transfer', 'pagamento'];
    return lines.filter(line => keywords.some(keyword => fold(line).includes(keyword))).slice(0, 6);
  }

  function amountNear(lines, keywords, preferFirst = false) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!keywords.some(keyword => fold(lines[index]).includes(keyword))) continue;
      const sameLine = moneyValues(lines[index]);
      if (sameLine.length) return preferFirst ? sameLine[0] : sameLine[sameLine.length - 1];
      for (const neighbor of [lines[index + 1], lines[index + 2], lines[index - 1], lines[index - 2]]) {
        const values = moneyValues(neighbor);
        if (values.length) return preferFirst ? values[0] : values[values.length - 1];
      }
    }
    return null;
  }

  function largestAmountNear(lines, keywords) {
    const values = [];
    for (let index = 0; index < lines.length; index += 1) {
      if (!keywords.some(keyword => fold(lines[index]).includes(keyword))) continue;
      for (const candidate of [lines[index], lines[index + 1], lines[index + 2], lines[index - 1]]) values.push(...moneyValues(candidate));
    }
    return values.length ? Math.max(...values) : null;
  }

  function dateNear(lines, keywords) {
    for (let index = 0; index < lines.length; index += 1) {
      if (!keywords.some(keyword => fold(lines[index]).includes(keyword))) continue;
      for (const candidate of [lines[index], lines[index + 1], lines[index - 1]]) {
        const parsed = dateToIso(candidate);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  function extractAfterLabel(lines, labels) {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const normalized = fold(line);
      const label = labels.find(item => normalized.includes(item));
      if (!label) continue;
      const parts = line.split(/[:\-]/).map(part => part.trim()).filter(Boolean);
      let candidate = parts.length > 1 ? parts.slice(1).join(' - ') : line.replace(new RegExp(label, 'i'), '').trim();
      if (!candidate || /^(e conta|conta|destinatario|remetente|destinatarioremetente)$/i.test(fold(candidate).replace(/\//g, ''))) candidate = lines[index + 1] || '';
      candidate = candidate
        .replace(/(?:R\$\s*)?[+\-]?\d{1,3}(?:[.\s]\d{3})*[,.]\d{2}.*$/i, '')
        .replace(/^\s*\d+\s*[,;\-]\s*/, '').replace(/[|\\]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (candidate && /[a-zá-ú]/i.test(candidate) && candidate.length > 3 && candidate.length < 180) return candidate;
    }
    return null;
  }

  function extractCnpj(text) {
    return String(text || '').match(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[\s/]?\d{4}[\s-]?\d{2}\b/)?.[0]?.replace(/\s/g, '') || null;
  }

  function identifierNear(lines, patterns) {
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1] && /\d/.test(match[1])) return match[1].replace(/\s+/g, '').replace(/[,:;\-]+$/, '').slice(0, 120);
      }
    }
    return null;
  }

  function classify(text) {
    const normalized = fold(text);
    const scores = {
      cadastro_pagamento:0,
      pedido_compra:0,
      danfe:0,
      extrato_bancario:0,
    };
    const add = (type, points, terms) => {
      for (const term of terms) if (normalized.includes(term)) scores[type] += points;
    };
    add('cadastro_pagamento', 8, ['cadastro de pagamento', 'cadastro pagamento']);
    add('cadastro_pagamento', 2, ['valor bruto', 'valor liquido', 'forma de pagamento', 'data de pagamento', 'favorecido']);
    add('pedido_compra', 8, ['pedido de compra', 'ordem de compra']);
    add('pedido_compra', 3, ['sobras marketing', 'sobra marketing', 'total do pedido', 'condicao de pagamento']);
    add('danfe', 9, ['danfe']);
    add('danfe', 4, ['chave de acesso', 'nota fiscal eletronica', 'natureza da operacao', 'valor total da nota']);
    add('danfe', 2, ['nfe', 'nf-e', 'remessa em bonif']);
    add('extrato_bancario', 8, ['extrato bancario', 'extrato de conta']);
    add('extrato_bancario', 3, ['saldo anterior', 'saldo do dia', 'agencia e conta', 'lancamentos']);
    add('extrato_bancario', 2, ['ted', 'pix', 'transferencia', 'credito em conta']);
    const [type, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return score >= 4 ? { type, score, scores } : { type:'nao_identificado', score, scores };
  }

  function parsePage(text, pageNumber, ocrConfidence = 0) {
    const lines = textLines(text);
    const normalized = fold(text);
    const classification = classify(text);
    const type = classification.type;
    const bonus = /bonif|doacao|brinde/.test(normalized);
    let marketingAmount = amountNear(lines, ['marketing', 'mkt', 'acordo mkt', 'sobra marketing', 'sobras marketing', 'verba marketing']);
    if (marketingAmount === null && type === 'pedido_compra') marketingAmount = amountNear(lines, ['observacoes', 'observag', 'sobra']);
    if (marketingAmount === null && type === 'pedido_compra') marketingAmount = amountNear(lines, ['ankt']);
    const positiveCreditLine = type === 'extrato_bancario' ? lines.find(line => /\+\s*(?:R\$\s*)?\d/.test(line)) : '';
    const positiveCredit = moneyValues(positiveCreditLine)[0] ?? null;
    const transferAmount = positiveCredit ?? amountNear(lines, type === 'extrato_bancario'
      ? ['ted', 'pix', 'transferencia', 'credito em conta', 'valor recebido', 'remet', 'recebimento fornecedor']
      : ['ted', 'pix', 'transferencia', 'credito em conta', 'valor recebido'], type === 'extrato_bancario');
    const totalKeywords = type === 'danfe'
      ? ['valor total da nota', 'total da nota', 'valor total datota', 'valor tolal']
      : type === 'pedido_compra'
        ? ['valor total do pedido', 'total do pedido', 'total geral']
        : type === 'cadastro_pagamento'
          ? ['valor liquido', 'valor bruto', 'valor do pagamento']
          : ['valor total', 'saldo do dia'];
    let totalAmount = largestAmountNear(lines, totalKeywords);
    if (type === 'extrato_bancario' && transferAmount !== null) totalAmount = transferAmount;
    if (totalAmount === null && !['cadastro_pagamento', 'extrato_bancario'].includes(type)) {
      const allAmounts = moneyValues(text).filter(value => value > 0);
      totalAmount = allAmounts.length ? Math.max(...allAmounts) : null;
    }
    if (bonus && marketingAmount === null) marketingAmount = totalAmount;
    const launchAmount = marketingAmount ?? (type === 'extrato_bancario' ? transferAmount : null);
    const cnpj = extractCnpj(text);
    const receivedSupplier = type === 'danfe' ? String(text || '').match(/rec\w{0,3}bemos\s+de\s+(.+?)(?:,\s*os\s+produtos|,\s*os\s+produto|\s+CNPJ)/i)?.[1]?.trim() : null;
    const supplier = receivedSupplier || extractAfterLabel(lines, type === 'extrato_bancario'
      ? ['remetente', 'remet', 'fornecedor', 'favorecido']
      : ['fornecedor', 'razao social', 'favorecido', 'remetente', 'emitente']);
    const orderNumber = identifierNear(lines, [/(?:PEDIDO(?:\s+DE\s+COMPRA)?|ORDEM\s+DE\s+COMPRA)\s*(?:N[º°O.®]*)?\s*[:\-]?\s*([A-Z0-9.\/-]{3,})/i]);
    const invoiceNumber = identifierNear(lines, [/(?:NF[\s-]?E|NOTA\s+FISCAL)\s*(?:N[º°O.]*)?\s*[:\-]?\s*([0-9.\/-]{3,})/i, /N[º°]\s*([0-9.]{4,})/i]);
    const paymentNumber = identifierNear(lines, [/(?:DOCUMENTO|COMPROVANTE|PAGAMENTO)\s*(?:N[º°O.]*)?\s*[:\-]?\s*([A-Z0-9.\/-]{3,})/i]);
    const documentNumber = type === 'pedido_compra' ? orderNumber : type === 'danfe' ? invoiceNumber : paymentNumber || invoiceNumber || orderNumber;
    const emissionDate = dateNear(lines, ['data de emissao', 'emissao', 'emitido em']);
    const dueDate = dateNear(lines, ['vencimento', 'data de vencimento', 'vencto']);
    const paidDate = dateNear(lines, ['data de pagamento', 'pago em', 'pagamento efetuado', 'data movimento', 'lancamento']);
    const incoming = /credito|recebid|sobra|acordo|verba|bonif/.test(normalized);
    const nature = bonus || incoming || marketingAmount !== null ? 'receita' : type === 'extrato_bancario' ? 'neutro' : 'despesa';
    const category = bonus ? 'bonificacao' : marketingAmount !== null || type === 'extrato_bancario' ? 'parceria' : 'outro';
    const evidences = evidenceLines(lines);
    const doubts = [];
    if (type === 'nao_identificado') doubts.push('tipo_documento');
    if (!supplier) doubts.push('fornecedor');
    if (launchAmount === null) doubts.push('valor_lancamento');
    if (!documentNumber) doubts.push('numero_documento');
    const alerts = ['Leitura OCR local: confira o PDF original, pois caracteres e valores podem exigir correção.'];
    if (totalAmount !== null && launchAmount === null) alerts.push('Foi encontrado um total, mas nenhum valor de Marketing foi sugerido automaticamente.');
    if (marketingAmount !== null && totalAmount !== null && marketingAmount !== totalAmount) alerts.push('O valor relacionado ao Marketing é diferente do total do documento.');
    const rawConfidence = Math.max(0, Math.min(1, Number(ocrConfidence || 0) / 100));
    const confidence = type === 'nao_identificado'
      ? Math.min(.45, rawConfidence * .45)
      : Math.min(.94, .42 + Math.min(classification.score, 16) / 32 + rawConfidence * .18);
    const label = TYPE_LABELS[type];
    const titleParts = [label, supplier, documentNumber ? `nº ${documentNumber}` : ''].filter(Boolean);
    return {
      ordem:pageNumber,
      paginas:[pageNumber],
      tipo:type,
      confianca:Math.round(confidence * 1000) / 1000,
      fornecedor:supplier,
      cnpj,
      fornecedor_codigo:null,
      numero_documento:documentNumber,
      numero_pedido:orderNumber,
      numero_nota:invoiceNumber,
      data_emissao:emissionDate,
      vencimento:dueDate,
      data_pagamento:paidDate,
      valor_total_documento:totalAmount,
      valor_marketing:marketingAmount,
      valor_lancamento_sugerido:launchAmount,
      natureza_sugerida:nature,
      categoria_sugerida:category,
      forma_pagamento:/\bpix\b/.test(normalized) ? 'PIX' : /\bted\b/.test(normalized) ? 'TED' : /boleto/.test(normalized) ? 'Boleto' : null,
      titulo_sugerido:titleParts.join(' · '),
      descricao:`Texto extraído localmente da página ${pageNumber}.`,
      observacoes:'Revise os campos reconhecidos antes de concluir a conferência.',
      evidencias:evidences,
      alertas:alerts,
      campos_duvidosos:doubts,
      texto_ocr:String(text || '').slice(0, 12000),
    };
  }

  async function analyzePdf(file, options = {}) {
    const pdfjs = scope.pdfjsLib;
    const tesseract = scope.Tesseract;
    if (!pdfjs?.getDocument) throw new Error('O leitor de PDF não carregou. Atualize a página e tente novamente.');
    if (!tesseract?.createWorker) throw new Error('O OCR local não carregou. Atualize a página e tente novamente.');
    const notify = detail => { try { options.onProgress?.(detail); } catch (_) {} };
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    notify({ phase:'preparing', progress:0, label:'Preparando o PDF...' });
    const loadingTask = pdfjs.getDocument({ data:new Uint8Array(await file.arrayBuffer()) });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    const pagesToRead = Math.min(totalPages, MAX_OCR_PAGES);
    const documents = [];
    let activePage = 1;
    let worker = null;
    try {
      worker = await tesseract.createWorker('por', 1, {
        logger:message => {
          if (message.status !== 'recognizing text') return;
          const pageProgress = Math.max(0, Math.min(1, Number(message.progress || 0)));
          const overall = ((activePage - 1) + pageProgress) / Math.max(pagesToRead, 1);
          notify({ phase:'ocr', page:activePage, total:totalPages, progress:overall, label:`Lendo página ${activePage} de ${totalPages}...` });
        },
      });
      for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
        activePage = pageNumber;
        const page = await pdf.getPage(pageNumber);
        notify({ phase:'page', page:pageNumber, total:totalPages, progress:(pageNumber - 1) / pagesToRead, label:`Analisando página ${pageNumber} de ${totalPages}...` });
        const nativeContent = await page.getTextContent().catch(() => ({ items:[] }));
        const nativeText = (nativeContent.items || []).map(item => item.str).join(' ').trim();
        let recognizedText = nativeText;
        let confidence = nativeText.length > 80 ? 99 : 0;
        if (nativeText.length <= 80) {
          const baseViewport = page.getViewport({ scale:1 });
          const scale = Math.max(1.7, Math.min(2.5, 2300 / Math.max(baseViewport.width, 1)));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext('2d', { willReadFrequently:true });
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext:context, viewport }).promise;
          const result = await worker.recognize(canvas);
          recognizedText = result?.data?.text || '';
          confidence = Number(result?.data?.confidence || 0);
          canvas.width = 1;
          canvas.height = 1;
        }
        documents.push(parsePage(recognizedText, pageNumber, confidence));
        page.cleanup?.();
      }
      for (let pageNumber = pagesToRead + 1; pageNumber <= totalPages; pageNumber += 1) {
        documents.push({
          ...parsePage('', pageNumber, 0),
          alertas:[`A leitura local foi limitada às primeiras ${MAX_OCR_PAGES} páginas. Classifique esta página manualmente.`],
          campos_duvidosos:['tipo_documento', 'fornecedor', 'valor_lancamento', 'numero_documento'],
        });
      }
    } finally {
      if (worker) await worker.terminate().catch(() => null);
      await pdf.destroy().catch(() => null);
    }
    notify({ phase:'done', progress:1, label:'Leitura local concluída.' });
    return {
      total_paginas:totalPages,
      resumo:`${documents.length} página(s) preparada(s) por OCR local para conferência humana.`,
      documentos:documents,
      modelo_leitura:'ocr-local-pdfjs-tesseract-v5',
    };
  }

  scope.PMGDocumentOCR = Object.freeze({ analyzePdf, parsePage, classify, parseBrazilianMoney });
})();
