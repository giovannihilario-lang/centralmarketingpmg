/* PMG Connect — Central de Acompanhamento UX V2.5.8 / React + HTM */
(() => {
  'use strict';

  const { useCallback, useEffect, useMemo, useRef, useState } = React;
  const html = htm.bind(React.createElement);
  const INITIAL_PARAMS = new URLSearchParams(location.search);
  const DEMO_MODE = INITIAL_PARAMS.get('demo') === '1';

  const VIEWS = {
    dashboard: { label: 'Dashboard', eyebrow: 'Visão geral · 2026', icon: 'layout-dashboard' },
    pagamentos: { label: 'Pagamentos', eyebrow: 'Fornecedores · mês a mês', icon: 'table-2' },
    planejamento: { label: 'Planejamento PMG', eyebrow: 'Matriz oficial · 2026', icon: 'target' },
    receita: { label: 'Receita anual', eyebrow: 'Previsão e pagamentos por fornecedor', icon: 'landmark' },
    importar: { label: 'Importar planilha', eyebrow: 'Excel → Central integrada', icon: 'file-up' },
    documentos: { label: 'Documentos', eyebrow: 'Leitura e conferência', icon: 'scan-line' },
  };
  const NAV_VIEW_KEYS = ['dashboard', 'pagamentos', 'planejamento', 'receita', 'importar', 'documentos'];
  const INITIAL_VIEW = NAV_VIEW_KEYS.includes(INITIAL_PARAMS.get('view')) ? INITIAL_PARAMS.get('view') : (INITIAL_PARAMS.get('documento') ? 'documentos' : 'dashboard');
  const INITIAL_RECORD_ID = INITIAL_PARAMS.get('registro') || null;
  const INITIAL_DOCUMENT_ID = INITIAL_PARAMS.get('documento') || null;

  const CATEGORIES = {
    cota_anual: { label: 'Cota anual', icon: 'badge-dollar-sign', tone: 'emerald' },
    campanha_incentivo: { label: 'Campanha de incentivo', icon: 'trophy', tone: 'violet' },
    feira: { label: 'Feira', icon: 'store', tone: 'amber' },
    evento: { label: 'Evento', icon: 'calendar-heart', tone: 'rose' },
    acao_trade: { label: 'Ação de trade', icon: 'megaphone', tone: 'lime' },
    midia: { label: 'Mídia e divulgação', icon: 'radio-tower', tone: 'orange' },
    material: { label: 'Material promocional', icon: 'package-open', tone: 'teal' },
    bonificacao: { label: 'Bonificação', icon: 'gift', tone: 'gold' },
    parceria: { label: 'Parceria', icon: 'handshake', tone: 'plum' },
    social: { label: 'Responsabilidade social', icon: 'heart-handshake', tone: 'rose' },
    equipe: { label: 'Equipe e pessoas', icon: 'users-round', tone: 'teal' },
    pendencia: { label: 'Pendência', icon: 'triangle-alert', tone: 'orange' },
    meta_financeira: { label: 'Indicador executivo', icon: 'gauge', tone: 'violet' },
    outro: { label: 'Outro', icon: 'shapes', tone: 'slate' },
  };

  const MANUAL_PAYMENT_CATEGORIES = [
    'cota_anual', 'campanha_incentivo', 'feira', 'evento', 'acao_trade', 'midia', 'material', 'pendencia', 'outro'
  ];

  const NATURES = {
    receita: { label: 'Receita', icon: 'trending-up', tone: 'positive' },
    despesa: { label: 'Despesa / investimento', icon: 'trending-down', tone: 'negative' },
    indicador: { label: 'Indicador executivo', icon: 'gauge', tone: 'indicator' },
    neutro: { label: 'Sem impacto financeiro', icon: 'minus', tone: 'neutral' },
  };

  const RECORD_STATUS = {
    rascunho: { label: 'Rascunho', icon: 'pencil-line' },
    negociacao: { label: 'Em negociação', icon: 'messages-square' },
    aprovado: { label: 'Aprovado', icon: 'badge-check' },
    em_andamento: { label: 'Em andamento', icon: 'loader-circle' },
    concluido: { label: 'Concluído', icon: 'circle-check-big' },
    cancelado: { label: 'Cancelado', icon: 'circle-x' },
  };

  const PAYMENT_STATUS = {
    previsto: { label: 'Previsto', icon: 'clock-3' },
    solicitado: { label: 'Solicitado', icon: 'send' },
    aprovado: { label: 'Aprovado', icon: 'stamp' },
    agendado: { label: 'Agendado', icon: 'calendar-check' },
    pago: { label: 'Pago', icon: 'badge-check' },
    cancelado: { label: 'Cancelado', icon: 'ban' },
  };

  const FINANCE_STATUS = {
    sem_pagamentos: 'Sem parcelas', pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago', atrasado: 'Atrasado', cancelado: 'Cancelado'
  };

  const DOCUMENT_TYPE_LABELS = Object.freeze({
    desconto_nota:'Desconto em nota', deposito:'Depósito', extrato_bancario:'Extrato bancário', nao_identificado:'Não identificado',
    cadastro_pagamento:'Desconto em nota', pedido_compra:'Desconto em nota', danfe:'Depósito',
  });
  const documentTypeLabel = value => DOCUMENT_TYPE_LABELS[value] || String(value || 'Documento').replaceAll('_', ' ');

  const PAYMENT_METHODS = ['Boleto', 'PIX', 'Transferência bancária', 'Depósito', 'Depósito + abatimento em verba', 'Nota fiscal / faturamento', 'Cartão', 'Abatimento em verba', 'Bonificação', 'Patrocínio', 'Consolidado anual', 'Permuta', 'Dinheiro', 'Não informado', 'Outro'];
  const IMPORT_FIELDS = [
    ['fornecedor', 'Fornecedor / parceiro'], ['fornecedor_codigo', 'Código do fornecedor'],
    ['natureza', 'Natureza financeira'], ['categoria', 'Categoria / tipo'], ['titulo', 'Título / ação'], ['descricao', 'Descrição'],
    ['referencia', 'A que se refere'], ['valor_acordado', 'Valor'], ['forma_pagamento', 'Forma de pagamento'],
    ['vencimento', 'Vencimento'], ['pago_em', 'Data do pagamento'], ['status_pagamento', 'Status do pagamento'],
    ['status', 'Status do acompanhamento'], ['data_inicio', 'Data inicial'], ['data_fim', 'Data final'],
    ['responsavel', 'Responsável'], ['numero_documento', 'Documento / NF'], ['centro_custo', 'Centro de custo'],
    ['contato_nome', 'Contato'], ['contato_email', 'E-mail'], ['contato_telefone', 'Telefone'], ['observacoes', 'Observações']
  ];

  const HEADER_SYNONYMS = {
    fornecedor: ['fornecedor', 'parceiro', 'empresa', 'industria', 'marca'],
    fornecedor_codigo: ['codigo fornecedor', 'cod fornecedor', 'id fornecedor'],
    natureza: ['natureza', 'tipo financeiro', 'receita despesa', 'fluxo'],
    categoria: ['categoria', 'tipo', 'acao', 'tipo de acao', 'projeto'],
    titulo: ['titulo', 'nome', 'campanha', 'evento', 'descricao curta', 'assunto'],
    descricao: ['descricao', 'detalhes', 'escopo'], referencia: ['referencia', 'a que se refere', 'finalidade', 'motivo'],
    valor_acordado: ['valor', 'valor total', 'investimento', 'custo', 'verba', 'total'],
    forma_pagamento: ['forma de pagamento', 'metodo de pagamento', 'pagamento', 'forma pgto'],
    vencimento: ['vencimento', 'data vencimento', 'previsao pagamento', 'data prevista'],
    pago_em: ['data pagamento', 'pago em', 'pagamento realizado'],
    status_pagamento: ['status pagamento', 'situacao pagamento', 'situacao financeira'],
    status: ['status', 'situacao', 'andamento'], data_inicio: ['data inicio', 'inicio', 'vigencia inicio'],
    data_fim: ['data fim', 'fim', 'vigencia fim', 'termino'], responsavel: ['responsavel', 'owner', 'quem acompanha'],
    numero_documento: ['documento', 'nota fiscal', 'nf', 'numero nf', 'pedido'], centro_custo: ['centro de custo', 'cc'],
    contato_nome: ['contato', 'nome contato'], contato_email: ['email', 'e mail'], contato_telefone: ['telefone', 'celular', 'whatsapp'],
    observacoes: ['observacoes', 'observacao', 'comentarios', 'anotacoes']
  };

  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
  const compactMoney = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
  const int = value => new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
  const date = value => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`)) : 'Sem data';
  const dateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';
  const monthLabel = value => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(value).replace('.', '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const supplierCompare = (a, b) => String(a?.fornecedor || a?.name || a || '').localeCompare(String(b?.fornecedor || b?.name || b || ''), 'pt-BR', { sensitivity:'base', numeric:true });

  const OFFICIAL_PLANNING_2026 = Object.freeze({"promocoes":{"label":"Promoções","monthly":[0,3586.9,2449.35,57135,2103,0,0,3489.75,0,4000,0,3000],"paid":[false,true,true,true,true,false,false,true,false,false,false,false]},"catalogo fold":{"label":"Catálogo/ fold","monthly":[0,0,0,5000,0,5000,5000,0,0,0,0,0],"paid":[false,false,false,false,false,false,false,false,false,false,false,false]},"podcast":{"label":"PodCast","monthly":[0,0,0,0,32000,0,0,0,0,0,0,0],"paid":[false,false,false,false,false,false,false,false,false,false,false,false]},"funcionario mes":{"label":"Funcionário/mês","monthly":[2640,2640,2640,2639.4,2640,2640,2640,2640,2640,2640,2640,2640],"paid":[true,true,true,true,true,true,true,true,false,false,false,false]},"boletim":{"label":"Boletim","monthly":[0,0,5000,0,0,5200,0,7000,7000,7000,0,7000],"paid":[false,false,true,false,false,true,false,false,false,false,false,false]},"feiras eventos":{"label":"Feiras/ eventos","monthly":[0,0,0,239873.27,0,816400.56,495000,0,45000,0,0,0],"paid":[false,false,false,true,false,true,false,false,false,false,false,false]},"google":{"label":"Google","monthly":[6000,0,0,0,6000,0,0,0,6000,0,0,6000],"paid":[true,false,false,false,true,false,false,false,false,false,false,false]},"edm":{"label":"EDM²","monthly":[1750,1750,1750,1750,1750,1750,1750,1750,1750,1750,1750,1750],"paid":[true,true,true,true,true,true,true,true,false,false,false,false]},"videos pmg":{"label":"Vídeos PMG","monthly":[0,0,7000,0,0,0,0,7000,0,0,4000,0],"paid":[false,false,true,false,false,false,false,true,false,false,false,false]},"brindes":{"label":"Brindes","monthly":[0,0,0,9000,0,0,0,20000,0,0,0,0],"paid":[false,false,false,false,false,false,false,false,false,false,false,false]},"graac aacd":{"label":"GRAAC / AACD","monthly":[14805.71,13245,15927.38,15245,16958.73,14760.81,15145.56,13245,3000,3000,3000,3000],"paid":[true,true,true,true,true,true,true,true,true,true,true,true]},"ifb":{"label":"IFB","monthly":[6604,6604,6604,6604,6604,6604,6604,6604,6604,6604,6604,6604],"paid":[true,true,true,true,true,true,true,true,true,true,true,true]},"abad":{"label":"ABAD","monthly":[440,440,440,17440,440,440,440,440,440,440,440,440],"paid":[true,true,true,true,true,true,true,true,true,true,true,true]},"diversos":{"label":"Diversos","monthly":[427.77,1642.14,8464.28,1674.7,25038.36,10134.46,3348.37,5000,5000,5000,5000,5000],"paid":[true,true,true,true,true,true,true,false,false,false,false,false]},"convencao":{"label":"Convenção","monthly":[0,0,260869.18,0,0,0,0,0,0,0,160000,0],"paid":[false,false,true,false,false,false,false,false,false,false,false,false]}});
  const safeFileName = value => normalize(value).replace(/\s+/g, '-').slice(0, 80) || 'arquivo';
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const isOverdue = payment => payment.status !== 'pago' && payment.status !== 'cancelado' && payment.vencimento && payment.vencimento < todayKey();
  const category = value => CATEGORIES[value] || { label: value || 'Outro', icon: 'shapes', tone: 'slate' };
  const uniq = values => [...new Set(values.filter(Boolean))];
  const sum = (rows, getter) => rows.reduce((total, item, index) => total + Number(getter(item, index, rows) || 0), 0);
  const hasTag = (record, tag) => (record?.tags || []).some(item => normalize(item) === normalize(tag));
  const paymentValue = payment => Number(payment?.valor_pago || (payment?.status === 'pago' ? payment?.valor_previsto : 0) || 0);
  const paymentMonthKey = payment => String(payment?.pago_em || payment?.vencimento || '').slice(0, 7);
  const recordPayments = (payments, recordId) => payments.filter(item => item.registro_id === recordId);
  const realizedPayments = (payments, recordId) => recordPayments(payments, recordId).filter(item => item.status === 'pago');
  const recordRealized = (payments, record) => sum(realizedPayments(payments, record.id), paymentValue);
  const monthKeyToDate = key => key ? `${key}-01` : '';
  const monthLong = key => key ? new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric' }).format(new Date(`${key}-01T12:00:00`)) : 'Sem competência';
  const supplierKey = value => normalize(officialSupplierName(value) || value).replace(/\s+/g, ' ');
  const supplierRecordIdentity = record => supplierKey(record?.fornecedor || '');
  const cents = value => Math.round(Number(value || 0) * 100);
  const revenueLineMatchKey = (record, payment = null) => {
    const documentNumber = normalize(payment?.numero_documento || record?.numero_documento || '');
    const discriminator = documentNumber ? `doc:${documentNumber}` : `ref:${normalize(record?.referencia || record?.categoria || '')}`;
    return [supplierKey(record?.fornecedor || ''), sourceMonthKey(record), discriminator, cents(record?.valor_acordado || payment?.valor_previsto || payment?.valor_pago || 0)].join('|');
  };

  function withTimeout(promise, timeoutMs = 15000, message = 'A operação demorou mais do que o esperado.') {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => { if (timer) clearTimeout(timer); });
  }

  const loadedAssets = new Map();
  function loadAsset(url, type = 'script') {
    if (loadedAssets.has(url)) return loadedAssets.get(url);
    const promise = new Promise((resolve, reject) => {
      if (type === 'style') {
        const existing = [...document.querySelectorAll('link[rel=\"stylesheet\"]')].find(item => item.href?.includes(url.split('?')[0]));
        if (existing) return resolve(existing);
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = url;
        link.onload = () => resolve(link); link.onerror = () => reject(new Error(`Falha ao carregar ${url}`)); document.head.appendChild(link);
        return;
      }
      const existing = [...document.scripts].find(item => item.src?.includes(url.split('?')[0]));
      if (existing?.dataset?.loaded === '1') return resolve(existing);
      const script = existing || document.createElement('script'); script.src = url; script.defer = true;
      script.onload = () => { script.dataset.loaded = '1'; resolve(script); }; script.onerror = () => reject(new Error(`Falha ao carregar ${url}`));
      if (!existing) document.head.appendChild(script);
    });
    loadedAssets.set(url, promise);
    return promise;
  }

  let documentAssetsPromise = null;
  function ensureDocumentAssets() {
    if (window.PMGDocumentModule?.DocumentInbox) return Promise.resolve(true);
    if (documentAssetsPromise) return documentAssetsPromise;
    documentAssetsPromise = (async () => {
      await loadAsset('/assets/acompanhamento-documentos.css?v=1.2.9', 'style');
      await Promise.all([
        window.XLSX ? Promise.resolve() : loadAsset('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'),
        window.pdfjsLib ? Promise.resolve() : loadAsset('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'),
        window.Tesseract ? Promise.resolve() : loadAsset('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'),
      ]);
      if (!window.PMGAcompanhamentoOCR) await loadAsset('/assets/acompanhamento-ocr.js?v=1.2.6');
      if (!window.PMGDocumentModule?.DocumentInbox) await loadAsset('/assets/acompanhamento-documentos.js?v=1.2.10');
      return Boolean(window.PMGDocumentModule?.DocumentInbox);
    })();
    return documentAssetsPromise;
  }

  let xlsxAssetPromise = null;
  function ensureXlsxAsset() {
    if (window.XLSX) return Promise.resolve(true);
    if (!xlsxAssetPromise) {
      xlsxAssetPromise = withTimeout(
        loadAsset('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'),
        12000,
        'O leitor de Excel demorou para carregar. Verifique a conexão e tente novamente.'
      ).then(() => true).catch(error => { xlsxAssetPromise = null; throw error; });
    }
    return xlsxAssetPromise;
  }

  function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
    useEffect(() => {
      if (typeof window.matchMedia !== 'function') return undefined;
      const media = window.matchMedia(query); const update = () => setMatches(media.matches); update();
      media.addEventListener?.('change', update);
      return () => media.removeEventListener?.('change', update);
    }, [query]);
    return matches;
  }

  function costCenterFromCampaign(value) {
    const text = normalize(value);
    if (text.includes('mtrix') || text.includes('emitrix')) return 'MTRIX / Emitrix';
    if (text.includes('incentivo') || text.includes('campanha') || text.includes('promocao')) return 'Campanha de incentivo';
    if (text.includes('podcast')) return 'Podcast';
    if (text.includes('convencao')) return 'Convenção';
    if (text.includes('copa')) return 'Copa';
    if (text.includes('30 anos')) return 'Evento 30 anos';
    if (text.includes('feira') || text.includes('fipan') || text.includes('fispal') || text.includes('anuga')) return 'Feiras / eventos';
    if (text.includes('catalogo') || text.includes('fold') || text.includes('folder')) return 'Catálogo / material';
    if (text.includes('cota')) return 'Cota';
    return String(value || 'Outros').replace(/\s+/g, ' ').trim();
  }

  function planningMatchKey(value) {
    const text = normalize(value);
    if (/incentivo|campanha|promocao/.test(text)) return 'promocoes';
    if (/catalogo|fold|folder|material/.test(text)) return 'catalogo fold';
    if (/podcast/.test(text)) return 'podcast';
    if (/funcionario|equipe|pessoa/.test(text)) return 'funcionario mes';
    if (/boletim/.test(text)) return 'boletim';
    if (/feira|evento|copa|30 anos|dia do motorista/.test(text)) return 'feiras eventos';
    if (/google/.test(text)) return 'google';
    if (/edm/.test(text)) return 'edm2';
    if (/video/.test(text)) return 'videos pmg';
    if (/brinde/.test(text)) return 'brindes';
    if (/graac|aacd/.test(text)) return 'graac aacd';
    if (/\bifb\b/.test(text)) return 'ifb';
    if (/\babad\b/.test(text)) return 'abad';
    if (/convencao/.test(text)) return 'convencao';
    if (/diverso|outro/.test(text)) return 'diversos';
    return '';
  }

  function specificCostValue(row) {
    // A regra oficial da planilha usa exclusivamente a coluna E (VALOR).
    // Células auxiliares mais à direita não são centros de custo e não entram na importação.
    const direct = officialMoney(row?.[4]);
    return { value: direct > 0 ? direct : 0, columnIndex: 4, legacy: false };
  }

  function parseMoney(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    let raw = String(value ?? '').trim().replace(/R\$|\s/g, '');
    if (!raw) return 0;
    if (raw.includes(',') && raw.includes('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (raw.includes(',')) raw = raw.replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
    const parsed = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeDate(value) {
    if (!value && value !== 0) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && value > 20000 && window.XLSX?.SSF?.parse_date_code) {
      const d = XLSX.SSF.parse_date_code(value);
      if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
    const text = String(value).trim();
    let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (match) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }

  function inferCategory(value) {
    const text = normalize(value);
    if (text.includes('campanha') || text.includes('incentivo')) return 'campanha_incentivo';
    if (text.includes('feira') || text.includes('fipan') || text.includes('fispal') || text.includes('anuga') || text.includes('expo')) return 'feira';
    if (text.includes('evento') || text.includes('encontro') || text.includes('convencao') || text.includes('30 anos') || text.includes('copa')) return 'evento';
    if (text.includes('podcast') || text.includes('mtrix')) return 'midia';
    if (text.includes('cota') || text.includes('plano anual')) return 'cota_anual';
    if (text.includes('trade') || text.includes('degustacao') || text.includes('acao')) return 'acao_trade';
    if (text.includes('midia') || text.includes('divulgacao') || text.includes('encarte')) return 'midia';
    if (text.includes('material') || text.includes('brinde')) return 'material';
    if (text.includes('bonificacao') || text.includes('premio')) return 'bonificacao';
    if (text.includes('parceria')) return 'parceria';
    return 'outro';
  }

  function inferRecordStatus(value) {
    const text = normalize(value);
    if (text.includes('cancel')) return 'cancelado';
    if (text.includes('conclu') || text.includes('finaliz')) return 'concluido';
    if (text.includes('andamento') || text.includes('ativo')) return 'em_andamento';
    if (text.includes('nao aprovado') || text.includes('pendente') || text.includes('aguard')) return 'negociacao';
    if (text.includes('aprov')) return 'aprovado';
    if (text.includes('negocia') || text.includes('aguard')) return 'negociacao';
    return 'rascunho';
  }

  function inferPaymentStatus(value, paidAt) {
    const text = normalize(value);
    if (text.includes('nao pago') || text.includes('pendente') || text.includes('em aberto')) return 'previsto';
    if (paidAt || text.includes('pago') || text.includes('realizado')) return 'pago';
    if (text.includes('cancel')) return 'cancelado';
    if (text.includes('agend')) return 'agendado';
    if (text.includes('aprov')) return 'aprovado';
    if (text.includes('solicit')) return 'solicitado';
    return 'previsto';
  }

  function fingerprint(parts) {
    const value = parts.map(normalize).filter(Boolean).join('|');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return `pmg-${(hash >>> 0).toString(16)}-${value.slice(0, 160)}`;
  }

  /* O React possui apenas o contêiner; o SVG do Lucide fica isolado dentro dele. */
  const lucideIconKey = name => String(name || '').split('-').filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');

  function Icon({ name, size = 18 }) {
    const hostRef = useRef(null);
    useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      host.replaceChildren();
      try {
        const icon = window.lucide?.icons?.[lucideIconKey(name)] || window.lucide?.icons?.[name];
        if (!icon || typeof window.lucide?.createElement !== 'function') return;
        const svg = window.lucide.createElement(icon);
        svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
        svg.setAttribute('stroke-width', '1.9'); svg.setAttribute('aria-hidden', 'true');
        host.replaceChildren(svg);
      } catch (iconError) {
        console.warn('[PMG Ícones] Ícone indisponível:', name, iconError);
      }
      return () => host.replaceChildren();
    }, [name, size]);
    return html`<span ref=${hostRef} className=${`lucide-icon-host lucide-${name}`} aria-hidden="true" style=${{ width:size, height:size, display:'inline-flex', flex:'0 0 auto' }}></span>`;
  }

  function refreshIcons() {}
  function useLucide() {}

  function useAnimatedNumber(target, duration = 750) {
    const [value, setValue] = useState(0);
    useEffect(() => {
      const finalValue = Number(target) || 0;
      const started = performance.now();
      let frame;
      const tick = now => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 4);
        setValue(finalValue * eased);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }, [target, duration]);
    return value;
  }

  async function createDataClient() {
    if (window.PMGConnect?.ready) {
      try {
        await withTimeout(window.PMGConnect.ready, 10000, 'A autenticação compartilhada demorou para responder.');
        if (window.PMGConnect.client) return { db: window.PMGConnect.client, me: window.PMGConnect.profile, session: window.PMGConnect.session };
      } catch (sharedAuthError) {
        console.warn('[PMG Acompanhamento] Autenticação compartilhada indisponível; tentando sessão local.', sharedAuthError);
      }
    }

    if (!window.supabase?.createClient) throw new Error('A conexão segura do PMG Connect não carregou.');
    const session = window.PMGConnectAuth?.getSession?.();
    if (!session?.access_token || !session?.refresh_token) throw new Error('Abra a Central pelo PMG Connect autenticado.');
    const config = window.PMGConnectAuth?.getPublicConfig?.();
    if (!config?.supabaseUrl || !config?.supabasePublishableKey) throw new Error('Configuração pública do PMG Connect indisponível.');
    const db = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
    });
    const { data, error } = await db.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (error) throw error;
    const { data: me, error: profileError } = await db.rpc('garantir_meu_perfil');
    if (profileError) throw profileError;
    return { db, me, session: data?.session || null };
  }

  function demoPayload() {
    const now = new Date();
    const iso = days => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString().slice(0, 10);
    const records = [
      ['m1', 1024, 'marcos', 2026, 'Aurora', 'cota_anual', 'Plano anual de parceria 2026', 'aprovado', 180000, 'parcial', iso(18), 65000],
      ['m2', 1025, 'marketing', 2026, 'Cepêra', 'campanha_incentivo', 'Campanha de incentivo comercial', 'em_andamento', 45000, 'pendente', iso(6), 0],
      ['m3', 1026, 'marketing', 2026, 'Camil', 'feira', 'Participação na feira de negócios', 'negociacao', 32000, 'sem_pagamentos', null, 0],
      ['m4', 1027, 'marcos', 2026, 'GT Foods', 'evento', 'Encontro anual de parceiros', 'aprovado', 68000, 'pago', iso(-12), 68000],
      ['m5', 1028, 'marketing', 2025, 'Quatá', 'midia', 'Plano de mídia cooperada', 'concluido', 28000, 'pago', iso(-80), 28000],
      ['m6', 1029, 'marketing', 2026, 'Frimesa', 'acao_trade', 'Ativação no ponto de venda', 'em_andamento', 21500, 'atrasado', iso(-4), 5000],
      ['m7', 1030, 'marcos', 2024, 'Bunge', 'parceria', 'Acordo estratégico de sell-out', 'concluido', 96000, 'pago', iso(-390), 96000],
      ['m8', 1031, 'marketing', 2026, 'Scala', 'material', 'Materiais para equipe comercial', 'rascunho', 12500, 'pendente', iso(34), 0],
    ].map((r, index) => ({
      id:r[0], codigo:r[1], controle:r[2], ano_referencia:r[3], fornecedor:r[4], categoria:r[5], titulo:r[6],
      natureza:index % 4 === 2 ? 'despesa' : 'receita', impacta_totais:true,
      status:r[7], valor_acordado:r[8], total_previsto:r[8], situacao_financeira:r[9], proximo_vencimento:r[10],
      total_pago:r[11], saldo_aberto:Math.max(0, r[8] - r[11]), quantidade_pagamentos:index % 3 + 1,
      pagamentos_pagos:r[11] ? 1 : 0, pagamentos_atrasados:r[9] === 'atrasado' ? 1 : 0,
      descricao:'Acompanhamento estratégico consolidado na Central PMG.', referencia:'Planejamento comercial e financeiro',
      prioridade:index === 5 ? 'urgente' : 'normal', responsavel_id:index % 2 ? 'c2' : 'c1', atualizado_em:new Date(Date.now() - index * 36e5 * 11).toISOString(),
      data_inicio:iso(-60 + index * 4), data_fim:iso(80 + index * 5), tags:index % 2 ? ['fornecedor', '2026'] : ['diretoria']
    }));
    const payments = records.flatMap((record, index) => {
      const count = record.quantidade_pagamentos;
      return Array.from({ length:count }, (_, p) => {
        const paid = p < record.pagamentos_pagos;
        const due = p === 0 ? record.proximo_vencimento : iso(25 + p * 30 + index);
        const value = record.valor_acordado / count;
        return { id:`p-${index}-${p}`, registro_id:record.id, parcela:p + 1, descricao:`Parcela ${p + 1}/${count}`,
          valor_previsto:value, valor_pago:paid ? value : 0, vencimento:due, pago_em:paid ? iso(-12) : null,
          status:paid ? 'pago' : (record.situacao_financeira === 'atrasado' && p === 0 ? 'aprovado' : 'previsto'), forma_pagamento:p % 2 ? 'PIX' : 'Boleto' };
      });
    });
    const documents = [{
      id:'doc-demo-1', nome_arquivo:'19-08-2026.pdf', caminho:'', mime_type:'application/pdf', tamanho_bytes:2566469,
      total_paginas:4, status:'aguardando_conferencia', resumo_analise:'Quatro modelos recorrentes encontrados e preparados para conferência.',
      criado_em:new Date(Date.now() - 42 * 60_000).toISOString(), atualizado_em:new Date(Date.now() - 35 * 60_000).toISOString(),
    }];
    const documentItems = [
      { id:'doc-item-1', entrada_id:'doc-demo-1', ordem:1, paginas:[1], tipo:'desconto_nota', confianca:.96, status:'aguardando_conferencia', dados_extraidos:{ fornecedor:'Gordura e Óleo Coamo - Principal', fornecedor_codigo:'2928', numero_documento:'1909243', data_emissao:'2026-07-30', vencimento:'2026-08-07', data_pagamento:'2026-08-07', valor_total_documento:205867.05, valor_marketing:7147.99, valor_lancamento_sugerido:7147.99, natureza_sugerida:'receita', categoria_sugerida:'parceria', forma_pagamento:'Débito', titulo_sugerido:'Acordo de Marketing - Coamo', descricao:'Desconto em nota referente ao pedido PC332397 e à NF 1909243.', observacoes:'O documento informa bruto, desconto e líquido. Confirmar que o desconto destacado corresponde ao acordo de Marketing.', evidencias:['DESC R$ 7.147,99 REF. ACORDO MKT'], alertas:['Não usar automaticamente o valor líquido total.'], campos_duvidosos:[] } },
      { id:'doc-item-2', entrada_id:'doc-demo-1', ordem:2, paginas:[2], tipo:'desconto_nota', confianca:.98, status:'aguardando_conferencia', dados_extraidos:{ fornecedor:'Batatas Lamb Weston', fornecedor_codigo:'19555', numero_documento:'333428', numero_pedido:'333428', data_emissao:'2026-08-05', vencimento:'2026-09-02', valor_total_documento:215255.04, valor_marketing:2069.76, valor_lancamento_sugerido:2069.76, natureza_sugerida:'receita', categoria_sugerida:'parceria', forma_pagamento:'28 dias', titulo_sugerido:'Sobras de Marketing - Lamb Weston', descricao:'Desconto em nota identificado a partir do pedido, com separação entre sobras de Compras e de Marketing.', observacoes:'Confirmar o valor destacado de Marketing antes do lançamento.', evidencias:['SOBRAS MARKETING R$ 2.069,76'], alertas:['O total do pedido não é o valor de Marketing.'], campos_duvidosos:[] } },
      { id:'doc-item-3', entrada_id:'doc-demo-1', ordem:3, paginas:[3], tipo:'deposito', confianca:.99, status:'aguardando_conferencia', dados_extraidos:{ fornecedor:'Tondo S.A. Un. São Paulo SP (Jaguaré)', cnpj:'88.618.285/0015-75', numero_documento:'000.056.354', numero_nota:'000.056.354', data_emissao:'2026-08-12', valor_total_documento:10064.60, valor_marketing:10064.60, valor_lancamento_sugerido:10064.60, natureza_sugerida:'receita', categoria_sugerida:'bonificacao', forma_pagamento:null, titulo_sugerido:'Bonificação Tondo - NF 56.354', descricao:'Depósito identificado a partir de nota fiscal/DANFE de remessa em bonificação, doação ou brinde.', observacoes:'Confirmar o tratamento financeiro da bonificação.', evidencias:['REMESSA EM BONIF. DOACAO OU BRINDE', 'VALOR TOTAL DA NOTA 10.064,60'], alertas:['A natureza financeira depende da conferência humana.'], campos_duvidosos:['forma_pagamento'] } },
      { id:'doc-item-4', entrada_id:'doc-demo-1', ordem:4, paginas:[4], tipo:'extrato_bancario', confianca:.94, status:'aguardando_conferencia', dados_extraidos:{ fornecedor:'Cargill Agrícola S.A.', numero_documento:'5477797', data_pagamento:'2026-08-14', valor_total_documento:10000, valor_marketing:10000, valor_lancamento_sugerido:10000, natureza_sugerida:'receita', categoria_sugerida:'parceria', forma_pagamento:'TED', titulo_sugerido:'Transferência recebida - Cargill', descricao:'Crédito destacado no extrato bancário.', observacoes:'Validar o vínculo com o acompanhamento correto da Cargill.', evidencias:['TED-TRANSF ELET DISPON - REMET. CARGILL AGRICOLA S A - R$ 10.000,00'], alertas:[], campos_duvidosos:['acompanhamento_relacionado'] } },
    ].map(item => ({ ...item, entrada:documents[0], criado_em:documents[0].criado_em }));
    return {
      records, payments, collaborators:[{ id:'c1', nome:'Giovanni', role:'colaborador' }, { id:'c2', nome:'Edilson', role:'gestor' }],
      attachments:[], imports:[], conferences:[], conferencesSetupMissing:false, documents, documentItems, documentsSetupMissing:false,
      activities:records.slice(0, 6).map((record, i) => ({ id:i + 1, registro_id:record.id, ator_id:i % 2 ? 'c2' : 'c1', tipo:i % 3 === 0 ? 'pagamento_editado' : 'editado', resumo:i % 3 === 0 ? 'atualizou uma previsão de pagamento' : 'atualizou o acompanhamento', criado_em:record.atualizado_em }))
    };
  }

  async function loadDemoPayload() {
    try {
      const response = await fetch('/data/acompanhamento-carga-inicial.json', { cache:'no-store' });
      if (!response.ok) throw new Error('Carga local indisponível');
      const payload = await response.json();
      if (!Array.isArray(payload?.items) || !payload.items.length) return demoPayload();
      const records = [];
      const payments = [];
      payload.items.forEach((item, index) => {
        const id = `demo-r-${index + 1}`;
        const sourcePayments = Array.isArray(item.pagamentos) ? item.pagamentos : [];
        const paid = sourcePayments.filter(payment => payment.status === 'pago');
        const totalPaid = sum(paid, paymentValue);
        const record = { id, codigo:index + 1, ...item.registro,
          total_previsto:sum(sourcePayments, payment => payment.valor_previsto), total_pago:totalPaid,
          saldo_aberto:Math.max(0, Number(item.registro?.valor_acordado || 0) - totalPaid), quantidade_pagamentos:sourcePayments.length,
          pagamentos_pagos:paid.length, pagamentos_atrasados:0, situacao_financeira:sourcePayments.length ? (paid.length === sourcePayments.length ? 'pago' : (paid.length ? 'parcial' : 'pendente')) : 'sem_pagamentos',
          proximo_vencimento:sourcePayments.find(payment => payment.status !== 'pago')?.vencimento || sourcePayments.at(-1)?.vencimento || null,
          atualizado_em:new Date().toISOString() };
        records.push(record);
        sourcePayments.forEach((payment, paymentIndex) => payments.push({ id:`demo-p-${index + 1}-${paymentIndex + 1}`, registro_id:id, ...payment }));
      });
      return { records:decorateOfficialRevenueTruth(records), payments, collaborators:[{ id:'c1', nome:'Giovanni', role:'colaborador' }], attachments:[], activities:[], imports:[], conferences:[], conferencesSetupMissing:false, documents:[], documentItems:[], documentsSetupMissing:false };
    } catch { return demoPayload(); }
  }

  async function fetchAllPages(makeQuery) {
    const pageSize = 500;
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
      const result = await withTimeout(
        makeQuery().range(offset, offset + pageSize - 1),
        12000,
        'O banco demorou para responder à Central.'
      );
      if (result.error) return result;
      const page = result.data || [];
      rows.push(...page);
      if (page.length < pageSize) return { ...result, data:rows };
      if (rows.length > 50000) throw new Error('A consulta retornou dados demais. A Central interrompeu a carga para evitar travamento.');
    }
  }

  async function fetchAll(db) {
    const queries = await Promise.all([
      fetchAllPages(() => db.from('acompanhamento_painel').select('*').order('atualizado_em', { ascending:false }).order('id')),
      fetchAllPages(() => db.from('acompanhamento_pagamentos').select('*').order('vencimento', { ascending:true }).order('id')),
      db.from('colaboradores').select('id,nome,foto_url,cargo,role,ativo').eq('ativo', true).order('nome'),
      fetchAllPages(() => db.from('acompanhamento_registros').select('id,pagamento_confirmado,pagamento_confirmado_em,pagamento_confirmado_por').order('id')),
    ]);
    const failed = queries.find(result => result.error);
    if (failed) throw failed.error;
    const conferenceQuery = await fetchAllPages(() => db.from('acompanhamento_conferencias').select('*').order('competencia', { ascending:false }).order('id'));
    const conferencesSetupMissing = Boolean(conferenceQuery.error && isMissingConferenceSetupError(conferenceQuery.error));
    if (conferenceQuery.error && !conferencesSetupMissing) throw conferenceQuery.error;

    let documentPendingCount = 0; let documentsSetupMissing = false;
    const documentCount = await db.from('acompanhamento_documentos_itens').select('id', { count:'exact', head:true }).eq('status','aguardando_conferencia');
    if (documentCount.error) {
      documentsSetupMissing = isMissingDocumentSetupError(documentCount.error);
      if (!documentsSetupMissing) console.warn('[Acompanhamento] Não foi possível consultar a contagem de documentos.', documentCount.error);
    } else documentPendingCount = Number(documentCount.count || 0);

    const confirmationMap = new Map((queries[3].data || []).map(item => [item.id, item]));
    const rawRecords = (queries[0].data || []).map(record => ({ ...record, ...(confirmationMap.get(record.id) || {}) }));
    const records = decorateOfficialRevenueTruth(rawRecords);
    return {
      records, payments:queries[1].data || [], collaborators:queries[2].data || [],
      attachments:[], activities:[], imports:[], auxiliaryLoaded:false,
      conferences:conferencesSetupMissing ? [] : (conferenceQuery.data || []), conferencesSetupMissing,
      documents:[], documentItems:[], documentsLoaded:false, documentsSetupMissing, documentPendingCount
    };
  }

  async function fetchAuxiliary(db) {
    const queries = await Promise.all([
      fetchAllPages(() => db.from('acompanhamento_anexos').select('*').order('criado_em', { ascending:false }).order('id')),
      db.from('acompanhamento_atividades').select('*').order('criado_em', { ascending:false }).limit(300),
      db.from('acompanhamento_importacoes').select('*').order('criado_em', { ascending:false }).limit(30),
    ]);
    const failed = queries.find(result => result.error); if (failed) throw failed.error;
    return { attachments:queries[0].data || [], activities:queries[1].data || [], imports:queries[2].data || [], auxiliaryLoaded:true };
  }

  async function fetchDocuments(db) {
    const queries = await Promise.all([
      fetchAllPages(() => db.from('acompanhamento_documentos_entrada').select('*').order('criado_em', { ascending:false }).order('id')),
      fetchAllPages(() => db.from('acompanhamento_documentos_itens').select('*,entrada:acompanhamento_documentos_entrada(id,nome_arquivo,caminho,mime_type,tamanho_bytes,total_paginas,status,criado_em)').order('criado_em', { ascending:false }).order('id')),
    ]);
    const failed = queries.find(result => result.error);
    const documentsSetupMissing = Boolean(failed && isMissingDocumentSetupError(failed.error));
    if (failed && !documentsSetupMissing) throw failed.error;
    const documents = documentsSetupMissing ? [] : (queries[0].data || []);
    const documentItems = documentsSetupMissing ? [] : (queries[1].data || []);
    return { documents, documentItems, documentsLoaded:true, documentsSetupMissing, documentPendingCount:documentItems.filter(item => item.status === 'aguardando_conferencia').length };
  }

  function isMissingConferenceSetupError(fetchError) {
    const details = [fetchError?.message, fetchError?.details, fetchError?.hint, fetchError?.code, fetchError?.status]
      .filter(Boolean).join(' ');
    return /acompanhamento_conferencias|schema cache|PGRST205|42P01|404|does not exist|could not find/i.test(details);
  }

  function isMissingDocumentSetupError(fetchError) {
    const details = [fetchError?.message, fetchError?.details, fetchError?.hint, fetchError?.code, fetchError?.status]
      .filter(Boolean).join(' ');
    return /acompanhamento_documentos_|schema cache|PGRST205|42P01|404|does not exist|could not find/i.test(details);
  }

  function isMissingSetupError(fetchError) {
    const details = [fetchError?.message, fetchError?.details, fetchError?.hint, fetchError?.code, fetchError?.status]
      .filter(Boolean).join(' ');
    return /acompanhamento_|does not exist|schema cache|could not find|not found|PGRST205|42P01|404/i.test(details);
  }

  function buildRecordPayload(record, patch = {}) {
    const merged = { ...record, ...patch };
    return {
      controle:merged.controle || 'marketing', ano_referencia:Number(merged.ano_referencia || new Date().getFullYear()),
      fornecedor:merged.fornecedor || '', fornecedor_codigo:merged.fornecedor_codigo || '', natureza:merged.natureza || 'neutro',
      impacta_totais:merged.impacta_totais !== false, categoria:merged.categoria || 'outro', titulo:merged.titulo || 'Acompanhamento PMG',
      descricao:merged.descricao || '', referencia:merged.referencia || '', responsavel_id:merged.responsavel_id || null,
      contato_nome:merged.contato_nome || '', contato_email:merged.contato_email || '', contato_telefone:merged.contato_telefone || '',
      status:merged.status || 'rascunho', prioridade:merged.prioridade || 'normal', data_inicio:merged.data_inicio || '', data_fim:merged.data_fim || '',
      valor_acordado:Number(merged.valor_acordado || 0), centro_custo:merged.centro_custo || '', numero_documento:merged.numero_documento || '',
      tags:Array.isArray(merged.tags) ? merged.tags : [], observacoes:merged.observacoes || '', origem_importacao:merged.origem_importacao || '',
      linha_origem:merged.linha_origem || null, fingerprint:merged.fingerprint || '', dados_originais:merged.dados_originais || {}
    };
  }

  function buildPaymentPayload(payment = {}, patch = {}) {
    const merged = { ...payment, ...patch };
    const status = merged.status || 'previsto';
    const value = Number(merged.valor_previsto || 0);
    return {
      parcela:Number(merged.parcela || 1), descricao:merged.descricao || '', valor_previsto:value,
      valor_pago:Number(merged.valor_pago ?? (status === 'pago' ? value : 0) ?? 0), vencimento:merged.vencimento || '',
      pago_em:merged.pago_em || '', status, forma_pagamento:merged.forma_pagamento || '', favorecido:merged.favorecido || '',
      numero_documento:merged.numero_documento || '', observacoes:merged.observacoes || '', fingerprint:merged.fingerprint || ''
    };
  }

  const monthKey = (year, monthIndex) => `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const monthPayment = (payments, recordId, year, monthIndex) => payments.find(item => item.registro_id === recordId && String(item.vencimento || item.pago_em || '').startsWith(monthKey(year, monthIndex))) || null;
  const supplierRowPayment = (payments, record, year = Number(record?.ano_referencia || 0), monthIndex = null) => {
    if (!record?.id) return null;
    const sourceIndex = monthIndex == null ? sourceMonthIndex(record) : Number(monthIndex);
    const key = monthKey(Number(year || record.ano_referencia || 0), sourceIndex);
    const candidates = (payments || []).filter(item => item.registro_id === record.id && item.status !== 'cancelado');
    if (!candidates.length) return null;
    const score = item => {
      const dateMatches = String(item.vencimento || item.pago_em || '').startsWith(key);
      const dedicated = item.fingerprint === `confirmacao:${record.id}`;
      const paid = item.status === 'pago';
      return (dedicated ? 100 : 0) + (dateMatches ? 50 : 0) + (paid ? 10 : 0);
    };
    return [...candidates].sort((a,b) => score(b) - score(a) || String(b.atualizado_em || b.criado_em || '').localeCompare(String(a.atualizado_em || a.criado_em || '')))[0] || null;
  };
  const sourceMonthIndex = record => Math.max(0, Number(String(record?.data_inicio || record?.data_fim || '').slice(5, 7) || 1) - 1);
  const sourceMonthKey = record => `${Number(record?.ano_referencia || 0)}-${String(sourceMonthIndex(record) + 1).padStart(2, '0')}`;
  const rowConferenceKey = record => `${record?.fornecedor || 'Sem fornecedor'} · ${record?.referencia || 'COTA'} · L${record?.linha_origem || record?.id || 'novo'}`;
  const isSupplierRevenueRecord = record => record?.controle === 'marketing' && record?.natureza === 'receita' && record?.impacta_totais !== false && hasTag(record, 'fornecedores') && record?.status !== 'cancelado';

  // V2.3.7 — a aba RECEITA do MKTG 2026 é a fonte oficial do realizado.
  // Preservamos inclusive os valores de R$ 1,00 porque o TOTAL da planilha os soma.
  function officialRevenueSnapshot(records, year = 2026) {
    const rows = (records || []).filter(record => Number(record?.ano_referencia) === Number(year)
      && record?.controle === 'marcos' && record?.natureza === 'receita' && record?.fornecedor
      && hasTag(record, 'previsão') && hasTag(record, 'fornecedor') && record?.status !== 'cancelado'
      && Array.isArray(record?.dados_originais?.pagamentos_mensais));
    const bySupplier = new Map();
    const supplierMonthlyTotals = Array(12).fill(0);
    rows.forEach(record => {
      const months = Array.from({ length:12 }, (_, index) => Number(record?.dados_originais?.pagamentos_mensais?.[index] || 0));
      const key = supplierKey(record.fornecedor);
      const current = bySupplier.get(key) || { name:record.fornecedor, record, months:Array(12).fill(0), total:0 };
      months.forEach((value, index) => { current.months[index] += value; supplierMonthlyTotals[index] += value; });
      current.total = sum(current.months, value => value);
      bySupplier.set(key, current);
    });
    const totalRecord = (records || []).find(record => Number(record?.ano_referencia) === Number(year)
      && record?.controle === 'marcos' && record?.natureza === 'indicador' && hasTag(record, 'receita-realizada')
      && Array.isArray(record?.dados_originais?.pagamentos_mensais));
    const monthlyTotals = totalRecord
      ? Array.from({ length:12 }, (_, index) => Number(totalRecord?.dados_originais?.pagamentos_mensais?.[index] || 0))
      : supplierMonthlyTotals;
    const total = totalRecord ? Number(totalRecord.valor_acordado || sum(monthlyTotals, value => value)) : sum(monthlyTotals, value => value);
    return { year:Number(year), rows, bySupplier, monthlyTotals, total, totalRecord, hasData:rows.length > 0 || Boolean(totalRecord) };
  }

  function liveRevenueSnapshot(records, payments, conferences, year = 2026) {
    const official = officialRevenueSnapshot(records, year);
    const localBySupplier = new Map();
    const importedLineKeys = new Set((records || []).filter(record => Number(record?.ano_referencia) === Number(year) && isSupplierRevenueRecord(record)
      && !hasTag(record,'manual') && !normalize(record.origem_importacao).includes('cadastro manual'))
      .map(record => revenueLineMatchKey(record, supplierRowPayment(payments,record,year,sourceMonthIndex(record)))));
    (records || []).filter(record => Number(record?.ano_referencia) === Number(year) && isSupplierRevenueRecord(record)).forEach(record => {
      if (!record?.fornecedor) return;
      const monthIndex = sourceMonthIndex(record);
      const payment = supplierRowPayment(payments, record, year, monthIndex);
      if (supplierRevenueStage(payment, record, conferences, year, monthIndex) !== 'confirmado') return;

      const manual = hasTag(record, 'manual') || normalize(record.origem_importacao).includes('cadastro manual');
      const explicitlyConfirmed = record?.pagamento_confirmado === true;
      if (manual && importedLineKeys.has(revenueLineMatchKey(record,payment))) return;
      // Se a fonte oficial já confirmou a linha, ela já está dentro do snapshot. Recontá-la aqui
      // faria pequenas diferenças históricas virarem receita nova. Só entram deltas realmente locais.
      if (official.hasData && record?._oficial_confirmado === true && !manual) return;
      if (official.hasData && !manual && !explicitlyConfirmed) return;

      const key = supplierKey(record.fornecedor);
      const row = localBySupplier.get(key) || { name:record.fornecedor, manualMonths:Array(12).fill(0), explicitMonths:Array(12).fill(0) };
      const value = supplierConfirmedValue(record, payment);
      if (manual) row.manualMonths[monthIndex] += value;
      else row.explicitMonths[monthIndex] += value;
      localBySupplier.set(key, row);
    });

    const keys = new Set([...official.bySupplier.keys(), ...localBySupplier.keys()]);
    const bySupplier = new Map();
    keys.forEach(key => {
      const source = official.bySupplier.get(key);
      const local = localBySupplier.get(key);
      const months = Array.from({ length:12 }, (_, index) => {
        const sourceValue = Number(source?.months?.[index] || 0);
        const manualValue = Number(local?.manualMonths?.[index] || 0);
        const explicitValue = Number(local?.explicitMonths?.[index] || 0);
        // R$ 1,00 é marcador da fonte oficial. Quando há uma confirmação local real, substituímos
        // o marcador; em valores oficiais reais, uma linha manual é incremento, não substituição.
        const reconciledBase = sourceValue > 1.01
          ? Math.max(sourceValue, explicitValue)
          : explicitValue > 0 ? explicitValue : manualValue > 0 ? 0 : sourceValue;
        return reconciledBase + manualValue;
      });
      bySupplier.set(key, { name:local?.name || source?.name || key, record:source?.record || null, months, total:sum(months, value => value) });
    });

    const officialSupplierTotals = OFFICIAL_MONTHS.map((_, index) => sum([...official.bySupplier.values()], row => Number(row.months[index] || 0)));
    const sourceAdjustments = official.monthlyTotals.map((value, index) => Math.round((Number(value || 0) - Number(officialSupplierTotals[index] || 0)) * 100) / 100);
    const supplierMonthlyTotals = OFFICIAL_MONTHS.map((_, index) => sum([...bySupplier.values()], row => Number(row.months[index] || 0)));
    const monthlyTotals = supplierMonthlyTotals.map((value, index) => Math.round((value + Number(sourceAdjustments[index] || 0)) * 100) / 100);
    const total = sum(monthlyTotals, value => value);
    return { ...official, bySupplier, supplierMonthlyTotals, sourceAdjustments, monthlyTotals, total, hasData:official.hasData || localBySupplier.size > 0, live:true };
  }

  function buildOfficialConfirmationAllocation(records, snapshot, year = 2026) {
    const confirmedIds = new Set();
    const groups = new Map();
    (records || []).filter(record => Number(record?.ano_referencia) === Number(year) && isSupplierRevenueRecord(record)
      && !hasTag(record,'manual') && !normalize(record.origem_importacao).includes('cadastro manual')).forEach(record => {
      const key = `${supplierKey(record.fornecedor)}|${sourceMonthIndex(record)}`;
      const list = groups.get(key) || []; list.push(record); groups.set(key,list);
    });

    groups.forEach((rows,key) => {
      const [supplier,monthRaw] = key.split('|'); const monthIndex = Number(monthRaw);
      const target = cents(snapshot?.bySupplier?.get(supplier)?.months?.[monthIndex] || 0);
      if (target <= 101) return; // R$ 1,00 é marcador, não baixa financeira.
      const values = rows.map(record => Math.max(0,cents(record.valor_acordado)));
      const total = values.reduce((acc,value) => acc + value,0);
      if (Math.abs(target - total) <= 1) { rows.forEach(record => confirmedIds.add(record.id)); return; }

      const exactIndex = values.findIndex(value => Math.abs(value-target) <= 1);
      if (exactIndex >= 0) { confirmedIds.add(rows[exactIndex].id); return; }

      // Procura uma combinação exata/centavo a centavo sem explodir memória.
      const states = new Map([[0,[]]]); let exact = null;
      for (let index=0; index<values.length && !exact; index += 1) {
        const value = values[index];
        if (!value || value > target + 1) continue;
        const snapshotStates = [...states.entries()];
        for (const [subtotal,indexes] of snapshotStates) {
          const next = subtotal + value;
          if (next > target + 1 || states.has(next)) continue;
          const nextIndexes = [...indexes,index]; states.set(next,nextIndexes);
          if (Math.abs(next-target) <= 1) { exact = nextIndexes; break; }
          if (states.size > 50000) break;
        }
        if (states.size > 50000) break;
      }
      if (exact) { exact.forEach(index => confirmedIds.add(rows[index].id)); return; }

      // Sem combinação exata, não adivinha qual linha foi paga. A divergência fica explícita
      // no indicador de integridade até existir um identificador/documento que permita conciliar.
    });
    return confirmedIds;
  }

  function sourceConfirmsSupplierRow(record, snapshot, allocation = null) {
    if (!snapshot?.hasData || !record?.fornecedor) return false;
    if (hasTag(record, 'manual') || normalize(record.origem_importacao).includes('cadastro manual')) return false;
    if (allocation) return allocation.has(record.id);
    const source = snapshot.bySupplier.get(supplierKey(record.fornecedor));
    return Number(source?.months?.[sourceMonthIndex(record)] || 0) > 1.01;
  }

  function decorateOfficialRevenueTruth(records) {
    const sourceRecords = records || [];
    const snapshots = new Map(); const allocations = new Map();
    sourceRecords.forEach(record => {
      if (!isSupplierRevenueRecord(record) || Number(record?.ano_referencia || 0) < 2026) return;
      const year = Number(record.ano_referencia);
      if (!snapshots.has(year)) snapshots.set(year, officialRevenueSnapshot(sourceRecords, year));
    });
    snapshots.forEach((snapshot,year) => allocations.set(year, buildOfficialConfirmationAllocation(sourceRecords,snapshot,year)));
    return sourceRecords.map(record => {
      if (!isSupplierRevenueRecord(record) || Number(record?.ano_referencia || 0) < 2026) return record;
      const year = Number(record.ano_referencia); const snapshot = snapshots.get(year); const allocation = allocations.get(year);
      if (!sourceConfirmsSupplierRow(record, snapshot, allocation)) return { ...record, _oficial_confirmado:false };
      const source = snapshot.bySupplier.get(supplierKey(record.fornecedor));
      return { ...record, _oficial_confirmado:true, _oficial_valor_fonte:Number(source?.months?.[sourceMonthIndex(record)] || 0), _oficial_line_identity:revenueLineMatchKey(record) };
    });
  }

  function buildIntegrityReport(records, payments, conferences, year = 2026) {
    const issues = [];
    const supplierRows = (records || []).filter(record => Number(record?.ano_referencia) === Number(year) && isSupplierRevenueRecord(record));
    const live = liveRevenueSnapshot(records,payments,conferences,year);
    const paymentMonthly = OFFICIAL_MONTHS.map((_,monthIndex) => sum(supplierRows.filter(record => sourceMonthIndex(record) === monthIndex), record => {
      const payment = supplierRowPayment(payments,record,year,monthIndex); return supplierRowConfirmed(record,payment) ? supplierConfirmedValue(record,payment) : 0;
    }));
    const revenueMonthly = live.supplierMonthlyTotals || live.monthlyTotals || Array(12).fill(0);
    const divergentMonths = OFFICIAL_MONTHS.map(([,label],index) => ({ label,index,diff:Math.round((Number(paymentMonthly[index]||0)-Number(revenueMonthly[index]||0))*100)/100 }))
      .filter(item => Math.abs(item.diff) > .01);
    if (divergentMonths.length) issues.push({ severity:'critical', code:'reconciliation', title:`${divergentMonths.length} competência(s) com divergência`, detail:divergentMonths.map(item => `${item.label}: ${money(Math.abs(item.diff))}`).join(' · ') });

    const forecastKeys = new Set((records || []).filter(record => Number(record?.ano_referencia) === Number(year) && record.controle === 'marcos' && record.natureza === 'receita' && record.fornecedor && hasTag(record,'previsão') && hasTag(record,'fornecedor') && record.status !== 'cancelado').map(record => supplierKey(record.fornecedor)));
    const noForecast = [...live.bySupplier.entries()].filter(([key,row]) => Number(row.total||0) > .01 && !forecastKeys.has(key));
    if (noForecast.length) issues.push({ severity:'warning', code:'without-forecast', title:`${noForecast.length} fornecedor(es) sem previsão`, detail:noForecast.slice(0,5).map(([,row])=>row.name).join(', ') + (noForecast.length>5?'…':'') });

    const fingerprints = new Map();
    (records || []).filter(record => record?.fingerprint && record.status !== 'cancelado').forEach(record => { const list=fingerprints.get(record.fingerprint)||[]; list.push(record); fingerprints.set(record.fingerprint,list); });
    const duplicated = [...fingerprints.values()].filter(list => list.length > 1);
    if (duplicated.length) issues.push({ severity:'warning', code:'fingerprint', title:`${duplicated.length} fingerprint(s) duplicado(s)`, detail:'Há registros tecnicamente repetidos que merecem conferência.' });

    const nameGroups = new Map();
    (records || []).filter(record => record.fornecedor).forEach(record => { const key=supplierKey(record.fornecedor); const names=nameGroups.get(key)||new Set(); names.add(String(record.fornecedor).trim()); nameGroups.set(key,names); });
    const aliases = [...nameGroups.values()].filter(names => names.size > 1);
    if (aliases.length) issues.push({ severity:'info', code:'aliases', title:`${aliases.length} fornecedor(es) com grafias conciliadas`, detail:'A Central está usando o nome canônico para manter as abas alinhadas.' });

    const sourceAdjustmentTotal = sum(live.sourceAdjustments || [], value => Math.abs(value));
    if (sourceAdjustmentTotal > .01) issues.push({ severity:'info', code:'source-adjustments', title:'Ajustes da fonte oficial preservados', detail:`${money(sourceAdjustmentTotal)} não estão vinculados a uma linha individual de fornecedor.` });

    const planningSnapshot = buildPlanningSnapshot(records || [], payments || [], year);
    if (planningSnapshot.fallbackCount > 0) issues.push({ severity:'warning', code:'planning-fallback', title:`${planningSnapshot.fallbackCount} frente(s) usando recuperação do Planejamento`, detail:'Os valores aparecem, mas a origem persistida precisa ser atualizada para eliminar o fallback local.' });

    const critical = issues.filter(item => item.severity === 'critical').length;
    const warning = issues.filter(item => item.severity === 'warning').length;
    return { status:critical ? 'critical' : warning ? 'warning' : 'ok', issues, critical, warning, paymentMonthly, revenueMonthly, noForecastCount:noForecast.length, fallbackCount:planningSnapshot.fallbackCount, checkedAt:new Date().toISOString() };
  }

  const conferenceForSupplierRecord = (conferences, record, year = Number(record?.ano_referencia || 0), monthIndex = sourceMonthIndex(record)) => {
    const key = monthKey(Number(year || 0), monthIndex);
    const rowKey = normalize(rowConferenceKey(record));
    return (conferences || []).find(item => String(item.competencia || '').startsWith(key) && normalize(item.fornecedor) === rowKey) || null;
  };
  const supplierRowConfirmed = (record, payment = null) => {
    // O MKTG 2026 vence qualquer estado local quando a linha já consta na fonte oficial.
    if (record?._oficial_confirmado === true) return true;
    if (Number(record?.ano_referencia || 0) >= 2026 && typeof record?.pagamento_confirmado === 'boolean') return record.pagamento_confirmado;
    return payment?.status === 'pago';
  };
  const supplierConfirmedValue = (record, payment = null) => supplierRowConfirmed(record, payment)
    ? Number(record?.valor_acordado || 0)
    : 0;
  const supplierRevenueStage = (payment, record, conferences, year = Number(record?.ano_referencia || 0), monthIndex = sourceMonthIndex(record)) =>
    supplierRowConfirmed(record, payment) ? 'confirmado' : 'a_receber';

  const monthIndexFromText = value => {
    const needle = normalize(value);
    if (!needle) return -1;
    return OFFICIAL_MONTHS.findIndex(([key,label]) => needle.includes(normalize(key)) || needle.includes(normalize(label)));
  };
  const savedNumber = (key, fallback) => {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
  };

  class AppErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error:null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) {
      console.error('[PMG Acompanhamento] Falha de interface capturada:', error, info);
    }
    render() {
      if (!this.state.error) return this.props.children;
      return html`<div className="fatal-screen"><div className="fatal-card"><div className="boot-mark compact"><img src="/imagenssite/pmglogo.png" alt="PMG"/></div><p className="eyebrow">PMG Connect</p><h1>A Central encontrou um erro de interface</h1><p>Seus dados não foram apagados. Recarregue a página para reconstruir a interface com segurança.</p><div className="fatal-actions"><a className="button secondary" href="/central.html">Voltar ao início</a><button className="button primary" onClick=${() => location.reload()}>Recarregar Central</button></div></div></div>`;
    }
  }

  class DocumentErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error:null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) {
      console.error('[PMG Documentos] Falha de interface capturada:', error, info);
    }
    render() {
      if (!this.state.error) return this.props.children;
      return html`<section className="doc-no-selection"><span className="doc-recovery-mark">!</span><h3>Documentos encontrou um erro de interface</h3><p>O PDF e a leitura salva continuam preservados. Volte ao Dashboard e abra Documentos novamente.</p><button className="button primary" onClick=${this.props.onBack}>Voltar ao Dashboard</button></section>`;
    }
  }


  class ImportErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error:null, resetKey:0 }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) {
      console.error('[PMG Importação] Falha isolada no importador:', error, info);
    }
    resetImport = () => this.setState(current => ({ error:null, resetKey:current.resetKey + 1 }));
    render() {
      if (this.state.error) {
        const detail = String(this.state.error?.message || this.state.error || 'Erro de interface não identificado.');
        return html`<section className="import-section import-recovery"><div className="mapping-panel official-detection"><div className="official-detection-icon danger"><${Icon} name="triangle-alert" size=${25}/></div><div><span className="eyebrow">Importação interrompida com segurança</span><h3>A planilha não derrubou a Central</h3><p>Nenhum dado é gravado apenas por selecionar um arquivo. O importador foi isolado para você poder tentar novamente sem recarregar todo o sistema.</p><div className="fatal-actions"><button className="button primary" onClick=${this.resetImport}>Tentar outra planilha</button><button className="button secondary" onClick=${this.props.onBack}>Voltar ao Dashboard</button></div><details className="import-error-detail"><summary>Detalhe técnico</summary><code>${detail}</code></details></div></div></section>`;
      }
      return html`<${React.Fragment} key=${this.state.resetKey}>${this.props.children}</${React.Fragment}>`;
    }
  }

  function App() {
    const [view, setView] = useState(INITIAL_VIEW);
    const [mobileNav, setMobileNav] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [setupMissing, setSetupMissing] = useState(false);
    const [client, setClient] = useState(null);
    const [me, setMe] = useState(null);
    const [data, setData] = useState({ records:[], payments:[], collaborators:[], attachments:[], activities:[], imports:[], auxiliaryLoaded:false, conferences:[], conferencesSetupMissing:false, documents:[], documentItems:[], documentsLoaded:false, documentsSetupMissing:false, documentPendingCount:0 });
    const [control, setControl] = useState('todos');
    const [year, setYear] = useState(new Date().getFullYear());
    const [search, setSearch] = useState('');
    const [recordModal, setRecordModal] = useState(null);
    const [paymentModal, setPaymentModal] = useState(null);
    const [supplierRowModal, setSupplierRowModal] = useState(null);
    const [forecastGroup, setForecastGroup] = useState(null);
    const [selectedId, setSelectedId] = useState(INITIAL_RECORD_ID);
    const [supplierSelected, setSupplierSelected] = useState(null);
    const [paymentJump, setPaymentJump] = useState(null);
    const [revenueJump, setRevenueJump] = useState(null);
    const [integrityOpen, setIntegrityOpen] = useState(false);
    const [documentAssetsState, setDocumentAssetsState] = useState('idle');
    const [toast, setToast] = useState(null);
    const [saving, setSaving] = useState(false);
    const subscriptionRef = useRef(null);
    const reloadSeqRef = useRef(0);
    const quickActionRef = useRef(false);

    const notify = useCallback((message, tone = 'success') => {
      setToast({ message, tone, id:Date.now() });
      setTimeout(() => setToast(current => current?.message === message ? null : current), 3600);
    }, []);

    const reload = useCallback(async (quiet = false) => {
      if (!client || DEMO_MODE) return;
      const requestSeq = ++reloadSeqRef.current;
      if (!quiet) setLoading(true);
      try {
        const nextData = await withTimeout(fetchAll(client), 25000, 'A Central demorou para receber os dados do banco. Tente novamente.');
        if (requestSeq !== reloadSeqRef.current) return;
        setData(current => ({
          ...nextData,
          attachments:current.auxiliaryLoaded ? current.attachments : nextData.attachments,
          activities:current.auxiliaryLoaded ? current.activities : nextData.activities,
          imports:current.auxiliaryLoaded ? current.imports : nextData.imports,
          auxiliaryLoaded:current.auxiliaryLoaded || nextData.auxiliaryLoaded,
          documents:current.documentsLoaded ? current.documents : nextData.documents,
          documentItems:current.documentsLoaded ? current.documentItems : nextData.documentItems,
          documentsLoaded:current.documentsLoaded || nextData.documentsLoaded,
          documentPendingCount:current.documentsLoaded ? current.documentItems.filter(item => item.status === 'aguardando_conferencia').length : nextData.documentPendingCount,
        }));
        setError(null); setSetupMissing(false);
        return true;
      } catch (fetchError) {
        if (requestSeq !== reloadSeqRef.current) return;
        const missing = isMissingSetupError(fetchError);
        if (missing) setData({ records:[], payments:[], collaborators:[], attachments:[], activities:[], imports:[], auxiliaryLoaded:false, conferences:[], conferencesSetupMissing:true, documents:[], documentItems:[], documentsLoaded:false, documentsSetupMissing:true, documentPendingCount:0 });
        setSetupMissing(missing);
        setError(fetchError);
        return false;
      } finally {
        if (requestSeq === reloadSeqRef.current && !quiet) setLoading(false);
      }
    }, [client]);

    const ensureAuxiliary = useCallback(async (force = false) => {
      if (!client || DEMO_MODE || (data.auxiliaryLoaded && !force)) return true;
      try { const extra = await fetchAuxiliary(client); setData(current => ({ ...current, ...extra })); return true; }
      catch (auxError) { notify(auxError.message || 'Não foi possível carregar os detalhes auxiliares.', 'error'); return false; }
    }, [client, data.auxiliaryLoaded, notify]);

    const ensureDocumentsData = useCallback(async () => {
      if (!client || DEMO_MODE || data.documentsLoaded || data.documentsSetupMissing) return true;
      try { const extra = await fetchDocuments(client); setData(current => ({ ...current, ...extra })); return true; }
      catch (documentError) { notify(documentError.message || 'Não foi possível carregar os documentos.', 'error'); return false; }
    }, [client, data.documentsLoaded, data.documentsSetupMissing, notify]);

    useEffect(() => {
      if (view === 'documentos') {
        setDocumentAssetsState(window.PMGDocumentModule?.DocumentInbox ? 'ready' : 'loading');
        Promise.all([ensureDocumentAssets(), ensureDocumentsData()]).then(() => setDocumentAssetsState('ready')).catch(assetError => {
          console.error(assetError); setDocumentAssetsState('error'); notify('Não foi possível carregar o módulo de Documentos.', 'error');
        });
      }
    }, [view, ensureDocumentsData, notify]);

    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          if (DEMO_MODE) {
            const demo = await loadDemoPayload();
            if (alive) { setMe({ nome:'Giovanni', role:'colaborador' }); setData(demo); setLoading(false); }
            return;
          }
          const connection = await createDataClient();
          if (!alive) return;
          const authEmail = String(connection.session?.user?.email || window.PMGConnect?.session?.user?.email || '').trim().toLowerCase();
          setClient(connection.db); setMe({ ...(connection.me || {}), email:authEmail });
        } catch (initError) {
          if (alive) { setError(initError); setLoading(false); }
        }
      })();
      return () => { alive = false; };
    }, []);

    useEffect(() => { if (client) void reload(); }, [client, reload]);
    useEffect(() => {
      if (!loading) return undefined;
      const watchdog = setTimeout(() => {
        setLoading(false);
        setError(current => current || new Error('A Central demorou demais para carregar. Nenhum dado foi alterado. Tente novamente.'));
      }, 30000);
      return () => clearTimeout(watchdog);
    }, [loading]);
    useEffect(() => { setSearch(''); }, [view]);

    useEffect(() => {
      const shortcut = event => {
        if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
          event.preventDefault(); setCommandOpen(current => !current);
        }
        if (event.key === 'Escape') setCommandOpen(false);
      };
      document.addEventListener('keydown', shortcut);
      return () => document.removeEventListener('keydown', shortcut);
    }, []);

    useEffect(() => {
      if (!client || DEMO_MODE) return undefined;
      subscriptionRef.current?.unsubscribe?.();
      const patchCollection = (current, payload) => {
        const id = payload?.new?.id || payload?.old?.id; if (!id) return current;
        if (payload.eventType === 'DELETE') return current.filter(item => item.id !== id);
        const incoming = payload.new || {};
        return current.some(item => item.id === id) ? current.map(item => item.id === id ? { ...item, ...incoming } : item) : [...current, incoming];
      };
      const onRecord = payload => setData(current => ({ ...current, records:decorateOfficialRevenueTruth(patchCollection(current.records,payload)) }));
      const onPayment = payload => setData(current => ({ ...current, payments:patchCollection(current.payments,payload) }));
      const onConference = payload => setData(current => ({ ...current, conferences:patchCollection(current.conferences,payload) }));
      const onDocument = payload => setData(current => current.documentsLoaded ? ({ ...current, documents:patchCollection(current.documents,payload) }) : current);
      const onDocumentItem = payload => setData(current => {
        if (!current.documentsLoaded) return current;
        const documentItems = patchCollection(current.documentItems,payload);
        return { ...current, documentItems, documentPendingCount:documentItems.filter(item => item.status === 'aguardando_conferencia').length };
      });
      let channel = client.channel('central-acompanhamento-live')
        .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_registros' }, onRecord)
        .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_pagamentos' }, onPayment);
      if (!data.conferencesSetupMissing) channel = channel.on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_conferencias' }, onConference);
      if (!data.documentsSetupMissing && data.documentsLoaded) channel = channel
        .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_documentos_entrada' }, onDocument)
        .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_documentos_itens' }, onDocumentItem);
      subscriptionRef.current = channel.subscribe();
      return () => subscriptionRef.current?.unsubscribe?.();
    }, [client, data.documentsSetupMissing, data.conferencesSetupMissing, data.documentsLoaded]);

    const years = useMemo(() => uniq(data.records.map(item => item.ano_referencia)).sort((a, b) => b - a), [data.records]);
    const filteredRecords = useMemo(() => {
      const needle = normalize(search);
      return data.records.filter(record => {
        if (control !== 'todos' && record.controle !== control) return false;
        if (year !== 'todos' && String(record.ano_referencia) !== String(year)) return false;
        if (!needle) return true;
        return normalize([record.codigo, record.fornecedor, record.titulo, record.referencia, category(record.categoria).label, record.status, ...(record.tags || [])].join(' ')).includes(needle);
      });
    }, [data.records, control, year, search]);

    const selected = useMemo(() => data.records.find(item => item.id === selectedId) || null, [data.records, selectedId]);
    const navigatePayments = useCallback((options = {}) => {
      setPaymentJump({ ...options, token:Date.now() }); setView('pagamentos');
      requestAnimationFrame(() => window.scrollTo({ top:0, behavior:'smooth' }));
    }, []);
    const navigateRevenue = useCallback((options = {}) => {
      setRevenueJump({ ...options, token:Date.now() }); setView('receita');
      requestAnimationFrame(() => window.scrollTo({ top:0, behavior:'smooth' }));
    }, []);
    const integrity = useMemo(() => buildIntegrityReport(data.records,data.payments,data.conferences,2026), [data.records,data.payments,data.conferences]);
    const openSupplier = useCallback(name => { if (name) { void ensureAuxiliary(); setSelectedId(null); setSupplierSelected(name); } }, [ensureAuxiliary]);
    const actorEmail = String(me?.email || '').trim().toLowerCase();
    const canEditPlanning = actorEmail === 'marcos@pmg.com.br';
    const canEditPayments = actorEmail === 'marcos@pmg.com.br' || actorEmail === 'marketing@pmg.com.br';
    const canConfirmPayments = actorEmail === 'marcos@pmg.com.br';
    const context = { ...data, records:filteredRecords, allRecords:data.records, activeControl:control, activeYear:year, setControl, setYear, search, setSearch, client, me, canEditPlanning, canEditPayments, canConfirmPayments, reload, notify, saving, setSaving, paymentJump, revenueJump, navigatePayments, navigateRevenue, openSupplier, integrity, openIntegrity:() => setIntegrityOpen(true), openForecastGroup:group => setForecastGroup(group), ensureAuxiliary,
      initialDocumentId:INITIAL_DOCUMENT_ID,
      openRecord:record => { void ensureAuxiliary(); setSelectedId(record.id); }, editRecord:record => setRecordModal(record), newRecord:(defaults = {}) => setRecordModal({ controle:control === 'todos' ? 'marketing' : control, ano_referencia:year === 'todos' ? new Date().getFullYear() : year, ...defaults }),
      newSupplierRow:(defaults = {}) => setSupplierRowModal(defaults),
      newPayment:record => setPaymentModal({ registro_id:record?.id || selectedId }), editPayment:payment => setPaymentModal(payment), saveConference, setView,
      quickUpdateRecord, quickUpdatePayment, quickUpsertPayment, quickTogglePlanningPaid, quickTogglePaid, quickBulkConfirm, quickBulkNF, quickBulkArchive, quickUpdateSupplierRow, quickUpdateSpecificValue };

    useLucide([view, mobileNav, commandOpen, loading, error, setupMissing, selectedId, recordModal, paymentModal, filteredRecords.length]);

    async function saveRecord(payload, id) {
      if (DEMO_MODE) { notify('Modo demonstração: cadastro validado.', 'info'); setRecordModal(null); return; }
      setSaving(true);
      try {
        const { data:idSaved, error:saveError } = await client.rpc('salvar_acompanhamento_v1', { p_registro_id:id || null, p_dados:payload });
        if (saveError) throw saveError;
        await reload(true); setRecordModal(null); setSelectedId(idSaved);
        notify(id ? 'Acompanhamento atualizado.' : 'Novo acompanhamento criado.');
      } catch (saveError) { notify(saveError.message || 'Não foi possível salvar.', 'error'); }
      finally { setSaving(false); }
    }

    async function saveSupplierRow(payload) {
      if (!canEditPayments) { notify('Somente Marcos e Edilson podem alterar a Planilha de Acompanhamentos.', 'error'); return; }
      const supplier = officialSupplierName(payload.fornecedor || '');
      const amount = Math.max(0, Number(payload.valor_acordado || 0));
      const yearValue = Number(payload.ano_referencia || 2026);
      const monthIndex = Math.max(0, Math.min(11, Number(payload.monthIndex || 0)));
      const categoryKey = MANUAL_PAYMENT_CATEGORIES.includes(payload.categoria) ? payload.categoria : 'outro';
      const categoryLabel = category(categoryKey).label;
      if (!supplier) { notify('Informe o fornecedor.', 'error'); return; }
      if (!(amount > 0) && categoryKey !== 'pendencia') { notify('Informe um valor maior que zero.', 'error'); return; }
      if (DEMO_MODE) { notify('Modo demonstração: linha manual validada.', 'info'); setSupplierRowModal(null); return; }
      setSaving(true);
      try {
        const monthName = OFFICIAL_MONTHS[monthIndex][1];
        const isPendency = categoryKey === 'pendencia';
        const recordPayload = buildRecordPayload({}, {
          controle:'marketing', ano_referencia:yearValue, fornecedor:supplier, natureza:'receita', impacta_totais:true,
          categoria:categoryKey, referencia:isPendency ? 'Pendência' : categoryLabel,
          titulo:`${isPendency ? 'Pendência' : categoryLabel} — ${supplier} — ${monthName} ${yearValue}`,
          descricao:isPendency ? 'Pendência cadastrada manualmente na planilha de pagamentos.' : `Receita cadastrada manualmente em ${monthName} de ${yearValue}.`,
          status:isPendency ? 'negociacao' : 'concluido', prioridade:isPendency ? 'alta' : 'normal',
          data_inicio:officialMonthStart(yearValue, monthIndex), data_fim:officialMonthEnd(yearValue, monthIndex),
          valor_acordado:amount, centro_custo:categoryLabel, numero_documento:String(payload.numero_documento || '').trim(),
          tags:isPendency
            ? ['marketing','pendência',String(yearValue),monthName.toLocaleLowerCase('pt-BR'),'manual']
            : ['marketing','fornecedores',String(yearValue),monthName.toLocaleLowerCase('pt-BR'),...officialTags(categoryLabel),'manual'],
          origem_importacao:'cadastro-manual',
          fingerprint:fingerprint(['marketing','manual',yearValue,monthIndex + 1,supplier,categoryKey,String(payload.numero_documento || ''),Date.now()]),
          dados_originais:{ origem:'cadastro_manual', competencia:monthKey(yearValue, monthIndex), categoria_manual:categoryKey, tipo_documento:String(payload.tipo_documento || 'nota_fiscal'), fornecedor_id:supplierKey(supplier) }
        });
        await rpcRecord(null, recordPayload);
        setSupplierRowModal(null);
        notify(isPendency ? 'Pendência adicionada.' : 'Linha adicionada. Confirme o pagamento quando o valor for recebido.');
      } catch (saveError) { notify(saveError.message || 'Não foi possível adicionar a linha.', 'error'); }
      finally { setSaving(false); }
    }

    async function savePayment(payload, id, recordId) {
      if (DEMO_MODE) { notify('Modo demonstração: pagamento validado.', 'info'); setPaymentModal(null); return; }
      setSaving(true);
      try {
        const { error:saveError } = await client.rpc('salvar_pagamento_acompanhamento_v1', { p_pagamento_id:id || null, p_registro_id:recordId, p_dados:payload });
        if (saveError) throw saveError;
        await reload(true); setPaymentModal(null); notify(payload.status === 'pago' ? 'Pagamento registrado com sucesso.' : 'Previsão financeira salva.');
      } catch (saveError) { notify(saveError.message || 'Não foi possível salvar o pagamento.', 'error'); }
      finally { setSaving(false); }
    }

    async function rpcRecord(record, patch = {}) {
      if (DEMO_MODE) {
        const id = record?.id || `demo-record-${Date.now()}`;
        setData(current => ({ ...current, records:record?.id
          ? current.records.map(item => item.id === record.id ? { ...item, ...patch, atualizado_em:new Date().toISOString() } : item)
          : [...current.records, { id, ...buildRecordPayload({}, patch), criado_em:new Date().toISOString(), atualizado_em:new Date().toISOString() }] }));
        return id;
      }
      const { data:idSaved, error:saveError } = await client.rpc('salvar_acompanhamento_v1', { p_registro_id:record?.id || null, p_dados:buildRecordPayload(record || {}, patch) });
      if (saveError) throw saveError;
      const id = idSaved || record?.id;
      reloadSeqRef.current += 1;
      setData(current => {
        const nextRecords = current.records.some(item => item.id === id)
          ? current.records.map(item => item.id === id ? { ...item, ...patch } : item)
          : [...current.records, { id, ...buildRecordPayload(record || {}, patch) }];
        return { ...current, records:decorateOfficialRevenueTruth(nextRecords) };
      });
      return id;
    }

    async function rpcPayment(payment, recordId, patch = {}) {
      if (DEMO_MODE) {
        const id = payment?.id || `demo-payment-${Date.now()}`;
        setData(current => ({ ...current, payments:payment?.id
          ? current.payments.map(item => item.id === payment.id ? { ...item, ...patch } : item)
          : [...current.payments, { id, registro_id:recordId, ...buildPaymentPayload({}, patch) }] }));
        return id;
      }
      const { data:idSaved, error:saveError } = await client.rpc('salvar_pagamento_acompanhamento_v1', { p_pagamento_id:payment?.id || null, p_registro_id:recordId, p_dados:buildPaymentPayload(payment || {}, patch) });
      if (saveError) throw saveError;
      const id = idSaved || payment?.id;
      const saved = { ...payment, ...buildPaymentPayload(payment || {}, patch), id, registro_id:recordId };
      reloadSeqRef.current += 1;
      setData(current => ({ ...current, payments:current.payments.some(item => item.id === id)
        ? current.payments.map(item => item.id === id ? { ...item, ...saved } : item)
        : [...current.payments, saved] }));
      return id;
    }

    async function runQuick(action, message = 'Alteração salva.') {
      if (saving || quickActionRef.current) return false;
      quickActionRef.current = true;
      setSaving(true);
      try {
        await action();
        notify(message); return true;
      }
      catch (quickError) { notify(quickError.message || 'Não foi possível salvar a alteração.', 'error'); return false; }
      finally { quickActionRef.current = false; setSaving(false); }
    }

    async function quickUpdateRecord(record, patch, message = 'Célula atualizada.') {
      return runQuick(() => rpcRecord(record, patch), message);
    }

    async function quickUpdatePayment(payment, record, patch, message = 'Pagamento atualizado.') {
      return runQuick(() => rpcPayment(payment, record.id, patch), message);
    }

    async function quickUpsertPayment(record, payment, monthIndex, amount, options = {}) {
      if (hasTag(record, 'planejamento') && !canEditPlanning) {
        notify('Somente marcos@pmg.com.br pode alterar o Planejamento PMG.', 'error');
        return false;
      }
      const yearValue = Number(record.ano_referencia || 2026);
      const due = officialMonthEnd(yearValue, monthIndex);
      const value = Math.max(0, Number(amount) || 0);
      const status = options.status || payment?.status || 'previsto';
      const currentPayments = data.payments.filter(item => item.registro_id === record.id && item.id !== payment?.id && item.status !== 'cancelado');
      const planning = hasTag(record, 'planejamento') ? buildPlanningSnapshot([record], data.payments, yearValue) : null;
      const newTotal = planning
        ? Math.round(sum(OFFICIAL_MONTHS, (_, index) => index === monthIndex ? value : planning.planningCellValue(record, index)) * 100) / 100
        : sum(currentPayments, item => item.valor_previsto) + value;
      const paymentPatch = {
        parcela:payment?.parcela || currentPayments.length + 1,
        descricao:payment?.descricao || `${record.referencia || record.fornecedor || 'Lançamento'} — ${OFFICIAL_MONTHS[monthIndex][1]} ${yearValue}`,
        valor_previsto:value, valor_pago:status === 'pago' ? value : (planning ? 0 : Number(payment?.valor_pago || 0)), vencimento:due,
        pago_em:status === 'pago' ? (options.pago_em || payment?.pago_em || due) : '', status,
        forma_pagamento:payment?.forma_pagamento || options.forma_pagamento || 'Não informado', favorecido:record.fornecedor || '',
        numero_documento:payment?.numero_documento || record.numero_documento || '', observacoes:payment?.observacoes || options.observacoes || '',
        fingerprint:payment?.fingerprint || fingerprint([record.fingerprint || record.id, options.fingerprintLabel || 'celula', monthIndex + 1])
      };
      return runQuick(async () => { await rpcPayment(payment, record.id, paymentPatch); if (options.syncRecordTotal !== false) await rpcRecord(record, { valor_acordado:newTotal }); }, options.message || 'Valor atualizado.');
    }

    async function quickTogglePlanningPaid(record, monthIndex) {
      if (!canEditPlanning) {
        notify('Somente marcos@pmg.com.br pode alterar o Planejamento PMG.', 'error');
        return false;
      }
      if (!record || saving || quickActionRef.current || !hasTag(record, 'planejamento') || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return false;
      const snapshot = buildPlanningSnapshot([record], data.payments, Number(record.ano_referencia || 2026));
      const payment = snapshot.paymentMap.get(`${record.id}|${monthIndex}`);
      const amount = snapshot.planningCellValue(record, monthIndex);
      if (!(amount > 0)) { notify('Informe um valor antes de marcar o mês como pago.', 'info'); return false; }
      const willPay = !snapshot.planningCellPaid(record, monthIndex);
      return quickUpsertPayment(record, payment, monthIndex, amount, {
        status:willPay ? 'pago' : 'previsto', pago_em:willPay ? todayKey() : '',
        syncRecordTotal:true, fingerprintLabel:'planejamento',
        message:willPay ? 'Mês marcado como pago. Totais atualizados.' : 'Mês marcado em aberto. Totais atualizados.',
      });
    }

    async function quickTogglePaid(payment, record) {
      if (!record || saving) return false;
      if (!canConfirmPayments) {
        notify('Somente marcos@pmg.com.br pode confirmar pagamentos.', 'error');
        return false;
      }
      if (supplierRowConfirmed(record, payment) || record._oficial_confirmado === true) {
        notify('Este pagamento já está confirmado e bloqueado. A confirmação não pode ser desfeita.', 'info');
        return true;
      }
      const willPay = true;
      const expectedStatus = 'pago';
      const monthIndex = sourceMonthIndex(record);
      const temporaryId = payment?.id || `optimistic-payment-${record.id}`;
      const optimisticPayment = {
        ...(payment || {}),
        id:temporaryId, registro_id:record.id, parcela:Number(payment?.parcela || 1),
        descricao:payment?.descricao || `${record.referencia || record.fornecedor || 'Lançamento'} — ${OFFICIAL_MONTHS[monthIndex][1]} ${record.ano_referencia}`,
        valor_previsto:Number(payment?.valor_previsto || record.valor_acordado || 0),
        valor_pago:willPay ? Number(payment?.valor_previsto || record.valor_acordado || 0) : 0,
        vencimento:payment?.vencimento || officialMonthEnd(Number(record.ano_referencia || 2026), monthIndex),
        pago_em:willPay ? todayKey() : '', status:expectedStatus,
        numero_documento:payment?.numero_documento || record.numero_documento || '',
        favorecido:payment?.favorecido || record.fornecedor || ''
      };
      const previousData = data;
      const optimisticRecord = {
        ...record,
        pagamento_confirmado:willPay,
        pagamento_confirmado_em:willPay ? todayKey() : null
      };

      // V1.9.5: a linha é a fonte de verdade. Atualizamos linha + pagamento juntos,
      // mas o botão nunca mais depende de reencontrar um movimento financeiro.
      setData(current => ({
        ...current,
        records:current.records.map(item => item.id === record.id ? { ...item, ...optimisticRecord } : item),
        payments:payment?.id
          ? current.payments.map(item => item.id === payment.id ? optimisticPayment : item)
          : [...current.payments, optimisticPayment]
      }));
      setSaving(true);
      try {
        let persistedPayment = payment || optimisticPayment;
        let persistedRecord = optimisticRecord;
        if (!DEMO_MODE) {
          const { data:toggleData, error:toggleError } = await client.rpc('confirmar_pagamento_linha_v1', {
            p_registro_id:record.id,
            p_confirmado:willPay
          });
          if (toggleError) {
            const details = [toggleError.message, toggleError.details, toggleError.hint, toggleError.code].filter(Boolean).join(' · ');
            const missingRpc = /confirmar_pagamento_linha_v1|PGRST202|schema cache|could not find the function|pagamento_confirmado/i.test(details);
            if (missingRpc) throw new Error('Falta instalar a confirmação direta da linha. Execute o SQL 14-HOTFIX-STATUS-NA-LINHA-V1.9.5.sql no Supabase e atualize a página.');
            throw new Error(details || 'O Supabase recusou a confirmação.');
          }

          const payload = Array.isArray(toggleData) ? toggleData[0] : toggleData;
          if (payload?.pagamento) persistedPayment = payload.pagamento;
          if (payload?.registro) persistedRecord = { ...record, ...payload.registro };

          // A própria RPC devolve a linha depois do UPDATE na mesma transação.
          // Isso evita uma segunda ida ao Supabase em cada clique.
          if (!payload?.registro || Boolean(payload.registro.pagamento_confirmado) !== willPay) {
            throw new Error('O banco não confirmou o novo status da linha.');
          }
          persistedRecord = { ...record, ...payload.registro };
        }

        setData(current => ({
          ...current,
          records:current.records.map(item => item.id === record.id ? { ...item, ...persistedRecord } : item),
          payments:current.payments
            .filter(item => item.id !== temporaryId && (!payment?.id || item.id !== payment.id))
            .concat(persistedPayment?.id ? [persistedPayment] : [])
        }));
        notify(willPay ? 'Pagamento confirmado e lançado na Receita.' : 'Pagamento reaberto e removido da Receita.');
        return true;
      } catch (quickError) {
        // Invalida qualquer reload disparado durante a tentativa e restaura o snapshot.
        reloadSeqRef.current += 1;
        setData(previousData);
        notify(quickError.message || 'Não foi possível alterar este pagamento.', 'error');
        return false;
      } finally { setSaving(false); }
    }

    async function quickBulkConfirm(rows, confirmed = true) {
      if (!canConfirmPayments) { notify('Somente marcos@pmg.com.br pode confirmar pagamentos.', 'error'); return false; }
      if (confirmed !== true) { notify('Pagamentos confirmados não podem ser reabertos.', 'error'); return false; }
      const valid = (rows || []).filter(row => row?.record?.id && !supplierRowConfirmed(row.record,row.payment));
      if (!valid.length || saving) return false;
      const previous = data;
      const recordIds = valid.map(row => row.record.id);
      const ids = new Set(recordIds);
      const now = new Date().toISOString();
      setData(current => ({ ...current, records:current.records.map(item => ids.has(item.id) ? { ...item, pagamento_confirmado:confirmed, pagamento_confirmado_em:confirmed ? now : null } : item) }));
      setSaving(true);
      try {
        if (!DEMO_MODE) {
          // Caminho rápido: uma única chamada de rede para todo o lote.
          const { data:bulkData, error:bulkError } = await client.rpc('confirmar_pagamentos_lote_v1', {
            p_registro_ids:recordIds,
            p_confirmado:confirmed
          });

          if (bulkError) {
            const details = [bulkError.message, bulkError.details, bulkError.hint, bulkError.code].filter(Boolean).join(' · ');
            const missingBulkRpc = /confirmar_pagamentos_lote_v1|PGRST202|schema cache|could not find the function/i.test(details);
            if (missingBulkRpc) throw new Error('A confirmação em lote segura ainda não está instalada. Instale confirmar_pagamentos_lote_v1; nenhum pagamento foi alterado.');
            throw new Error(details || 'O Supabase recusou a confirmação em lote.');
          } else if (bulkData && Number(bulkData.total || bulkData.count || valid.length) < valid.length) {
            throw new Error('O banco confirmou menos linhas do que o solicitado.');
          }
        }
        notify(`${valid.length} pagamento(s) ${confirmed ? 'confirmado(s)' : 'reaberto(s)'} de uma vez.`);
        return true;
      } catch (error) {
        reloadSeqRef.current += 1; setData(previous);
        notify(error.message || 'Não foi possível atualizar os pagamentos selecionados.', 'error');
        return false;
      } finally { setSaving(false); }
    }

    async function quickBulkNF(rows, documentNumber) {
      if (!canEditPayments) { notify('Somente Marcos e Edilson podem alterar a Planilha de Acompanhamentos.', 'error'); return false; }
      const doc = String(documentNumber || '').trim();
      const valid = (rows || []).filter(row => row?.record?.id && !supplierRowConfirmed(row.record,row.payment));
      if (!valid.length || !doc || saving) return false;
      setSaving(true);
      try {
        for (const row of valid) {
          await rpcRecord(row.record, { numero_documento:doc });
          if (row.payment) await rpcPayment(row.payment, row.record.id, { numero_documento:doc, forma_pagamento:officialMethod(doc) });
        }
        notify(`NF/documento aplicado em ${valid.length} linha(s).`);
        return true;
      } catch (error) {
        notify(error.message || 'Não foi possível alterar o documento em lote.', 'error');
        return false;
      } finally { setSaving(false); }
    }

    async function quickBulkArchive(records) {
      if (!canEditPayments) { notify('Somente Marcos e Edilson podem alterar a Planilha de Acompanhamentos.', 'error'); return false; }
      const valid = (records || []).filter(record => record?.id && !supplierRowConfirmed(record, supplierRowPayment(data.payments,record,Number(record.ano_referencia),sourceMonthIndex(record))));
      if (!valid.length || saving) return false;
      setSaving(true);
      try {
        for (const record of valid) await rpcRecord(record, { status:'cancelado' });
        notify(`${valid.length} linha(s) arquivada(s).`, 'info');
        return true;
      } catch (error) {
        notify(error.message || 'Não foi possível arquivar as linhas selecionadas.', 'error');
        return false;
      } finally { setSaving(false); }
    }

    async function quickUpdateSupplierRow(record, payment, field, rawValue) {
      if (!canEditPayments) { notify('Somente Marcos e Edilson podem alterar a Planilha de Acompanhamentos.', 'error'); return false; }
      if (supplierRowConfirmed(record, payment)) { notify('Esta linha já foi confirmada por Marcos e está bloqueada.', 'info'); return false; }
      const monthIndex = sourceMonthIndex(record);
      if (field === 'campanha') {
        const reference = String(rawValue || '').trim() || 'COTA';
        const supplier = record.fornecedor || 'Fornecedor';
        return quickUpdateRecord(record, { referencia:reference, titulo:`${reference} — ${supplier} — ${OFFICIAL_MONTHS[monthIndex][1]} ${record.ano_referencia}` });
      }
      if (field === 'fornecedor') {
        const supplier = officialSupplierName(rawValue || '');
        return runQuick(async () => {
          await rpcRecord(record, { fornecedor:supplier, titulo:`${record.referencia || 'COTA'} — ${supplier} — ${OFFICIAL_MONTHS[monthIndex][1]} ${record.ano_referencia}` });
          if (payment) await rpcPayment(payment, record.id, { favorecido:supplier });
        }, 'Fornecedor atualizado.');
      }
      if (field === 'valor' || field === 'verba') {
        const value = Math.max(0, Number(rawValue) || 0);
        return runQuick(async () => {
          await rpcRecord(record, { valor_acordado:value });
          if (payment) await rpcPayment(payment, record.id, { valor_previsto:value, valor_pago:payment.status === 'pago' ? value : Number(payment.valor_pago || 0) });
        }, 'Valor atualizado.');
      }
      if (field === 'nf') {
        const doc = String(rawValue || '').trim();
        return runQuick(async () => {
          await rpcRecord(record, { numero_documento:doc });
          if (payment) await rpcPayment(payment, record.id, { numero_documento:doc, forma_pagamento:officialMethod(doc) });
        }, 'Documento atualizado.');
      }
      return false;
    }

    async function quickUpdateSpecificValue(record, detailRecord, detailPayment, rawValue) {
      const value = Math.max(0, Number(rawValue) || 0);
      const monthIndex = sourceMonthIndex(record); const yearValue = Number(record.ano_referencia || 2026);
      if (detailRecord) {
        return runQuick(async () => {
          await rpcRecord(detailRecord, { valor_acordado:value });
          if (detailPayment) await rpcPayment(detailPayment, detailRecord.id, { valor_previsto:value, valor_pago:detailPayment.status === 'pago' ? value : Number(detailPayment.valor_pago || 0) });
        }, 'Valor específico atualizado.');
      }
      if (value <= 0) return true;
      const center = costCenterFromCampaign(record.referencia || 'COTA'); const outsideVerba = /mtrix|emitrix/.test(normalize(record.referencia || ''));
      return runQuick(async () => {
        const newRecord = buildRecordPayload({
          controle:'marketing', ano_referencia:yearValue, fornecedor:record.fornecedor || '', natureza:'despesa', impacta_totais:outsideVerba,
          categoria:record.categoria || 'cota_anual', titulo:`Centro de custo — ${center} — ${record.fornecedor || 'Fornecedor'} — ${OFFICIAL_MONTHS[monthIndex][1]} ${yearValue}`,
          descricao:outsideVerba ? 'Investimento adicional fora da verba.' : 'Valor específico já contido na verba recebida.', referencia:record.referencia || 'COTA',
          status:'concluido', prioridade:'normal', data_inicio:officialMonthStart(yearValue, monthIndex), data_fim:officialMonthEnd(yearValue, monthIndex),
          valor_acordado:value, centro_custo:center, numero_documento:record.numero_documento || '',
          tags:['marketing','centro-custo',String(yearValue),OFFICIAL_MONTHS[monthIndex][1].toLocaleLowerCase('pt-BR'),outsideVerba ? 'adicional-investimento' : 'dentro-verba'],
          origem_importacao:record.origem_importacao || '', linha_origem:record.linha_origem || null,
          fingerprint:fingerprint(['marketing','centro-custo',yearValue,sourceMonthKey(record),record.linha_origem || '',record.fornecedor || '',record.referencia || '',Date.now()]),
          dados_originais:{ arquivo:record.origem_importacao || '', aba:OFFICIAL_MONTHS[monthIndex][0], linha:record.linha_origem || null, verba_recebida:Number(record.valor_acordado || 0), valor_centro_custo:value, incluido_na_verba:!outsideVerba }
        });
        const id = await rpcRecord(null, newRecord);
        await rpcPayment(null, id, { parcela:1, descricao:`Centro de custo — ${OFFICIAL_MONTHS[monthIndex][1]} ${yearValue}`, valor_previsto:value, valor_pago:value,
          vencimento:officialMonthEnd(yearValue, monthIndex), pago_em:officialMonthEnd(yearValue, monthIndex), status:'pago', forma_pagamento:officialMethod(record.numero_documento || ''),
          favorecido:record.fornecedor || '', numero_documento:record.numero_documento || '', fingerprint:fingerprint([id,'centro-custo',monthIndex + 1]) });
      }, 'Valor específico adicionado.');
    }

    async function saveConference({ competencia, fornecedor, status = 'conferido', valor = 0, observacoes = '' }) {
      if (DEMO_MODE) {
        const key = normalize(fornecedor);
        setData(current => {
          const existing = (current.conferences || []).find(item => String(item.competencia || '').startsWith(String(competencia || '').slice(0, 7)) && normalize(item.fornecedor) === key);
          const next = {
            ...(existing || {}),
            id:existing?.id || `demo-conference-${Date.now()}`,
            competencia:String(competencia || '').slice(0, 7) + '-01',
            fornecedor, fornecedor_chave:key, status, valor_snapshot:Number(valor) || 0, observacoes,
            conferido_em:status === 'conferido' ? new Date().toISOString() : null
          };
          return { ...current, conferences:existing ? current.conferences.map(item => item.id === existing.id ? next : item) : [...(current.conferences || []), next] };
        });
        notify(status === 'conferido' ? 'Conferência assinada no modo demonstração.' : 'Conferência reaberta no modo demonstração.', 'info');
        return true;
      }
      if (data.conferencesSetupMissing) { notify('Execute o SQL 11 — Gestão MKT V1.3.0 no Supabase para liberar as conferências.', 'error'); return false; }
      setSaving(true);
      try {
        const { error:conferenceError } = await client.rpc('salvar_conferencia_acompanhamento_v1', {
          p_competencia:competencia, p_fornecedor:fornecedor, p_status:status, p_valor_snapshot:Number(valor) || 0, p_observacoes:observacoes || ''
        });
        if (conferenceError) throw conferenceError;
        await reload(true);
        notify(status === 'conferido' ? 'Conferência assinada.' : 'Divergência registrada.', status === 'conferido' ? 'success' : 'info');
        return true;
      } catch (conferenceError) { notify(conferenceError.message || 'Não foi possível salvar a conferência.', 'error'); return false; }
      finally { setSaving(false); }
    }

    if (loading) return html`<${BootScreen}/>`;
    if (setupMissing && !DEMO_MODE) return html`<div className="setup-screen"><${SetupState}/></div>`;
    if (error && !setupMissing && !DEMO_MODE) return html`<${FatalState} error=${error}/>`;

    return html`
      <div className=${`ac-app ${['pagamentos','planejamento','receita'].includes(view) ? 'sheet-mode' : ''}`}>
        <div className="ambient ambient-one"></div><div className="ambient ambient-two"></div>
        <${Sidebar} view=${view} setView=${setView} open=${mobileNav} setOpen=${setMobileNav} me=${me} records=${data.records} documentItems=${data.documentItems} documentPendingCount=${data.documentPendingCount}/>
        <div className="ac-main">
          <${Topbar} view=${view} search=${search} setSearch=${setSearch} setMobileNav=${setMobileNav} me=${me} context=${context} openCommand=${() => setCommandOpen(true)}/>
          <main className="ac-content">
            ${setupMissing ? html`<${SetupState}/>` : html`
              <div className="view-stage" key=${view}>
                ${view === 'dashboard' && html`<${OverviewDashboard} context=${context}/>`}
                ${view === 'pagamentos' && html`<${PaymentsView} context=${context}/>`}
                ${view === 'planejamento' && html`<${PlanningView} context=${context}/>`}
                ${view === 'receita' && html`<${RevenueView} context=${context}/>`}
                ${view === 'importar' && html`<${ImportErrorBoundary} onBack=${() => setView('dashboard')}><${ImportView} context=${context} defaultControl="marketing" defaultYear=${year}/></${ImportErrorBoundary}>`}
                ${view === 'documentos' && documentAssetsState === 'ready' && window.PMGDocumentModule?.DocumentInbox && html`<${DocumentErrorBoundary} onBack=${() => setView('dashboard')}><${window.PMGDocumentModule.DocumentInbox} context=${context}/></${DocumentErrorBoundary}>`}
                ${view === 'documentos' && documentAssetsState === 'loading' && html`<${MiniEmpty} icon="scan-line" title="Carregando a Caixa de Documentos" text="OCR, PDF e anexos são carregados só quando você entra aqui. A Central abre mais leve nas outras abas."/>`}
                ${view === 'documentos' && documentAssetsState === 'error' && html`<${MiniEmpty} icon="triangle-alert" title="Módulo de documentos indisponível" text="Não foi possível carregar os recursos de leitura. Recarregue a página e tente novamente."/>`}
              </div>`}
          </main>
        </div>
        ${recordModal && html`<${RecordModal} record=${recordModal} collaborators=${data.collaborators} onClose=${() => setRecordModal(null)} onSave=${saveRecord} saving=${saving}/>`}
        ${paymentModal && html`<${PaymentModal} payment=${paymentModal} records=${data.records} onClose=${() => setPaymentModal(null)} onSave=${savePayment} saving=${saving}/>`}
        ${supplierRowModal && html`<${SupplierRowModal} defaults=${supplierRowModal} records=${data.records} onClose=${() => setSupplierRowModal(null)} onSave=${saveSupplierRow} saving=${saving}/>`}
        ${forecastGroup && html`<${ForecastGroupModal} group=${forecastGroup} context=${context} onClose=${() => setForecastGroup(null)}/>`}
        ${selected && html`<${RecordDrawer} record=${selected} context=${context} onClose=${() => setSelectedId(null)}/>`}
        ${supplierSelected && html`<${SupplierDrawer} supplier=${supplierSelected} context=${context} onClose=${() => setSupplierSelected(null)}/>`}
        ${commandOpen && html`<${CommandPalette} context=${context} onClose=${() => setCommandOpen(false)}/>`}
        ${integrityOpen && html`<${IntegrityModal} report=${integrity} onClose=${() => setIntegrityOpen(false)}/>`}
        ${toast && html`<${Toast} toast=${toast}/>`}
      </div>`;
  }

  function BootScreen() {
    useLucide([]);
    return html`<div className="boot-screen"><div className="boot-mark"><img src="/imagenssite/pmglogo.png" alt="PMG"/><span></span><span></span><span></span></div><strong>Carregando a Central...</strong><small>Isso deve levar apenas alguns segundos.</small></div>`;
  }

  function FatalState({ error }) {
    useLucide([]);
    return html`<div className="fatal-screen"><div className="fatal-card"><span className="fatal-icon"><${Icon} name="shield-alert" size=${34}/></span><p className="eyebrow">PMG Connect</p><h1>Não foi possível abrir a Central</h1><p>${error?.message || 'Falha de autenticação.'}</p><div className="fatal-actions"><a className="button primary" href="/central.html"><${Icon} name="arrow-left"/>Voltar ao início</a><button className="button secondary" onClick=${() => location.reload()}><${Icon} name="refresh-cw"/>Tentar novamente</button></div></div></div>`;
  }

  function SetupState() {
    useLucide([]);
    return html`<section className="setup-state"><div className="setup-orbit"><span></span><span></span><i><${Icon} name="database-zap" size=${32}/></i></div><div><p className="eyebrow">Uma etapa para ativar</p><h2>A interface está pronta. Falta criar a estrutura no banco.</h2><p>Execute <code>sql/06-CENTRAL-ACOMPANHAMENTO.sql</code> no SQL Editor do Supabase. Depois, carregue os dados pelos arquivos numerados da pasta <code>sql/carga-acompanhamento-sql-editor</code>. A carga integral foi dividida para respeitar o limite do editor.</p><div className="setup-steps"><span><b>1</b>Executar o SQL 06</span><span><b>2</b>Carregar os lotes 07</span><span><b>3</b>Atualizar esta página</span></div><button className="button primary" onClick=${() => location.reload()}><${Icon} name="refresh-cw"/>Já executei, verificar agora</button></div></section>`;
  }

  function Sidebar({ view, setView, open, setOpen, me, records, documentItems = [], documentPendingCount = 0 }) {
    const overdue = records.filter(record => record.situacao_financeira === 'atrasado').length;
    const pendingDocuments = documentItems.length ? documentItems.filter(item => item.status === 'aguardando_conferencia').length : Number(documentPendingCount || 0);
    const openCount = records.filter(record => !['concluido', 'cancelado'].includes(record.status)).length;
    const navigate = next => { setView(next); setOpen(false); window.scrollTo({ top:0, behavior:'smooth' }); };
    useLucide([view, open, records.length]);
    return html`
      <div className="sidebar-shell">
        <button className=${`nav-backdrop ${open ? 'visible' : ''}`} onClick=${() => setOpen(false)} aria-label="Fechar menu"></button>
        <aside className=${`ac-sidebar ${open ? 'open' : ''}`}>
          <div className="side-brand"><div className="side-logo"><img src="/imagenssite/pmglogo.png" alt="PMG"/></div><div><strong>PMG Connect</strong><span>Acompanhamento</span></div><button className="icon-button mobile-only" onClick=${() => setOpen(false)}><${Icon} name="x"/></button></div>
          <div className="side-spotlight"><span className="live-pulse"></span><div><small>Operação conectada</small><strong>${int(openCount)} acompanhamentos ativos</strong></div></div>
          <nav className="side-nav">
            <span className="side-label">Visão geral</span>
            ${['dashboard'].map(key => { const item = VIEWS[key]; return html`<button key=${key} className=${`side-link ${view === key ? 'active' : ''}`} onClick=${() => navigate(key)}><span><${Icon} name=${item.icon}/></span><b>${item.label}</b></button>`; })}
            <span className="side-label">Planilhas vivas</span>
            ${['pagamentos','planejamento','receita'].map(key => { const item = VIEWS[key]; return html`<button key=${key} className=${`side-link ${view === key ? 'active' : ''}`} onClick=${() => navigate(key)}><span><${Icon} name=${item.icon}/></span><b>${item.label}</b></button>`; })}
            <span className="side-label">Ferramentas</span>
            ${['importar','documentos'].map(key => { const item = VIEWS[key]; return html`<button key=${key} className=${`side-link ${view === key ? 'active' : ''}`} onClick=${() => navigate(key)}><span><${Icon} name=${item.icon}/></span><b>${item.label}</b>${key === 'documentos' && pendingDocuments > 0 ? html`<em>${pendingDocuments}</em>` : null}</button>`; })}
            <span className="side-label">PMG Connect</span>
            <a className="side-link" href="/central.html"><span><${Icon} name="house"/></span><b>Início</b></a>
            <a className="side-link" href="/demandas.html"><span><${Icon} name="clipboard-check"/></span><b>Demandas</b></a>
            <a className="side-link" href="/campanhas.html"><span><${Icon} name="trophy"/></span><b>Campanhas</b></a>
          </nav>
          <div className="side-footer"><div className="side-avatar">${String(me?.nome || 'P').charAt(0)}</div><div><strong>${me?.nome || 'Conta PMG'}</strong><span>${me?.role === 'gestor' ? 'Gestor' : 'Marketing'}</span></div><button className="icon-button" data-pmg-logout title="Sair"><${Icon} name="log-out"/></button></div>
        </aside>
      </div>`;
  }

  function Topbar({ view, search, setSearch, setMobileNav, me, context, openCommand }) {
    const meta = VIEWS[view]; const searchable = ['pagamentos','receita'].includes(view); const documentView = view === 'documentos'; const importView = view === 'importar';
    const [exporting,setExporting] = useState(false);
    const handleExport = async () => {
      if (exporting) return;
      setExporting(true);
      try {
        const result = await exportMktgWorkbook(context);
        context.notify(`Planilha exportada: ${result.filename}`);
      } catch (exportError) {
        console.error('[PMG Exportação] Falha ao gerar MKTG 2026:',exportError);
        context.notify(exportError.message || 'Não foi possível exportar a planilha.','error');
      } finally { setExporting(false); }
    };
    useLucide([view,context.integrity?.status,exporting]);
    return html`<header className="ac-topbar"><div className="topbar-title"><button className="icon-button mobile-only" onClick=${() => setMobileNav(true)}><${Icon} name="menu"/></button><span className="topbar-view-icon"><${Icon} name=${meta.icon}/></span><div><span>${meta.eyebrow}</span><h1>${meta.label}</h1></div></div><div className="topbar-actions"><button className="command-trigger" onClick=${openCommand}><${Icon} name="search"/><span><b>Busca rápida</b><small>Fornecedor, NF, pendentes...</small></span><kbd>Ctrl K</kbd></button>${searchable && html`<label className="global-search compact-search"><${Icon} name="search"/><input value=${search} onInput=${event => setSearch(event.target.value)} placeholder=${view === 'receita' ? 'Filtrar fornecedor...' : 'Filtrar pagamento...'}/></label>`}<button className=${`integrity-badge ${context.integrity?.status || 'ok'}`} onClick=${context.openIntegrity} title="Verificar conciliação entre Pagamentos, Receita e Planejamento"><${Icon} name=${context.integrity?.status === 'critical' ? 'shield-alert' : context.integrity?.status === 'warning' ? 'shield-check' : 'badge-check'}/><span>${context.integrity?.status === 'ok' ? 'Dados conciliados' : `${Number(context.integrity?.critical||0)+Number(context.integrity?.warning||0)} alerta(s)`}</span></button>${!importView && html`<button className="button secondary topbar-import" onClick=${() => context.setView('importar')} title="Importar Fornecedores ou MKTG e sincronizar a Central"><${Icon} name="file-up"/><span>Importar Excel</span></button>`}<button className="button secondary topbar-export" disabled=${exporting} onClick=${handleExport} title="Exportar Receita, Planejamento e Pendências no modelo MKTG 2026"><${Icon} name=${exporting ? 'loader-circle' : 'file-down'}/><span>${exporting ? 'Gerando...' : 'Exportar Excel'}</span></button>${documentView && html`<button className="button primary topbar-create" onClick=${() => window.dispatchEvent(new CustomEvent('pmg:document-upload'))}><${Icon} name="file-up"/>Enviar PDF</button>`}<div className="topbar-avatar" title=${me?.nome || ''}>${String(me?.nome || 'P').charAt(0)}</div></div></header>`;
  }

  function CommandPalette({ context, onClose }) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const input = useRef(null);
    const needle = normalize(query);
    const monthIndex = monthIndexFromText(query);
    const wantsPending = /\b(pendente|pendentes|aberto|abertos|a receber)\b/.test(needle);
    const wantsConfirmed = /\b(confirmado|confirmados|pago|pagos)\b/.test(needle);
    const nfNeedle = needle.match(/\bnf\s+(.+)/)?.[1] || '';

    const recordMap = useMemo(() => Object.fromEntries(context.allRecords.map(item => [item.id,item])), [context.allRecords]);
    const supplierNames = useMemo(() => uniq(context.allRecords.map(item => officialSupplierName(item.fornecedor)).filter(Boolean)).sort(supplierCompare), [context.allRecords]);
    const supplierHits = needle ? supplierNames.filter(name => normalize(name).includes(needle.replace(/^fornecedor\s+/,''))).slice(0,4) : [];
    const nfRecords = nfNeedle ? uniq(context.payments.filter(payment => normalize(payment.numero_documento).includes(nfNeedle)).map(payment => payment.registro_id)).map(id => recordMap[id]).filter(Boolean).slice(0,5) : [];
    const recordResults = needle ? context.allRecords.filter(record => normalize([record.codigo,record.fornecedor,record.titulo,record.referencia,record.numero_documento,...(record.tags||[])].join(' ')).includes(needle)).slice(0,7) : [];

    const smart = [];
    if (monthIndex >= 0) smart.push({ type:'smart', icon:wantsPending ? 'circle-dollar-sign' : 'calendar-range', label:`${wantsPending ? 'Pendentes de' : 'Abrir'} ${OFFICIAL_MONTHS[monthIndex][1]}`, detail:wantsPending ? 'Planilha já filtrada somente no que falta confirmar' : 'Ir direto para a competência', action:() => context.navigatePayments({ year:2026, month:monthIndex, pending:wantsPending }) });
    if (/acima da previsao|superou a previsao|mais que previsto/.test(needle)) smart.push({ type:'smart', icon:'trending-up', label:'Fornecedores acima da previsão', detail:'Abrir Receita anual para comparar previsto x realizado', action:() => context.navigateRevenue({above:true}) });
    if (/abaixo da previsao|falta receber|menos que previsto/.test(needle)) smart.push({ type:'smart', icon:'trending-down', label:'Fornecedores abaixo da previsão', detail:'Abrir Receita anual e localizar diferenças', action:() => context.navigateRevenue({below:true}) });
    if (wantsConfirmed && monthIndex >= 0) smart.push({ type:'smart', icon:'badge-check', label:`Confirmados de ${OFFICIAL_MONTHS[monthIndex][1]}`, detail:'Abrir a competência completa', action:() => context.navigatePayments({ year:2026, month:monthIndex, pending:false }) });

    const supplierResults = supplierHits.map(name => ({ type:'supplier', icon:'building-2', label:name, detail:'Abrir painel completo do fornecedor', action:() => context.openSupplier(name) }));
    const nfResults = nfRecords.map(record => ({ type:'record', icon:'receipt-text', label:record.fornecedor || record.titulo, detail:`NF · ${record.numero_documento || 'documento localizado'}`, value:record.valor_acordado, action:() => context.openRecord(record) }));
    const genericResults = recordResults.map(record => ({ type:'record', icon:category(record.categoria).icon, label:record.fornecedor || record.titulo, detail:`#${record.codigo || '—'} · ${record.titulo}`, value:record.valor_acordado, action:() => context.openRecord(record) }));
    const dedupe = new Set();
    const queryItems = [...smart,...supplierResults,...nfResults,...genericResults].filter(item => { const key=`${item.type}|${item.label}|${item.detail}`; if (dedupe.has(key)) return false; dedupe.add(key); return true; }).slice(0,10);

    const commands = [
      { label:'Dashboard', detail:'Resumo executivo e pontos de atenção', icon:'layout-dashboard', action:() => context.setView('dashboard') },
      { label:'Planilha de pagamentos', detail:'Abrir mês, editar e confirmar', icon:'table-2', action:() => context.setView('pagamentos') },
      { label:'Planejamento PMG', detail:'Matriz oficial mês a mês', icon:'target', action:() => context.setView('planejamento') },
      { label:'Receita anual', detail:'Previsão x confirmado por fornecedor', icon:'landmark', action:() => context.setView('receita') },
      { label:'Importar planilha', detail:'Fornecedores ou MKTG → sincronizar tudo', icon:'file-up', action:() => context.setView('importar') },
    ];
    const items = needle ? queryItems : commands.map(item => ({ ...item, type:'command' }));

    useEffect(() => { input.current?.focus(); document.body.classList.add('command-open'); return () => document.body.classList.remove('command-open'); }, []);
    useEffect(() => setActiveIndex(0), [query]);
    useLucide([query, items.length]);
    const run = action => { action?.(); onClose(); };
    const handleKeys = event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(current => items.length ? (current + 1) % items.length : 0); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(current => items.length ? (current - 1 + items.length) % items.length : 0); }
      if (event.key === 'Enter' && items[activeIndex]) { event.preventDefault(); run(items[activeIndex].action); }
    };
    return html`<div className="command-overlay" onMouseDown=${event => event.target === event.currentTarget && onClose()}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Busca inteligente"><div className="command-input"><span><${Icon} name="sparkles"/></span><input ref=${input} value=${query} onInput=${event => setQuery(event.target.value)} onKeyDown=${handleKeys} placeholder="Ex.: pendentes julho, NF 12846, Doceiro..."/><kbd>ESC</kbd></div><div className="command-body"><div className="command-group"><span className="command-label">${needle ? 'Resultados inteligentes' : 'Ações rápidas'}</span>${items.length ? items.map((item,index) => html`<button className=${index === activeIndex ? 'active' : ''} onMouseEnter=${() => setActiveIndex(index)} onClick=${() => run(item.action)}><span className=${`command-result-icon ${item.type}`}><${Icon} name=${item.icon || 'arrow-up-right'}/></span><div><strong>${item.label}</strong><small>${item.detail}</small></div>${item.value != null ? html`<em>${money(item.value)}</em>` : html`<span></span>`}<${Icon} name="chevron-right"/></button>`) : html`<div className="command-empty"><${Icon} name="search-x"/><span>Nada encontrado. Tente fornecedor, NF, mês ou “pendentes julho”.</span></div>`}</div></div><footer><span><b>↑↓</b> navegar</span><span><b>Enter</b> abrir</span><span>Busca por contexto, não só texto</span></footer></section></div>`;
  }

  function FilterBand({ control, setControl, year, setYear, years, count }) {
    useLucide([control, year]);
    return html`<div className="filter-band"><div className="segmented" role="group" aria-label="Controle"><button className=${control === 'todos' ? 'active' : ''} onClick=${() => setControl('todos')}>Consolidado</button><button className=${control === 'marcos' ? 'active' : ''} onClick=${() => setControl('marcos')}><span className="control-dot marcos"></span>Planejamento / Receita</button><button className=${control === 'marketing' ? 'active' : ''} onClick=${() => setControl('marketing')}><span className="control-dot marketing"></span>Pagamentos / Fornecedores</button></div><div className="filter-right"><span className="result-count"><b>${int(count)}</b> registros na visão</span><label className="year-select"><${Icon} name="calendar-range"/><select value=${year} onChange=${event => setYear(event.target.value)}><option value="todos">Todos os anos</option>${years.map(item => html`<option key=${item} value=${item}>${item}</option>`)}</select></label></div></div>`;
  }

  function Toast({ toast }) {
    useLucide([toast.id]);
    return html`<div className=${`ac-toast ${toast.tone}`}><span><${Icon} name=${toast.tone === 'error' ? 'circle-alert' : toast.tone === 'info' ? 'info' : 'circle-check'} /></span><p>${toast.message}</p></div>`;
  }


  function IntegrityModal({ report, onClose }) {
    const issues = report?.issues || [];
    useLucide([report?.status, issues.length]);
    return html`<${ModalShell} title="Integridade dos dados" eyebrow="Pagamentos · Receita · Planejamento" icon=${report?.status === 'critical' ? 'shield-alert' : 'shield-check'} onClose=${onClose}><div className="integrity-modal"><div className=${`integrity-summary ${report?.status || 'ok'}`}><span><${Icon} name=${report?.status === 'ok' ? 'badge-check' : 'triangle-alert'}/></span><div><strong>${report?.status === 'ok' ? 'Dados conciliados' : report?.status === 'critical' ? 'Há divergência que exige conferência' : 'Dados utilizáveis, com pontos de atenção'}</strong><p>${report?.status === 'ok' ? 'Pagamentos e Receita estão equivalentes e não há alerta estrutural ativo.' : `${report?.critical || 0} crítico(s) · ${report?.warning || 0} atenção(ões)`}</p></div></div>${issues.length ? html`<div className="integrity-issues">${issues.map(item => html`<article className=${item.severity}><span><${Icon} name=${item.severity === 'critical' ? 'circle-alert' : item.severity === 'warning' ? 'triangle-alert' : 'info'}/></span><div><strong>${item.title}</strong><p>${item.detail}</p></div></article>`)}</div>` : html`<div className="integrity-clean"><${Icon} name="circle-check-big"/><span>Nenhuma divergência detectada nesta verificação.</span></div>`}<div className="integrity-note"><${Icon} name="refresh-cw"/><span>A verificação é recalculada automaticamente quando um pagamento, previsão ou item do planejamento muda.</span></div></div></${ModalShell}>`;
  }

  function MetricCard({ label, value, format = 'money', icon, tone, hint, pulse = false }) {
    const animated = useAnimatedNumber(value);
    const display = format === 'money' ? compactMoney(animated) : format === 'integer' ? int(Math.round(animated)) : `${Math.round(animated)}%`;
    useLucide([value]);
    return html`<article className=${`metric-card ${tone || ''} ${pulse ? 'pulse-card' : ''}`}><div className="metric-card-head"><span className="metric-icon"><${Icon} name=${icon}/></span><span className="metric-trend">${hint}</span></div><strong>${display}</strong><p>${label}</p><div className="metric-sheen"></div></article>`;
  }

  function InsightTile({ icon, value, label, detail, tone = 'forest', action }) {
    useLucide([value, tone]);
    return html`<button className=${`insight-tile ${tone}`} onClick=${action}><span className="insight-icon"><${Icon} name=${icon}/></span><div><strong>${value}</strong><b>${label}</b><small>${detail}</small></div><span className="insight-arrow"><${Icon} name="arrow-up-right"/></span></button>`;
  }

  function EditableSheetCell({ value, type = 'text', onSave, placeholder = '—', className = '', title = 'Clique para editar', disabled = false }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saveState, setSaveState] = useState('idle');
    const inputRef = useRef(null); const timerRef = useRef(null);
    useEffect(() => () => clearTimeout(timerRef.current), []);
    useEffect(() => { if (editing) { setDraft(type === 'money' ? String(Number(value || 0)).replace('.', ',') : String(value ?? '')); requestAnimationFrame(() => inputRef.current?.select?.()); } }, [editing]);
    const commit = async () => {
      if (!editing) return;
      const parsed = type === 'money' ? parseMoney(draft) : String(draft || '').trim();
      const before = type === 'money' ? Number(value || 0) : String(value ?? '').trim();
      setEditing(false);
      if (String(parsed) === String(before)) return;
      setSaveState('saving');
      try {
        const ok = await onSave?.(parsed);
        if (ok === false) throw new Error('Falha ao salvar');
        setSaveState('saved'); clearTimeout(timerRef.current); timerRef.current=setTimeout(() => setSaveState('idle'), 1300);
      } catch (_) {
        setSaveState('error'); clearTimeout(timerRef.current); timerRef.current=setTimeout(() => setSaveState('idle'), 2200);
      }
    };
    if (editing) return html`<span className=${`sheet-editing ${className}`}><input ref=${inputRef} inputMode=${type === 'money' ? 'decimal' : undefined} value=${draft} onInput=${event => setDraft(event.target.value)} onBlur=${commit} onKeyDown=${event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setEditing(false); setDraft(String(value ?? '')); } }} /></span>`;
    const display = type === 'money' ? (Number(value || 0) ? money(value) : 'R$ -') : (String(value ?? '').trim() || placeholder);
    const stateIcon = saveState === 'saving' ? 'loader-circle' : saveState === 'saved' ? 'check' : saveState === 'error' ? 'triangle-alert' : 'pencil';
    return html`<button type="button" className=${`sheet-cell-editable ${className} state-${saveState}`} onClick=${() => !disabled && setEditing(true)} title=${disabled ? '' : title} disabled=${disabled}><span>${display}</span>${!disabled && html`<span className="sheet-cell-state"><${Icon} name=${stateIcon}/><small>${saveState === 'saving' ? 'Salvando' : saveState === 'saved' ? 'Salvo' : saveState === 'error' ? 'Erro' : ''}</small></span>`}</button>`;
  }

  function SpreadsheetTitle({ kicker, title, subtitle, actions }) {
    return html`<div className="sheet-titlebar"><div><span>${kicker}</span><h2>${title}</h2><p>${subtitle}</p></div><div className="sheet-title-actions">${actions}</div></div>`;
  }


  function EasySheetNavigator({ scrollRef, focusSelector = '', focusLabel = '' }) {
    const [state, setState] = useState({ overflow:false, progress:0, atStart:true, atEnd:true });
    const sync = useCallback(() => {
      const el = scrollRef?.current;
      if (!el) return;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const left = Math.max(0, el.scrollLeft);
      setState({
        overflow:max > 8,
        progress:max ? Math.round((left / max) * 100) : 0,
        atStart:left <= 4,
        atEnd:left >= max - 4,
      });
    }, [scrollRef]);

    useEffect(() => {
      const el = scrollRef?.current;
      if (!el) return undefined;
      sync();
      const onScroll = () => sync();
      el.addEventListener('scroll', onScroll, { passive:true });
      const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
      resize?.observe(el);
      window.addEventListener('resize', sync);
      return () => { el.removeEventListener('scroll', onScroll); resize?.disconnect(); window.removeEventListener('resize', sync); };
    }, [scrollRef, sync]);

    const move = direction => {
      const el = scrollRef?.current;
      if (!el) return;
      const step = Math.max(360, Math.round(el.clientWidth * .68));
      el.scrollBy({ left:direction * step, behavior:'smooth' });
    };
    const go = where => {
      const el = scrollRef?.current;
      if (!el) return;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      el.scrollTo({ left:where === 'end' ? max : 0, behavior:'smooth' });
    };
    const setProgress = event => {
      const el = scrollRef?.current;
      if (!el) return;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      el.scrollLeft = max * (Number(event.currentTarget.value) / 100);
    };
    const focus = () => {
      const el = scrollRef?.current;
      const target = focusSelector ? el?.querySelector(focusSelector) : null;
      if (!el || !target) return;
      const viewport = el.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const stickySpace = Math.min(360, Math.round(el.clientWidth * .26));
      el.scrollTo({ left:Math.max(0, el.scrollLeft + rect.left - viewport.left - stickySpace), behavior:'smooth' });
    };

    useLucide([state.overflow, state.progress, state.atStart, state.atEnd]);
    if (!state.overflow) return null;
    return html`<div className="easy-sheet-nav" role="group" aria-label="Controles para mover a tabela para os lados">
      <div className="easy-sheet-nav-copy"><span><${Icon} name="move-horizontal"/></span><div><strong>Navegar pelas colunas</strong><small>Use Voltar e Avançar. A barra também move a tabela.</small></div></div>
      <div className="easy-sheet-nav-controls">
        <button type="button" className="edge" onClick=${() => go('start')} disabled=${state.atStart} title="Voltar ao começo"><${Icon} name="chevrons-left"/><span>Início</span></button>
        <button type="button" className="step" onClick=${() => move(-1)} disabled=${state.atStart}><${Icon} name="chevron-left"/><span>Voltar</span></button>
        <label className="easy-sheet-slider"><span className="sr-only">Posição horizontal da tabela</span><input type="range" min="0" max="100" step="1" value=${state.progress} onInput=${setProgress} aria-label="Mover tabela horizontalmente"/><b>${state.progress}%</b></label>
        <button type="button" className="step" onClick=${() => move(1)} disabled=${state.atEnd}><span>Avançar</span><${Icon} name="chevron-right"/></button>
        ${focusSelector && html`<button type="button" className="focus" onClick=${focus}><${Icon} name=${focusLabel.toLowerCase().includes('mês') ? 'calendar-days' : 'sigma'}/><span>${focusLabel}</span></button>`}
        <button type="button" className="edge" onClick=${() => go('end')} disabled=${state.atEnd} title="Ir ao final"><span>Fim</span><${Icon} name="chevrons-right"/></button>
      </div>
    </div>`;
  }

  function OverviewDashboard({ context }) {
    const now = new Date();
    const year = context.allRecords.some(record => Number(record.ano_referencia) === 2026) ? 2026 : Math.max(...context.allRecords.map(record => Number(record.ano_referencia) || 0), now.getFullYear());
    const currentMonth = now.getFullYear() === year ? now.getMonth() : Math.max(0, ...context.allRecords.filter(record => Number(record.ano_referencia) === year).map(sourceMonthIndex));
    const monthInProgress = now.getFullYear() === year && currentMonth === now.getMonth();
    const lastClosedMonth = now.getFullYear() === year ? now.getMonth() - 1 : 11;
    const forecastRecords = context.allRecords.filter(record => Number(record.ano_referencia) === year && record.controle === 'marcos' && record.natureza === 'receita' && record.fornecedor && hasTag(record,'previsão') && hasTag(record,'fornecedor') && record.status !== 'cancelado');
    const forecastRevenueBase = sum(forecastRecords, record => record.valor_acordado);
    const indicators = context.allRecords.filter(record => Number(record.ano_referencia) === year && record.natureza === 'indicador');
    const indicator = tag => Number(indicators.find(record => hasTag(record,tag))?.valor_acordado || 0);
    const forecastRevenue = forecastRecords.length ? forecastRevenueBase : indicator('receita');
    const planningSnapshot = buildPlanningSnapshot(context.allRecords,context.payments,year);
    const forecastInvestment = planningSnapshot.planning.length ? planningSnapshot.grandTotal : indicator('investimento');
    const realizedInvestment = planningSnapshot.paidTotal;
    const forecastBalance = forecastRevenue - forecastInvestment;

    const officialRevenue = liveRevenueSnapshot(context.allRecords, context.payments, context.conferences, year);
    const supplierRecords = context.allRecords.filter(record => Number(record.ano_referencia) === year && isSupplierRevenueRecord(record));
    const stages = supplierRecords.map(record => {
      const monthIndex = sourceMonthIndex(record); const payment = supplierRowPayment(context.payments,record,year,monthIndex);
      const stage = supplierRevenueStage(payment,record,context.conferences,year,monthIndex); const expected=Number(record.valor_acordado||0);
      return { record,payment,monthIndex,stage,expected,value:stage==='confirmado'?supplierConfirmedValue(record,payment):0 };
    });
    const confirmedRows=stages.filter(item=>item.stage==='confirmado'); const openRows=stages.filter(item=>item.stage==='a_receber');
    const received=officialRevenue.hasData ? officialRevenue.total : sum(confirmedRows,item=>item.value);
    const toReceiveAmount=Math.max(0, forecastRevenue-received); const realizationPct=forecastRevenue?received/forecastRevenue*100:0;
    const realizedBalance=received-realizedInvestment; const planningPct=forecastInvestment?realizedInvestment/forecastInvestment*100:0;
    const currentRows=stages.filter(item=>item.monthIndex===currentMonth); const currentConfirmed=currentRows.filter(item=>item.stage==='confirmado');
    const currentConfirmedAmount=officialRevenue.hasData ? Number(officialRevenue.monthlyTotals[currentMonth] || 0) : sum(currentConfirmed,item=>item.value); const currentOpen=currentRows.filter(item=>item.stage==='a_receber');
    const pendingRecords=context.allRecords.filter(record=>Number(record.ano_referencia)===year&&record.categoria==='pendencia'&&!['concluido','cancelado'].includes(record.status));

    const confirmedBySupplier=new Map();
    if (officialRevenue.hasData) officialRevenue.bySupplier.forEach((source,key)=>confirmedBySupplier.set(key,{name:source.name,value:source.total}));
    else confirmedRows.forEach(({record,value})=>{ if(!record.fornecedor)return; const key=supplierKey(record.fornecedor); const row=confirmedBySupplier.get(key)||{name:record.fornecedor,value:0}; row.value+=value; confirmedBySupplier.set(key,row); });
    const forecastBySupplier=new Map(); forecastRecords.forEach(record=>{ const key=supplierKey(record.fornecedor); const row=forecastBySupplier.get(key)||{name:record.fornecedor,forecast:0}; row.forecast+=Number(record.valor_acordado||0); forecastBySupplier.set(key,row); });
    const performanceKeys=new Set([...forecastBySupplier.keys(),...confirmedBySupplier.keys()]);
    const supplierPerformance=[...performanceKeys].map(key=>{const forecastRow=forecastBySupplier.get(key)||{name:confirmedBySupplier.get(key)?.name||key,forecast:0};const confirmed=confirmedBySupplier.get(key)?.value||0;return {...forecastRow,confirmed,diff:confirmed-forecastRow.forecast};}).sort((a,b)=>a.diff-b.diff);
    const belowSuppliers=supplierPerformance.filter(item=>item.forecast>0&&item.diff<-.01); const aboveSuppliers=supplierPerformance.filter(item=>item.forecast>0&&item.diff>.01); const noForecastSuppliers=supplierPerformance.filter(item=>item.forecast<=0&&item.confirmed>.01);
    const topSuppliers=[...confirmedBySupplier.values()].sort((a,b)=>b.value-a.value).slice(0,5); const maxSupplier=topSuppliers[0]?.value||1;
    const monthly=OFFICIAL_MONTHS.map(([,label],index)=>{ const rows=stages.filter(item=>item.monthIndex===index); const amount=sum(rows,item=>item.expected); const localConfirmed=sum(rows.filter(item=>item.stage==='confirmado'),item=>item.value); const confirmed=officialRevenue.hasData ? Number(officialRevenue.monthlyTotals[index] || 0) : localConfirmed; const count=rows.length; const confirmedCount=rows.filter(item=>item.stage==='confirmado').length; const pct=amount?Math.min(100,confirmed/amount*100):0; const state=!count&&!confirmed?'empty':count&&confirmedCount===count?'complete':confirmed?'partial':'pending'; return {label,index,amount,confirmed,count,confirmedCount,pct,state,active:index===currentMonth}; });

    useLucide([context.allRecords.length,context.payments.length,currentMonth,pendingRecords.length,openRows.length,context.integrity?.status]);
    return html`<section className="overview-dashboard ux-dashboard-v2">
      <header className="executive-hero">
        <div className="executive-copy"><span className="overview-kicker"><i></i>Central de Acompanhamentos · ${year}</span><h2>Previsto, realizado e o que exige ação.</h2><p>Uma leitura rápida do ano com Pagamentos, Planejamento e Receita usando a mesma base.</p><div className="executive-actions"><button className="button primary" onClick=${() => context.navigatePayments({year,month:currentMonth})}><${Icon} name="table-2"/>Trabalhar ${OFFICIAL_MONTHS[currentMonth][1]}</button><button className="button secondary hero-secondary" onClick=${() => context.navigateRevenue()}><${Icon} name="landmark"/>Ver Receita anual</button></div></div>
        <div className="executive-flow"><div><small>Receita prevista</small><strong>${money(forecastRevenue)}</strong></div><span><${Icon} name="arrow-right"/></span><div className="confirmed"><small>Confirmada</small><strong>${money(received)}</strong><em>${Math.round(realizationPct)}%</em></div><span><${Icon} name="arrow-right"/></span><div className=${realizedBalance>=0?'positive':'remaining'}><small>Saldo realizado</small><strong>${money(realizedBalance)}</strong></div><i><b style=${{width:`${Math.min(100,Math.max(0,realizationPct))}%`}}></b></i></div>
      </header>

      <div className="executive-metrics executive-metrics-six">
        <button onClick=${() => context.navigateRevenue()}><span className="metric-glyph green"><${Icon} name="landmark"/></span><div><small>RECEITA PREVISTA</small><strong>${money(forecastRevenue)}</strong><p>Base anual de fornecedores</p></div><${Icon} name="arrow-up-right"/></button>
        <button onClick=${() => context.navigateRevenue()}><span className="metric-glyph dark"><${Icon} name="badge-check"/></span><div><small>RECEITA CONFIRMADA</small><strong>${money(received)}</strong><p>${Math.round(realizationPct)}% da previsão</p></div><${Icon} name="arrow-up-right"/></button>
        <button onClick=${() => context.setView('planejamento')}><span className="metric-glyph violet"><${Icon} name="target"/></span><div><small>INVESTIMENTO PREVISTO</small><strong>${money(forecastInvestment)}</strong><p>${planningSnapshot.planning.length} frentes</p></div><${Icon} name="arrow-up-right"/></button>
        <button onClick=${() => context.setView('planejamento')}><span className="metric-glyph amber"><${Icon} name="circle-dollar-sign"/></span><div><small>INVESTIMENTO PAGO</small><strong>${money(realizedInvestment)}</strong><p>${Math.round(planningPct)}% executado</p></div><${Icon} name="arrow-up-right"/></button>
        <button onClick=${() => context.navigateRevenue()}><span className="metric-glyph green"><${Icon} name="scale"/></span><div><small>SALDO PREVISTO</small><strong>${money(forecastBalance)}</strong><p>Receita prevista − investimento</p></div><${Icon} name="arrow-up-right"/></button>
        <button onClick=${() => context.navigateRevenue()}><span className="metric-glyph ${realizedBalance>=0?'green':'amber'}"><${Icon} name="wallet-cards"/></span><div><small>SALDO REALIZADO</small><strong>${money(realizedBalance)}</strong><p>Recebido − investimento pago</p></div><${Icon} name="arrow-up-right"/></button>
      </div>

      <div className="execution-strip">
        <button onClick=${() => context.navigateRevenue({below:true})}><small>A RECEBER VS. PREVISÃO</small><strong>${money(toReceiveAmount)}</strong><span>${belowSuppliers.length} fornecedor(es) abaixo</span></button>
        <div><small>EXECUÇÃO DA RECEITA</small><strong>${Math.round(realizationPct)}%</strong><i><b style=${{width:`${Math.min(100,Math.max(0,realizationPct))}%`}}></b></i></div>
        <div><small>EXECUÇÃO DO PLANEJAMENTO</small><strong>${Math.round(planningPct)}%</strong><i><b style=${{width:`${Math.min(100,Math.max(0,planningPct))}%`}}></b></i></div>
        <button className=${noForecastSuppliers.length?'warning':''} onClick=${() => context.navigateRevenue({withoutForecast:true})}><small>SEM PREVISÃO</small><strong>${noForecastSuppliers.length}</strong><span>receita sem meta cadastrada</span></button>
      </div>

      <div className="dashboard-grid-v2">
        <article className="overview-panel overview-evolution"><div className="overview-panel-head"><div><span>EVOLUÇÃO</span><h3>Receita confirmada por mês</h3><p>Comparação usa meses fechados; ${OFFICIAL_MONTHS[currentMonth][1]} está ${monthInProgress?'em andamento':'fechado'}.</p></div><button onClick=${() => context.navigateRevenue()}>Matriz anual <${Icon} name="arrow-up-right"/></button></div><${RevenueComparisonChart} context=${context}/></article>
        <article className="overview-panel attention-v2"><div className="overview-panel-head"><div><span>ATENÇÃO AGORA</span><h3>O que vale abrir primeiro</h3><p>Somente o que pede ação.</p></div></div>
          ${context.integrity?.status !== 'ok' && html`<button className=${context.integrity?.status==='critical'?'attention-item danger':'attention-item warning'} onClick=${context.openIntegrity}><span><${Icon} name="shield-alert"/></span><div><strong>Integridade dos dados precisa de atenção</strong><small>${context.integrity?.critical||0} crítico(s) · ${context.integrity?.warning||0} alerta(s)</small></div><${Icon} name="chevron-right"/></button>`}
          <button className=${currentOpen.length?'attention-item warning':'attention-item ok'} onClick=${() => context.navigatePayments({year,month:currentMonth,pending:true})}><span><${Icon} name=${currentOpen.length?'circle-dollar-sign':'circle-check'}/></span><div><strong>${currentOpen.length} pendente(s) em ${OFFICIAL_MONTHS[currentMonth][1]}${monthInProgress?' · em andamento':''}</strong><small>${currentOpen.length?`${money(sum(currentOpen,item=>item.expected))} aguardando confirmação`:'Competência em dia'}</small></div><${Icon} name="chevron-right"/></button>
          <button className=${pendingRecords.length?'attention-item danger':'attention-item ok'} onClick=${() => context.navigatePayments({year,month:currentMonth})}><span><${Icon} name=${pendingRecords.length?'triangle-alert':'circle-check'}/></span><div><strong>${pendingRecords.length} pendência(s) registradas</strong><small>${pendingRecords.length?'Observações abertas nas planilhas':'Nenhuma pendência aberta'}</small></div><${Icon} name="chevron-right"/></button>
          <button className=${belowSuppliers.length?'attention-item neutral':'attention-item ok'} onClick=${() => context.navigateRevenue({below:true})}><span><${Icon} name="trending-down"/></span><div><strong>${belowSuppliers.length} fornecedor(es) abaixo da previsão</strong><small>${aboveSuppliers.length} acima · ${noForecastSuppliers.length} sem previsão</small></div><${Icon} name="chevron-right"/></button>
        </article>

        <article className="overview-panel annual-timeline-panel"><div className="overview-panel-head"><div><span>COMPETÊNCIAS</span><h3>Janeiro → Dezembro</h3><p>${lastClosedMonth>=0?`Último mês fechado: ${OFFICIAL_MONTHS[lastClosedMonth][1]}.`:'Ainda não há mês fechado neste ano.'}</p></div></div><div className="annual-timeline">${monthly.map(item=>html`<button className=${`${item.state} ${item.active?'active':''}`} onClick=${() => context.navigatePayments({year,month:item.index})} title=${item.amount?`${money(item.confirmed)} confirmado de ${money(item.amount)}`:'Sem dados'}><span><b>${item.label.slice(0,3)}</b><em>${item.active&&monthInProgress?'Em andamento':item.state==='complete'?'Fechado':item.state==='partial'?'Parcial':item.state==='pending'?'Pendente':'—'}</em></span><strong>${item.amount?`${Math.round(item.pct)}%`:'—'}</strong><i><u style=${{width:`${item.pct}%`}}></u></i><small>${item.count?`${item.confirmedCount}/${item.count} linhas`:'sem dados'}</small></button>`)}</div></article>
        <article className="overview-panel overview-suppliers"><div className="overview-panel-head"><div><span>FORNECEDORES</span><h3>Maiores receitas confirmadas</h3><p>Clique em um parceiro para abrir os detalhes.</p></div></div><div className="top-supplier-list interactive">${topSuppliers.length?topSuppliers.map((item,index)=>html`<button onClick=${() => context.openSupplier(item.name)}><b>${String(index+1).padStart(2,'0')}</b><span><strong>${item.name}</strong><i><em style=${{width:`${item.value/maxSupplier*100}%`}}></em></i></span><small>${money(item.value)}</small><${Icon} name="chevron-right"/></button>`):html`<div className="overview-empty">Nenhuma receita confirmada ainda.</div>`}</div></article>
      </div>
    </section>`;
  }

  function PaymentsView({ context }) {
    const canEditPayments = context.canEditPayments === true;
    const canConfirmPayments = context.canConfirmPayments === true;
    const supplierRecords=useMemo(()=>context.allRecords.filter(record=>record.controle==='marketing'&&record.natureza==='receita'&&record.status!=='cancelado'&&record.categoria!=='pendencia'&&hasTag(record,'fornecedores')),[context.allRecords]);
    const yearOptions=useMemo(()=>uniq(supplierRecords.map(record=>Number(record.ano_referencia))).filter(Boolean).sort((a,b)=>b-a),[supplierRecords]);
    const defaultYear=yearOptions.includes(savedNumber('pmg_payment_year',2026))?savedNumber('pmg_payment_year',2026):(yearOptions.includes(2026)?2026:(yearOptions[0]||2026));
    const [sheetYear,setSheetYear]=useState(defaultYear);
    const [sheetMonth,setSheetMonth]=useState(Math.min(11,Math.max(0,savedNumber('pmg_payment_month',new Date().getMonth()))));
    const [onlyPending,setOnlyPending]=useState(localStorage.getItem('pmg_payment_pending')==='1');
    const [supplierDrill,setSupplierDrill]=useState(localStorage.getItem('pmg_payment_supplier')||'');
    const [compactMode,setCompactMode]=useState(()=>localStorage.getItem('pmg_sheet_density')==='compact');
    const [selectedRows,setSelectedRows]=useState(()=>new Set());
    const jumpRef=useRef(0);
    const availableMonths=useMemo(()=>supplierRecords.filter(record=>Number(record.ano_referencia)===Number(sheetYear)).map(sourceMonthIndex),[supplierRecords,sheetYear]);
    const toggleSelected=id=>setSelectedRows(current=>{const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next;});
    const clearSelected=()=>setSelectedRows(new Set());
    const toggleDensity=()=>setCompactMode(value=>{const next=!value;localStorage.setItem('pmg_sheet_density',next?'compact':'comfortable');return next;});

    useEffect(()=>{ localStorage.setItem('pmg_payment_year',String(sheetYear)); },[sheetYear]);
    useEffect(()=>{ localStorage.setItem('pmg_payment_month',String(sheetMonth)); clearSelected(); },[sheetMonth]);
    useEffect(()=>{ localStorage.setItem('pmg_payment_pending',onlyPending?'1':'0'); },[onlyPending]);
    useEffect(()=>{ supplierDrill?localStorage.setItem('pmg_payment_supplier',supplierDrill):localStorage.removeItem('pmg_payment_supplier'); },[supplierDrill]);
    useEffect(()=>{ const jump=context.paymentJump; if(!jump?.token||jump.token===jumpRef.current)return; jumpRef.current=jump.token; if(Number.isFinite(Number(jump.year)))setSheetYear(Number(jump.year)); if(Number.isFinite(Number(jump.month)))setSheetMonth(Math.max(0,Math.min(11,Number(jump.month)))); setOnlyPending(Boolean(jump.pending)); setSupplierDrill(jump.supplier||''); clearSelected(); },[context.paymentJump]);

    const monthSnapshots=useMemo(()=>OFFICIAL_MONTHS.map(([,label],index)=>{ const records=supplierRecords.filter(record=>Number(record.ano_referencia)===Number(sheetYear)&&sourceMonthIndex(record)===index); const total=sum(records,record=>record.valor_acordado); const confirmedRecords=records.filter(record=>supplierRowConfirmed(record,supplierRowPayment(context.payments,record,sheetYear,index))); const confirmed=sum(confirmedRecords,record=>supplierConfirmedValue(record,supplierRowPayment(context.payments,record,sheetYear,index))); const state=!records.length?'empty':confirmedRecords.length===records.length?'complete':confirmedRecords.length?'partial':'pending'; return {index,label,total,confirmed,count:records.length,confirmedCount:confirmedRecords.length,pct:total?Math.min(100,confirmed/total*100):0,state}; }),[supplierRecords,context.payments,sheetYear]);
    const currentKey=monthKey(sheetYear,sheetMonth); const needle=normalize(context.search);
    const allMonthRows=supplierRecords.filter(record=>Number(record.ano_referencia)===Number(sheetYear)&&sourceMonthIndex(record)===sheetMonth).map(record=>({record,payment:supplierRowPayment(context.payments,record,sheetYear,sheetMonth)})).sort((a,b)=>supplierCompare(a.record,b.record)||String(a.record.referencia||'').localeCompare(String(b.record.referencia||''),'pt-BR'));
    let rows=[...allMonthRows];
    if(needle)rows=rows.filter(row=>normalize([row.record.fornecedor,row.record.referencia,row.record.numero_documento,row.payment?.numero_documento,row.record.titulo].join(' ')).includes(needle));
    if(supplierDrill)rows=rows.filter(row=>supplierKey(row.record.fornecedor)===supplierKey(supplierDrill));
    if(onlyPending)rows=rows.filter(row=>!supplierRowConfirmed(row.record,row.payment));

    const monthTotal=sum(allMonthRows,row=>row.record.valor_acordado); const allConfirmedRows=allMonthRows.filter(row=>supplierRowConfirmed(row.record,row.payment)); const confirmedCount=allConfirmedRows.length; const confirmedAmount=sum(allConfirmedRows,row=>supplierConfirmedValue(row.record,row.payment)); const pendingAmount=Math.max(0,monthTotal-confirmedAmount);
    const visibleTotal=sum(rows,row=>row.record.valor_acordado); const visibleConfirmedRows=rows.filter(row=>supplierRowConfirmed(row.record,row.payment)); const visibleConfirmedAmount=sum(visibleConfirmedRows,row=>supplierConfirmedValue(row.record,row.payment)); const filteredView=Boolean(needle||supplierDrill||onlyPending);
    const pendingRecords=context.allRecords.filter(record=>Number(record.ano_referencia)===Number(sheetYear)&&record.categoria==='pendencia'&&record.status!=='cancelado'&&(!record.data_inicio||String(record.data_inicio).startsWith(currentKey)));
    const monthLabelLong=OFFICIAL_MONTHS[sheetMonth]?.[1]||'';
    const addRow=()=>{ if(!canEditPayments){context.notify('Somente Marcos e Edilson podem alterar a Planilha de Acompanhamentos.','error');return;} context.newSupplierRow({ ano_referencia:sheetYear, monthIndex:sheetMonth, categoria:'cota_anual' }); };
    const chosenRows=rows.filter(row=>selectedRows.has(row.record.id));
    const pendingVisibleRows=rows.filter(row=>!supplierRowConfirmed(row.record,row.payment));
    const pendingVisibleAmount=sum(pendingVisibleRows,row=>Number(row.record.valor_acordado||0));
    const confirmVisiblePending=async()=>{
      if(!pendingVisibleRows.length||context.saving)return;
      const scope=supplierDrill?` de ${supplierDrill}`:'';
      if(!confirm(`Confirmar ${pendingVisibleRows.length} pagamento(s)${scope} em ${monthLabelLong}?\n\nTotal: ${money(pendingVisibleAmount)}`))return;
      await context.quickBulkConfirm(pendingVisibleRows,true);
    };
    const setBulkNF=async()=>{ const value=prompt(`NF/documento para ${chosenRows.length} linha(s):`); if(value) { await context.quickBulkNF(chosenRows,value); clearSelected(); } };
    const archiveBulk=async()=>{ if(!confirm(`Arquivar ${chosenRows.length} linha(s) selecionada(s)?`))return; await context.quickBulkArchive(chosenRows.map(row=>row.record)); clearSelected(); };
    useLucide([sheetYear,sheetMonth,rows.length,onlyPending,context.saving,selectedRows.size,supplierDrill]);

    return html`<section className=${`spreadsheet-view payment-sheet-view ux-sheet-v2 ${compactMode?'density-compact':'density-comfortable'}`}>
      <${SpreadsheetTitle} kicker="Fonte oficial · Fornecedores" title=${`PLANILHA DE PAGAMENTO ${sheetYear}`} subtitle=${canConfirmPayments ? "Edite os pendentes e confirme. Após a confirmação, a linha fica bloqueada." : canEditPayments ? "Você pode editar lançamentos pendentes. A confirmação final é exclusiva do Marcos." : "Modo somente leitura. Edição: Marcos/Edilson. Confirmação: somente Marcos."} actions=${html`<label className="sheet-select"><span>Ano</span><select value=${sheetYear} onChange=${e=>setSheetYear(Number(e.target.value))}>${yearOptions.map(value=>html`<option value=${value}>${value}</option>`)}</select></label><button className=${`sheet-filter-button ${onlyPending?'active':''}`} onClick=${()=>setOnlyPending(value=>!value)}><${Icon} name="filter"/>${onlyPending?'Só pendentes':'Pendentes'}</button>${canConfirmPayments&&pendingVisibleRows.length>0&&html`<button className="confirm-pending-fast" disabled=${context.saving} onClick=${confirmVisiblePending} title=${`Confirmar ${pendingVisibleRows.length} pendente(s) visível(is)`}><${Icon} name="badge-check"/><span>Confirmar pendentes</span><b>${pendingVisibleRows.length}</b></button>`}<button className="sheet-density-toggle" onClick=${toggleDensity}><${Icon} name=${compactMode?'maximize-2':'minimize-2'}/>${compactMode?'Confortável':'Compacta'}</button>${canEditPayments&&html`<button className="button primary sheet-add" onClick=${addRow}><${Icon} name="plus"/>Nova linha</button>`}`}/>

      <div className="workbook-tabs annual-workbook-tabs" role="tablist">${monthSnapshots.map(item=>{const isNow=Number(sheetYear)===new Date().getFullYear()&&item.index===new Date().getMonth();return html`<button role="tab" aria-selected=${sheetMonth===item.index} className=${`${sheetMonth===item.index?'active':''} ${item.state} ${isNow?'is-now':''}`} onClick=${()=>setSheetMonth(item.index)}><span>${item.label}${isNow&&html`<em>Atual</em>`}</span><strong>${item.total?`${Math.round(item.pct)}%`:'—'}</strong><i><u style=${{width:`${item.pct}%`}}></u></i><small>${item.total?`${compactMoney(item.confirmed)} / ${compactMoney(item.total)}`:'sem dados'}</small></button>`;})}</div>

      <div className="sheet-command-row"><div className="sheet-stats compact-stats"><span className="stat-total"><small>Total do mês</small><strong>${money(monthTotal)}</strong></span><span className="stat-confirmed-value"><small>Confirmado</small><strong>${money(confirmedAmount)}</strong></span><span className="stat-pending-value"><small>Pendente</small><strong>${money(pendingAmount)}</strong></span><span className=${`stat-signed ${confirmedCount===allMonthRows.length&&allMonthRows.length?'ok':''}`}><small>Status</small><strong>${confirmedCount}/${allMonthRows.length}</strong></span></div><div className="active-sheet-filters">${filteredView&&html`<span className="filtered-sheet-summary"><${Icon} name="list-filter"/>Exibindo ${rows.length}/${allMonthRows.length} · ${money(visibleTotal)}${visibleConfirmedAmount?` · ${money(visibleConfirmedAmount)} confirmado`:''}</span>`}${supplierDrill&&html`<button onClick=${()=>setSupplierDrill('')}><${Icon} name="building-2"/>${supplierDrill}<${Icon} name="x"/></button>`}${onlyPending&&html`<button onClick=${()=>setOnlyPending(false)}><${Icon} name="filter"/>Só pendentes<${Icon} name="x"/></button>`}</div></div>

      <article className="spreadsheet-card payments-fullscreen-card"><div className="spreadsheet-scroll assisted-scroll"><table className="live-sheet payment-live-sheet"><thead><tr><th className="select-col"><input type="checkbox" aria-label="Selecionar linhas pendentes visíveis" disabled=${!canEditPayments} checked=${rows.filter(row=>!supplierRowConfirmed(row.record,row.payment)).length>0&&rows.filter(row=>!supplierRowConfirmed(row.record,row.payment)).every(row=>selectedRows.has(row.record.id))} onChange=${event=>setSelectedRows(event.target.checked?new Set(rows.filter(row=>!supplierRowConfirmed(row.record,row.payment)).map(row=>row.record.id)):new Set())}/></th><th>CAMPANHA</th><th>FORNECEDOR</th><th className="money-col">VALOR</th><th>DOCUMENTO</th><th>STATUS</th><th></th></tr></thead><tbody>
        ${rows.length?rows.map((row,index)=>{const isPaid=supplierRowConfirmed(row.record,row.payment);const sourcePaid=Boolean(row.record._oficial_confirmado);const rowLocked=isPaid||!canEditPayments;return html`<tr key=${row.record.id} className=${`${isPaid?'signed-row locked-row':''} ${selectedRows.has(row.record.id)?'selected-row':''}`} style=${{'--row-delay':`${Math.min(index,35)*12}ms`}}><td className="select-col"><input type="checkbox" disabled=${rowLocked} checked=${selectedRows.has(row.record.id)} onChange=${()=>toggleSelected(row.record.id)}/></td><td><${EditableSheetCell} disabled=${rowLocked} title=${isPaid?'Confirmado por Marcos · bloqueado':'Clique para editar'} value=${row.record.referencia||'COTA'} onSave=${value=>context.quickUpdateSupplierRow(row.record,row.payment,'campanha',value)}/></td><td className="supplier-sheet-cell"><div className="supplier-edit-wrap"><${EditableSheetCell} disabled=${rowLocked} title=${isPaid?'Confirmado por Marcos · bloqueado':'Clique para editar'} value=${row.record.fornecedor||''} onSave=${value=>context.quickUpdateSupplierRow(row.record,row.payment,'fornecedor',value)}/><button className="supplier-peek" title="Ver fornecedor" onClick=${()=>context.openSupplier(row.record.fornecedor)}><${Icon} name="panel-right-open"/></button></div></td><td className="money-col unified-value-cell"><${EditableSheetCell} disabled=${rowLocked} title=${isPaid?'Confirmado por Marcos · bloqueado':'Clique para editar'} type="money" value=${row.record.valor_acordado} onSave=${value=>context.quickUpdateSupplierRow(row.record,row.payment,'valor',value)}/></td><td><${EditableSheetCell} disabled=${rowLocked} title=${isPaid?'Confirmado por Marcos · bloqueado':'Clique para editar'} value=${row.payment?.numero_documento||row.record.numero_documento||''} onSave=${value=>context.quickUpdateSupplierRow(row.record,row.payment,'nf',value)}/></td><td><button disabled=${context.saving||isPaid||!canConfirmPayments} className=${`one-click-status status-simple ${isPaid?'paid':'open'} ${sourcePaid?'source-confirmed':''}`} onClick=${()=>context.quickTogglePaid(row.payment,row.record)} title=${isPaid?'Confirmado e bloqueado':canConfirmPayments?'Confirmar pagamento':'Somente Marcos pode confirmar'}><span className="status-dot">${isPaid?'🔒':'○'}</span><span>${sourcePaid?'Confirmado · fonte':isPaid?'Confirmado · bloqueado':'Pendente'}</span></button></td><td><button className="sheet-open-row" onClick=${()=>context.openRecord(row.record)} title="Mais detalhes"><${Icon} name="more-horizontal"/></button></td></tr>`;}) : html`<tr className="sheet-empty-row"><td colSpan="7"><div><${Icon} name="sheet"/><strong>Nenhuma linha em ${monthLabelLong} de ${sheetYear}</strong><p>${supplierDrill?'Retire o filtro do fornecedor ou escolha outro mês.':'Crie a primeira linha diretamente por aqui.'}</p>${canEditPayments&&html`<button className="button primary" onClick=${addRow}><${Icon} name="plus"/>Adicionar linha</button>`}</div></td></tr>`}
      </tbody><tfoot><tr><th></th><th colSpan="2">${filteredView ? 'TOTAL EXIBIDO' : 'TOTAL'}</th><th className="money-col">${money(filteredView ? visibleTotal : monthTotal)}</th><th></th><th>${filteredView ? visibleConfirmedRows.length : confirmedCount} confirmados</th><th></th></tr></tfoot></table></div></article>

      ${selectedRows.size>0&&html`<div className="sheet-selection-bar bulk-actions-v2"><div><strong>${selectedRows.size}</strong><span>${selectedRows.size===1?'linha selecionada':'linhas selecionadas'}</span></div>${canConfirmPayments&&html`<button onClick=${async()=>{const open=chosenRows.filter(row=>!supplierRowConfirmed(row.record,row.payment));await context.quickBulkConfirm(open,true);clearSelected();}} disabled=${context.saving}><${Icon} name="badge-check"/>Confirmar pendentes</button>`}${canEditPayments&&html`<button onClick=${setBulkNF} disabled=${context.saving}><${Icon} name="receipt-text"/>Definir NF</button>`}${canEditPayments&&html`<button className="bulk-archive" onClick=${archiveBulk} disabled=${context.saving}><${Icon} name="archive"/>Arquivar</button>`}<button className="selection-clear" onClick=${clearSelected}><${Icon} name="x"/>Limpar</button></div>`}

      <section className="sheet-pendencies"><div className="sheet-section-heading"><div><span>PENDÊNCIAS</span><h3>${monthLabelLong} ${sheetYear}</h3></div>${canEditPayments&&html`<button onClick=${()=>context.newSupplierRow({ano_referencia:sheetYear,monthIndex:sheetMonth,categoria:'pendencia',tipo_documento:'outro'})}><${Icon} name="plus"/>Adicionar pendência</button>`}</div><div className="pendency-sheet-list">${pendingRecords.length?pendingRecords.map(record=>html`<article className=${record.status==='concluido'?'resolved':''}><span className="pendency-mark"><${Icon} name=${record.status==='concluido'?'circle-check':'triangle-alert'}/></span><div><${EditableSheetCell} disabled=${!canEditPayments} value=${record.descricao||record.observacoes||record.titulo} onSave=${value=>context.quickUpdateRecord(record,{descricao:value,observacoes:value})}/><small>${record.fornecedor||'Pendência geral'}${record.valor_acordado?` · ${money(record.valor_acordado)}`:''}</small></div>${canEditPayments&&html`<button className="resolve-one-click" onClick=${()=>context.quickUpdateRecord(record,{status:record.status==='concluido'?'negociacao':'concluido'},record.status==='concluido'?'Pendência reaberta.':'Pendência resolvida.')}><${Icon} name="check"/>${record.status==='concluido'?'Reabrir':'Resolver'}</button>`}</article>`):html`<div className="pendency-empty"><${Icon} name="circle-check-big"/><span>Nenhuma pendência nesta competência.</span></div>`}</div></section>
    </section>`;
  }

  function CashflowChart({ payments, records }) {
    const canvas = useRef(null); const chartRef = useRef(null);
    useEffect(() => {
      if (!canvas.current || !window.Chart) return undefined;
      const allowedRecords = records.filter(item => item.impacta_totais !== false && item.natureza !== 'indicador');
      const allowed = new Set(allowedRecords.map(item => item.id));
      const recordMap = Object.fromEntries(allowedRecords.map(item => [item.id, item]));
      const visibleYears = uniq(allowedRecords.map(item => Number(item.ano_referencia))).filter(Boolean);
      const chartYear = visibleYears.length === 1 ? visibleYears[0] : new Date().getFullYear();
      const months = Array.from({ length:12 }, (_, index) => new Date(chartYear, index, 1));
      const key = value => value ? String(value).slice(0, 7) : '';
      const visible = payments.filter(item => allowed.has(item.registro_id));
      const controls = new Set(allowedRecords.map(item => item.controle));
      const monthKey = month => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const flow = (control, nature, dateField, paidOnly = false) => months.map(month => sum(visible.filter(item => {
        const record = recordMap[item.registro_id];
        return record?.controle === control && record?.natureza === nature && key(item[dateField]) === monthKey(month)
          && item.status !== 'cancelado' && (!paidOnly || item.status === 'pago');
      }), item => paidOnly ? (item.valor_pago || item.valor_previsto) : item.valor_previsto));
      const comparative = controls.has('marcos') && controls.has('marketing');
      const datasets = comparative ? [
        { label:'Marcos', data:flow('marcos', 'receita', 'pago_em', true), borderColor:'#7451a6', backgroundColor:'rgba(116,81,166,.05)', borderWidth:2, borderDash:[5,5], pointRadius:0, pointHoverRadius:5, tension:.4, fill:false },
        { label:'Marketing', data:flow('marketing', 'receita', 'pago_em', true), borderColor:'#2a7e4e', backgroundColor:null, borderWidth:3, pointRadius:0, pointHoverRadius:5, tension:.4, fill:true },
      ] : [
        { label:'Previsto', data:months.map(month => sum(visible.filter(item => key(item.vencimento) === monthKey(month) && item.status !== 'cancelado'), item => item.valor_previsto)), borderColor:'#d79a2b', backgroundColor:'rgba(215,154,43,.06)', borderWidth:2, borderDash:[5,5], pointRadius:0, pointHoverRadius:5, tension:.4, fill:false },
        { label:'Realizado', data:months.map(month => sum(visible.filter(item => key(item.pago_em) === monthKey(month) && item.status === 'pago'), item => item.valor_pago || item.valor_previsto)), borderColor:'#2a7e4e', backgroundColor:null, borderWidth:3, pointRadius:0, pointHoverRadius:5, tension:.4, fill:true },
      ];
      chartRef.current?.destroy();
      const gradient = canvas.current.getContext('2d').createLinearGradient(0, 0, 0, 260); gradient.addColorStop(0, 'rgba(42, 126, 78, .30)'); gradient.addColorStop(1, 'rgba(42, 126, 78, .015)');
      datasets[datasets.length - 1].backgroundColor = gradient;
      chartRef.current = new Chart(canvas.current, { type:'line', data:{ labels:months.map(month => monthLabel(month)), datasets }, options:{ responsive:true, maintainAspectRatio:false, animation:{ duration:900, easing:'easeOutQuart' }, interaction:{ intersect:false, mode:'index' },
        plugins:{ legend:{ position:'top', align:'end', labels:{ usePointStyle:true, pointStyle:'circle', boxWidth:7, boxHeight:7, color:'#607267', font:{ family:'Inter', weight:600 } } }, tooltip:{ backgroundColor:'#102d1d', padding:12, cornerRadius:10, callbacks:{ label:ctx => `${ctx.dataset.label}: ${money(ctx.raw)}` } } },
        scales:{ x:{ grid:{ display:false }, border:{ display:false }, ticks:{ color:'#87988e', font:{ family:'Inter', size:11 } } }, y:{ beginAtZero:true, border:{ display:false }, grid:{ color:'rgba(16,45,29,.07)' }, ticks:{ color:'#87988e', font:{ family:'Inter', size:12 }, callback:value => compactMoney(value) } } } } });
      return () => chartRef.current?.destroy();
    }, [payments, records]);
    return html`<div className="cashflow-canvas"><canvas ref=${canvas}></canvas></div>`;
  }

  function CategoryChart({ records }) {
    const canvas = useRef(null); const chartRef = useRef(null);
    const totals = useMemo(() => Object.entries(CATEGORIES).map(([key, meta]) => ({ key, ...meta, value:sum(records.filter(item => item.categoria === key && item.impacta_totais !== false && item.natureza !== 'indicador'), item => item.valor_acordado) })).filter(item => item.value > 0).sort((a, b) => b.value - a.value), [records]);
    useEffect(() => {
      if (!canvas.current || !window.Chart) return undefined;
      const colors = ['#2a7e4e', '#d79a2b', '#7451a6', '#dd6b45', '#5a8d65', '#a56c46', '#9b6d88', '#849586'];
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvas.current, { type:'doughnut', data:{ labels:totals.map(item => item.label), datasets:[{ data:totals.map(item => item.value), backgroundColor:colors, borderColor:'#fff', borderWidth:4, hoverOffset:6 }] }, options:{ responsive:true, maintainAspectRatio:false, cutout:'72%', animation:{ animateRotate:true, duration:900 }, plugins:{ legend:{ display:false }, tooltip:{ backgroundColor:'#102d1d', callbacks:{ label:ctx => ` ${ctx.label}: ${money(ctx.raw)}` } } } } });
      return () => chartRef.current?.destroy();
    }, [totals]);
    const total = sum(totals, item => item.value);
    return html`<div className="category-chart-wrap"><div className="donut-wrap"><canvas ref=${canvas}></canvas><div className="donut-center"><strong>${int(totals.length)}</strong><span>categorias</span></div></div><div className="category-legend">${totals.slice(0, 5).map((item, index) => html`<div key=${item.key}><i style=${{ background:['#2a7e4e', '#d79a2b', '#7451a6', '#dd6b45', '#5a8d65'][index] }}></i><span>${item.label}</span><b>${total ? Math.round((item.value / total) * 100) : 0}%</b></div>`)}</div></div>`;
  }

  function StatusBreakdown({ records }) {
    const count = records.length || 1;
    const items = ['negociacao', 'aprovado', 'em_andamento', 'concluido'].map(key => ({ key, ...RECORD_STATUS[key], value:records.filter(item => item.status === key).length }));
    return html`<div className="status-breakdown">${items.map(item => html`<div key=${item.key} className="status-line"><span><i className=${item.key}></i>${item.label}</span><div><em style=${{ width:`${(item.value / count) * 100}%` }}></em></div><b>${item.value}</b></div>`)}</div>`;
  }

  function MiniEmpty({ icon, title, text, action }) {
    useLucide([]);
    return html`<div className="mini-empty"><span><${Icon} name=${icon}/></span><div><strong>${title}</strong><p>${text}</p></div>${action && html`<button onClick=${action}><${Icon} name="plus"/>Adicionar</button>`}</div>`;
  }


  function actualInvestmentRows(context) {
    return context.allRecords.filter(record => {
      if (Number(record.ano_referencia) !== 2026 || record.natureza !== 'despesa' || record.status === 'cancelado') return false;
      if (hasTag(record, 'planejamento') || hasTag(record, 'legado-fora-coluna-valor')) return false;
      return recordRealized(context.payments, record) > 0;
    }).map(record => ({ record, value:recordRealized(context.payments, record) }));
  }

  const planningName = record => record.referencia || String(record.titulo || '').replace(/^Planejamento \d{4}\s*—\s*/i,'') || 'Frente';

  function buildPlanningSnapshot(records, payments, year = 2026) {
    const planning = records.filter(record => Number(record.ano_referencia) === Number(year) && record.natureza === 'despesa' && hasTag(record, 'planejamento') && record.status !== 'cancelado')
      .sort((a,b) => String(a.dados_originais?.coluna || 'Z').localeCompare(String(b.dados_originais?.coluna || 'Z')) || String(a.referencia).localeCompare(String(b.referencia),'pt-BR'));
    const recordIds = new Set(planning.map(record => record.id));
    const paymentMap = new Map();
    payments.forEach(payment => {
      if (!recordIds.has(payment.registro_id)) return;
      const due = String(payment.vencimento || payment.pago_em || '');
      const monthIndex = Number(due.slice(5, 7)) - 1;
      if (Number(due.slice(0, 4)) !== Number(year) || monthIndex < 0 || monthIndex > 11) return;
      paymentMap.set(`${payment.registro_id}|${monthIndex}`, payment);
    });
    const fallbackRecords = new Set();
    const planningSourceMeta = record => {
      const candidates = [record?.dados_originais?.categoria_original, record?.referencia, planningName(record)];
      for (const candidate of candidates) {
        const fallback = Number(year) === 2026 ? OFFICIAL_PLANNING_2026[normalize(candidate)] : null;
        if (fallback) return fallback;
      }
      return null;
    };
    const sourcePlanningValue = (record, monthIndex) => {
      const stored = record?.dados_originais?.valores_mensais;
      if (Array.isArray(stored) && stored.length >= 12) return Number(stored[monthIndex] || 0);
      const fallback = planningSourceMeta(record); if (fallback) fallbackRecords.add(record.id);
      return Number(fallback?.monthly?.[monthIndex] || 0);
    };
    const sourcePlanningPaid = (record, monthIndex) => {
      const stored = record?.dados_originais?.pagos_mensais;
      if (Array.isArray(stored) && stored.length >= 12) return Boolean(stored[monthIndex]);
      const fallback = planningSourceMeta(record); if (fallback) fallbackRecords.add(record.id);
      return Boolean(fallback?.paid?.[monthIndex]);
    };
    const planningCellValue = (record, monthIndex) => {
      const payment = paymentMap.get(`${record.id}|${monthIndex}`);
      return payment ? (payment.status === 'cancelado' ? 0 : Number(payment.valor_previsto || 0)) : sourcePlanningValue(record, monthIndex);
    };
    const planningCellPaid = (record, monthIndex) => {
      const payment = paymentMap.get(`${record.id}|${monthIndex}`);
      if (payment) return payment.status === 'pago';
      return sourcePlanningPaid(record, monthIndex);
    };
    const monthTotals = OFFICIAL_MONTHS.map((_,monthIndex) => sum(planning, record => planningCellValue(record, monthIndex)));
    const columnTotals = planning.map(record => sum(OFFICIAL_MONTHS, (_, monthIndex) => planningCellValue(record, monthIndex)));
    const paidColumnTotals = planning.map(record => sum(OFFICIAL_MONTHS, (_, monthIndex) => planningCellPaid(record, monthIndex) ? planningCellValue(record, monthIndex) : 0));
    const grandTotal = sum(columnTotals, value => value);
    const paidTotal = sum(paidColumnTotals, value => value);
    const remainingTotal = Math.max(0, grandTotal - paidTotal);
    return { planning, paymentMap, planningCellValue, planningCellPaid, monthTotals, columnTotals, paidColumnTotals, grandTotal, paidTotal, remainingTotal, fallbackCount:fallbackRecords.size, fallbackRecords };
  }


  function buildMktgExportSnapshot(context) {
    const records = context?.allRecords || [];
    const payments = context?.payments || [];
    const conferences = context?.conferences || [];

    const closedMap = new Map();
    records.filter(record => Number(record.ano_referencia) === 2025
      && record.controle === 'marcos' && record.natureza === 'receita'
      && record.status !== 'cancelado' && record.impacta_totais !== false).forEach(record => {
      const fallbackName = hasTag(record,'podcast') ? 'Podcast' : String(record.fornecedor || '').trim();
      const name = officialSupplierName(fallbackName) || fallbackName;
      if (!name) return;
      const key = supplierKey(name) || normalize(name);
      const row = closedMap.get(key) || { name, total:0 };
      row.total += Number(record.valor_acordado || 0);
      closedMap.set(key,row);
    });
    const closed2025 = [...closedMap.values()].filter(row => row.total > 0).sort((a,b) => supplierCompare(a.name,b.name));

    const forecastMap = new Map();
    records.filter(record => Number(record.ano_referencia) === 2026
      && record.controle === 'marcos' && record.natureza === 'receita'
      && record.fornecedor && hasTag(record,'previsão') && hasTag(record,'fornecedor')
      && record.status !== 'cancelado').forEach(record => {
      const name = officialSupplierName(record.fornecedor);
      const key = supplierKey(name);
      const row = forecastMap.get(key) || { name, forecast:0 };
      row.forecast += Number(record.valor_acordado || 0);
      forecastMap.set(key,row);
    });

    const live = liveRevenueSnapshot(records,payments,conferences,2026);
    const revenueKeys = new Set([...forecastMap.keys(), ...live.bySupplier.keys()]);
    const revenue2026 = [...revenueKeys].map(key => {
      const forecast = forecastMap.get(key);
      const realized = live.bySupplier.get(key);
      const months = Array.from({ length:12 }, (_, index) => Number(realized?.months?.[index] || 0));
      return {
        key,
        name:officialSupplierName(forecast?.name || realized?.name || key),
        forecast:Number(forecast?.forecast || 0),
        months,
        total:sum(months,value => value),
      };
    }).filter(row => row.name).sort((a,b) => supplierCompare(a.name,b.name));

    const sourceAdjustments = Array.from({ length:12 }, (_, index) => Number(live.sourceAdjustments?.[index] || 0));
    const sourceAdjustmentTotal = sum(sourceAdjustments,value => value);
    const forecastRevenue = sum(revenue2026,row => row.forecast);
    const planning = buildPlanningSnapshot(records,payments,2026);
    const forecastInvestment = planning.grandTotal;
    const realizedInvestment = planning.paidTotal;
    const confirmedRevenue = Number(live.total || 0);

    const pendingRows = [];
    records.filter(record => Number(record.ano_referencia) === 2026 && record.status !== 'cancelado').forEach(record => {
      const explicitPendency = record.categoria === 'pendencia' || hasTag(record,'pendência') || hasTag(record,'pendencia');
      const supplierRow = isSupplierRevenueRecord(record);
      if (!explicitPendency && !supplierRow) return;
      if (explicitPendency && record.status === 'concluido') return;
      const monthIndex = sourceMonthIndex(record);
      const payment = supplierRowPayment(payments,record,2026,monthIndex);
      const stage = supplierRow ? supplierRevenueStage(payment,record,conferences,2026,monthIndex) : 'a_receber';
      if (!explicitPendency && stage === 'confirmado') return;
      const value = Math.max(0,Number(payment?.valor_previsto ?? record.valor_acordado ?? 0));
      pendingRows.push({
        supplier:officialSupplierName(record.fornecedor || '') || String(record.fornecedor || record.titulo || 'Sem fornecedor'),
        category:explicitPendency ? 'Pendência' : category(record.categoria).label,
        competence:`${OFFICIAL_MONTHS[monthIndex]?.[1] || 'Janeiro'} 2026`,
        document:String(payment?.numero_documento || record.numero_documento || '').trim(),
        value,
        status:explicitPendency ? 'Pendência' : 'A receber',
        explicitPendency,
        monthIndex,
      });
    });
    pendingRows.sort((a,b) => supplierCompare(a.supplier,b.supplier) || a.monthIndex - b.monthIndex || a.category.localeCompare(b.category,'pt-BR'));

    return {
      closed2025,
      closed2025Total:sum(closed2025,row => row.total),
      revenue2026,
      forecastRevenue,
      live,
      sourceAdjustments,
      sourceAdjustmentTotal,
      planning,
      forecastInvestment,
      realizedInvestment,
      confirmedRevenue,
      forecastBalance:forecastRevenue - forecastInvestment,
      realizedBalance:confirmedRevenue - realizedInvestment,
      legacyPendingValue:sum(pendingRows.filter(row => row.explicitPendency),row => row.value),
      pendingRows,
    };
  }

  function workbookSetCell(sheet,rowIndex,columnIndex,value,options = {}) {
    if (!sheet || !window.XLSX) return;
    const address = XLSX.utils.encode_cell({ r:rowIndex, c:columnIndex });
    const current = sheet[address] || {};
    const previousStyle = current.s;
    delete current.f; delete current.F; delete current.w; delete current.h;
    current.v = value == null ? '' : value;
    current.t = typeof current.v === 'number' ? 'n' : typeof current.v === 'boolean' ? 'b' : 's';
    if (options.numberFormat) current.z = options.numberFormat;
    if (options.style !== undefined && options.style !== null) current.s = options.style;
    else if (previousStyle !== undefined) current.s = previousStyle;
    sheet[address] = current;

    const range = XLSX.utils.decode_range(sheet['!ref'] || address);
    range.s.r = Math.min(range.s.r,rowIndex); range.s.c = Math.min(range.s.c,columnIndex);
    range.e.r = Math.max(range.e.r,rowIndex); range.e.c = Math.max(range.e.c,columnIndex);
    sheet['!ref'] = XLSX.utils.encode_range(range);
  }

  function workbookClearRange(sheet,rangeAddress) {
    if (!sheet || !window.XLSX) return;
    const range = XLSX.utils.decode_range(rangeAddress);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) workbookSetCell(sheet,r,c,'');
    }
  }

  async function exportMktgWorkbook(context) {
    await ensureXlsxAsset();
    const response = await fetch('/modelos/MKTG-2026-PMG-CONNECT.xlsx', { cache:'no-store' });
    if (!response.ok) throw new Error('O modelo MKTG 2026 de exportação não foi encontrado.');
    const workbook = XLSX.read(await response.arrayBuffer(), { type:'array', cellStyles:true, cellDates:true, bookFiles:true });
    const receitaSheet = workbook.Sheets.RECEITA;
    const planningSheet = workbook.Sheets.Planejamento;
    const pendingSheet = workbook.Sheets['PENDÊNCIAS'];
    if (!receitaSheet || !planningSheet || !pendingSheet) throw new Error('O modelo de exportação está incompleto.');

    const snapshot = buildMktgExportSnapshot(context);
    const currency = 'R$ #,##0.00';
    const metaSheet = workbook.Sheets.CONNECT_META;
    const normalCurrencyStyle = metaSheet?.A5?.s;
    const paidCurrencyStyle = metaSheet?.A6?.s;

    workbookClearRange(receitaSheet,'A3:B51');
    workbookClearRange(receitaSheet,'D3:R51');
    workbookSetCell(receitaSheet,51,0,'SOMA 2025');
    workbookSetCell(receitaSheet,51,1,snapshot.closed2025Total,{ numberFormat:currency, style:normalCurrencyStyle });
    workbookSetCell(receitaSheet,51,3,'SOMA MENSAL');
    workbookSetCell(receitaSheet,51,4,snapshot.forecastRevenue,{ numberFormat:currency, style:normalCurrencyStyle });
    OFFICIAL_MONTHS.forEach((_,monthIndex) => workbookSetCell(receitaSheet,51,5 + monthIndex,Number(snapshot.live.monthlyTotals?.[monthIndex] || 0),{ numberFormat:currency, style:normalCurrencyStyle }));
    workbookSetCell(receitaSheet,51,17,snapshot.confirmedRevenue,{ numberFormat:currency, style:normalCurrencyStyle });

    snapshot.closed2025.slice(0,49).forEach((row,index) => {
      workbookSetCell(receitaSheet,2 + index,0,row.name);
      workbookSetCell(receitaSheet,2 + index,1,row.total,{ numberFormat:currency, style:normalCurrencyStyle });
    });
    snapshot.revenue2026.slice(0,49).forEach((row,index) => {
      const excelRow = 2 + index;
      workbookSetCell(receitaSheet,excelRow,3,row.name);
      workbookSetCell(receitaSheet,excelRow,4,row.forecast,{ numberFormat:currency, style:normalCurrencyStyle });
      row.months.forEach((value,monthIndex) => workbookSetCell(receitaSheet,excelRow,5 + monthIndex,value,{ numberFormat:currency, style:normalCurrencyStyle }));
      workbookSetCell(receitaSheet,excelRow,17,row.total,{ numberFormat:currency, style:normalCurrencyStyle });
    });
    if (Math.abs(snapshot.sourceAdjustmentTotal) > .005 && snapshot.revenue2026.length < 49) {
      const excelRow = 2 + snapshot.revenue2026.length;
      workbookSetCell(receitaSheet,excelRow,3,'AJUSTES DA FONTE');
      workbookSetCell(receitaSheet,excelRow,4,0,{ numberFormat:currency, style:normalCurrencyStyle });
      snapshot.sourceAdjustments.forEach((value,monthIndex) => workbookSetCell(receitaSheet,excelRow,5 + monthIndex,value,{ numberFormat:currency, style:normalCurrencyStyle }));
      workbookSetCell(receitaSheet,excelRow,17,snapshot.sourceAdjustmentTotal,{ numberFormat:currency, style:normalCurrencyStyle });
    }

    workbookSetCell(receitaSheet,55,4,snapshot.forecastInvestment,{ numberFormat:currency, style:normalCurrencyStyle }); // E56
    workbookSetCell(receitaSheet,57,4,snapshot.forecastRevenue,{ numberFormat:currency, style:normalCurrencyStyle }); // E58
    workbookSetCell(receitaSheet,59,4,snapshot.forecastBalance,{ numberFormat:currency, style:normalCurrencyStyle }); // E60
    workbookSetCell(receitaSheet,61,4,snapshot.realizedInvestment,{ numberFormat:currency, style:normalCurrencyStyle }); // E62
    workbookSetCell(receitaSheet,63,4,snapshot.confirmedRevenue,{ numberFormat:currency, style:normalCurrencyStyle }); // E64
    workbookSetCell(receitaSheet,65,4,snapshot.realizedBalance,{ numberFormat:currency, style:normalCurrencyStyle }); // E66

    workbookClearRange(planningSheet,'B3:P17');
    snapshot.planning.planning.slice(0,15).forEach((record,columnIndex) => {
      workbookSetCell(planningSheet,1,1 + columnIndex,planningName(record));
      OFFICIAL_MONTHS.forEach((_,monthIndex) => {
        const value = snapshot.planning.planningCellValue(record,monthIndex);
        const paid = snapshot.planning.planningCellPaid(record,monthIndex);
        workbookSetCell(planningSheet,2 + monthIndex,1 + columnIndex,value,{
          numberFormat:currency,
          style:paid && paidCurrencyStyle !== undefined ? paidCurrencyStyle : normalCurrencyStyle
        });
      });
      const total = Number(snapshot.planning.columnTotals?.[columnIndex] || 0);
      const paid = Number(snapshot.planning.paidColumnTotals?.[columnIndex] || 0);
      workbookSetCell(planningSheet,14,1 + columnIndex,total,{ numberFormat:currency, style:normalCurrencyStyle });
      workbookSetCell(planningSheet,15,1 + columnIndex,paid,{ numberFormat:currency, style:paidCurrencyStyle ?? normalCurrencyStyle });
      workbookSetCell(planningSheet,16,1 + columnIndex,Math.max(0,total-paid),{ numberFormat:currency, style:normalCurrencyStyle });
    });

    workbookSetCell(pendingSheet,1,0,'EDILSON');
    workbookSetCell(pendingSheet,1,1,'HAVER');
    workbookSetCell(pendingSheet,1,2,snapshot.legacyPendingValue,{ numberFormat:currency, style:normalCurrencyStyle });
    workbookClearRange(pendingSheet,'A6:F200');
    snapshot.pendingRows.slice(0,195).forEach((row,index) => {
      const excelRow = 5 + index;
      [row.supplier,row.category,row.competence,row.document,row.value,row.status].forEach((value,columnIndex) => {
        workbookSetCell(pendingSheet,excelRow,columnIndex,value,{
          numberFormat:columnIndex === 4 ? currency : undefined,
          style:columnIndex === 4 ? normalCurrencyStyle : undefined
        });
      });
    });

    workbook.Props = {
      ...(workbook.Props || {}),
      Title:'MKTG 2026 · PMG Connect',
      Subject:'Exportação da Central de Acompanhamento',
      Author:'PMG Connect',
      Comments:'Gerado a partir dos dados atuais de Pagamentos, Planejamento e Receita.'
    };
    if (workbook.Sheets.CONNECT_META) {
      delete workbook.Sheets.CONNECT_META;
      workbook.SheetNames = workbook.SheetNames.filter(name => name !== 'CONNECT_META');
    }
    const stamp = new Intl.DateTimeFormat('sv-SE',{ year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
    const filename = `MKTG 2026 - PMG Connect - ${stamp}.xlsx`;
    XLSX.writeFile(workbook,filename,{ compression:true, cellStyles:true });
    return { filename, snapshot };
  }

  function PlanningView({ context }) {
    const planningScrollRef = useRef(null);
    const snapshot = useMemo(() => buildPlanningSnapshot(context.allRecords, context.payments), [context.allRecords, context.payments]);
    const { planning, paymentMap, planningCellValue, planningCellPaid, monthTotals, columnTotals, paidColumnTotals, grandTotal, paidTotal, remainingTotal, fallbackCount } = snapshot;
    const now = new Date();
    const currentMonth = now.getFullYear() === 2026 ? now.getMonth() : 0;
    const [mobileMonth, setMobileMonth] = useState(currentMonth);
    const isMobile = useMediaQuery('(max-width: 900px)');
    const monthLabel = OFFICIAL_MONTHS[mobileMonth]?.[1] || 'Janeiro';
    const mobilePaidTotal = sum(planning, record => planningCellPaid(record,mobileMonth) ? planningCellValue(record,mobileMonth) : 0);
    const mobileOpenTotal = Math.max(0, Number(monthTotals[mobileMonth] || 0) - mobilePaidTotal);
    const canEditPlanning = context.canEditPlanning === true;
    const shiftMobileMonth = direction => setMobileMonth(index => Math.max(0, Math.min(11,index + direction)));
    const jumpToPlanningColumn = index => {
      const scroller = planningScrollRef.current; if (!scroller) return;
      const target = scroller.querySelectorAll('.planning-live-sheet thead th')[index + 1]; if (!target) return;
      scroller.scrollTo({ left:Math.max(0, target.offsetLeft - 220), behavior:'smooth' });
    };
    useLucide([planning.length, context.saving, mobileMonth, fallbackCount, isMobile]);
    return html`<section className="spreadsheet-view planning-sheet-view">
      <${SpreadsheetTitle} kicker="Fonte oficial · MKTG 2026 / Planejamento" title="PLANEJAMENTO PMG 2026" subtitle=${canEditPlanning ? "Edite os valores e marque cada competência como paga ou em aberto. As alterações alimentam Receita e Dashboard automaticamente." : "Modo somente leitura. Apenas marcos@pmg.com.br pode alterar valores e competências do Planejamento."} actions=${html`<span className="sheet-help"><${Icon} name=${canEditPlanning ? "mouse-pointer-click" : "lock"}/>${canEditPlanning ? "Clique no valor para editar" : "Somente Marcos pode editar"}</span><button className="button secondary" title="Abrir Documentos e escolher o PDF para uma nova leitura com IA" onClick=${() => context.setView('documentos')}><${Icon} name="scan-line"/>Reescanear PDF com IA</button>`}/>
      <div className="planning-summary-line"><span><small>Frentes</small><strong>${planning.length}</strong></span><span><small>Total planejado</small><strong>${money(grandTotal)}</strong></span><span className="paid"><small>Já pago</small><strong>${money(paidTotal)}</strong></span><span className="pending"><small>A pagar</small><strong>${money(remainingTotal)}</strong></span></div>
      ${fallbackCount > 0 && html`<div className="data-source-warning"><${Icon} name="database-backup"/><div><strong>${fallbackCount} frente(s) usando recuperação local</strong><span>Os valores continuam visíveis, mas a origem persistida do Planejamento precisa ser atualizada. A Central não trata esse fallback como fonte definitiva.</span></div></div>`}
      ${planning.length ? html`<section className="planning-fronts-panel desktop-sheet-only"><div className="planning-fronts-heading"><div><span>Frentes do planejamento</span><strong>${planning.length} elementos oficiais</strong></div><small>Vermelho = pago · escuro = em aberto</small></div><div className="planning-fronts-grid">${planning.map((record,index)=>html`<button onClick=${()=>jumpToPlanningColumn(index)} title=${`Ir para ${planningName(record)}`}><span>${String(index+1).padStart(2,'0')}</span><div><strong>${planningName(record)}</strong><small>${money(columnTotals[index])} planejado</small><em>${money(paidColumnTotals[index])} pago</em></div><${Icon} name="arrow-right"/></button>`)}</div></section>` : html`<div className="planning-missing"><span><${Icon} name="triangle-alert"/></span><div><strong>As frentes do Planejamento 2026 não foram carregadas.</strong><p>A fonte oficial possui 15 frentes. A atualização deve ser feita pela origem administrativa da Central, sem expor uma aba extra para a operação diária.</p></div></div>`}
      ${planning.length && html`<section className="mobile-competence-only mobile-planning-mode"><div className="mobile-competence-bar"><button aria-label="Mês anterior" disabled=${mobileMonth===0} onClick=${()=>shiftMobileMonth(-1)}><${Icon} name="chevron-left"/></button><label><small>Competência</small><select value=${mobileMonth} onChange=${event=>setMobileMonth(Number(event.target.value))}>${OFFICIAL_MONTHS.map(([,label],index)=>html`<option value=${index}>${label} 2026${index===currentMonth?' · em andamento':''}</option>`)}</select></label><button aria-label="Próximo mês" disabled=${mobileMonth===11} onClick=${()=>shiftMobileMonth(1)}><${Icon} name="chevron-right"/></button></div><div className="mobile-month-summary"><span><small>Planejado em ${monthLabel}</small><strong>${money(monthTotals[mobileMonth])}</strong></span><span className="paid"><small>Pago</small><strong>${money(mobilePaidTotal)}</strong></span><span><small>Em aberto</small><strong>${money(mobileOpenTotal)}</strong></span></div><div className="mobile-planning-grid">${planning.map(record=>{ const payment=paymentMap.get(`${record.id}|${mobileMonth}`); const value=planningCellValue(record,mobileMonth); const paid=planningCellPaid(record,mobileMonth); return html`<article className=${`mobile-planning-card ${paid?'is-paid':''}`}><header><div><small>${monthLabel.toUpperCase()}</small><strong>${planningName(record)}</strong></div><span>${paid?'PAGO':'EM ABERTO'}</span></header><div className="mobile-planning-value"><small>Valor planejado</small><${EditableSheetCell} type="money" value=${value} disabled=${context.saving || !canEditPlanning} onSave=${next=>context.quickUpsertPayment(record,payment,mobileMonth,next,{status:paid?'pago':'previsto',syncRecordTotal:true,fingerprintLabel:'planejamento'})}/></div>${value>0?html`<button type="button" className=${`planning-payment-toggle ${paid?'is-paid':'is-open'}`} disabled=${context.saving || !canEditPlanning} onClick=${()=>context.quickTogglePlanningPaid(record,mobileMonth)}>${paid?'↶ Marcar em aberto':'✓ Marcar como pago'}</button>`:html`<small className="mobile-empty-value">Sem valor nesta competência</small>`}</article>`;})}</div></section>`}
      ${planning.length ? html`<div className="desktop-sheet-only"><${EasySheetNavigator} scrollRef=${planningScrollRef} focusSelector=".planning-live-sheet .total-head" focusLabel="Ir ao total"/></div>` : null}
      ${planning.length ? html`<article className="spreadsheet-card planning-card desktop-sheet-only"><div className="spreadsheet-scroll assisted-scroll" ref=${planningScrollRef}><table className="live-sheet planning-live-sheet"><thead><tr><th className="sticky-first">Programação</th>${planning.map(record => html`<th title=${planningName(record)}>${planningName(record)}</th>`)}<th className="total-head">TOTAL</th></tr></thead><tbody>
        ${OFFICIAL_MONTHS.map(([,label],monthIndex) => html`<tr className=${currentMonth === monthIndex ? 'current-month-row' : ''}><th className="sticky-first">${label}${currentMonth === monthIndex && html`<small>em andamento</small>`}</th>${planning.map(record => { const payment = paymentMap.get(`${record.id}|${monthIndex}`); const value = planningCellValue(record, monthIndex); const paid = planningCellPaid(record, monthIndex); return html`<td className=${`${value ? 'has-value' : 'blank-value'} ${paid ? 'planning-paid-cell' : (value ? 'planning-planned-cell' : '')}`} title=${paid ? 'Pago: valor atual do planejamento' : (payment ? 'Valor salvo no sistema' : (value ? 'Previsto no MKTG 2026' : ''))}><div className="planning-cell-controls"><${EditableSheetCell} type="money" value=${value} disabled=${context.saving || !canEditPlanning} onSave=${next => context.quickUpsertPayment(record,payment,monthIndex,next,{ status:paid ? 'pago' : 'previsto', syncRecordTotal:true, fingerprintLabel:'planejamento' })}/>${value > 0 ? html`<button type="button" className=${`planning-payment-toggle ${paid ? 'is-paid' : 'is-open'}`} disabled=${context.saving || !canEditPlanning} aria-label=${`${paid ? 'Marcar em aberto' : 'Marcar como pago'}: ${planningName(record)}, ${label} de 2026, ${money(value)}`} title=${paid ? 'Reabrir este mês sem apagar seu valor' : 'Registrar este valor como pago hoje'} onClick=${() => context.quickTogglePlanningPaid(record,monthIndex)}><span aria-hidden="true">${paid ? '↶' : '✓'}</span>${paid ? 'Marcar em aberto' : 'Marcar como pago'}</button>` : null}</div></td>`; })}<td className="row-total">${money(monthTotals[monthIndex])}</td></tr>`)}
      </tbody><tfoot><tr><th className="sticky-first">Total</th>${columnTotals.map(value => html`<th>${money(value)}</th>`)}<th>${money(grandTotal)}</th></tr></tfoot></table></div></article>` : null}
      ${planning.length ? html`<div className="sheet-footnote"><${Icon} name="info"/><span>Vermelho indica pago; escuro indica em aberto. Suas alterações prevalecem sobre a leitura inicial e atualizam Receita e Dashboard. No celular, a Central muda automaticamente para uma competência por vez.</span></div>` : null}
    </section>`;
  }

  function RevenueComparisonChart({ context }) {
    const canvas = useRef(null); const chartRef = useRef(null); const [mode,setMode] = useState('monthly');
    const baseSeries = useMemo(() => {
      const values = { 2025:Array(12).fill(0), 2026:Array(12).fill(0) };
      [2025,2026].forEach(year => {
        const snapshot = liveRevenueSnapshot(context.allRecords, context.payments, context.conferences, year);
        if (snapshot.hasData) values[year] = [...snapshot.monthlyTotals];
      });
      return values;
    }, [context.allRecords, context.payments, context.conferences]);
    const series = useMemo(() => {
      if (mode === 'monthly') return baseSeries;
      const cumulative = values => values.map((_, index) => sum(values.slice(0, index + 1), value => value));
      return { 2025:cumulative(baseSeries[2025]), 2026:cumulative(baseSeries[2026]) };
    }, [baseSeries, mode]);
    const now = new Date();
    const compareThrough = now.getFullYear() === 2026 ? Math.max(-1, now.getMonth() - 1) : (now.getFullYear() > 2026 ? 11 : -1);
    const ytd2026 = compareThrough >= 0 ? sum(baseSeries[2026].slice(0, compareThrough + 1), value => value) : 0;
    const ytd2025 = compareThrough >= 0 ? sum(baseSeries[2025].slice(0, compareThrough + 1), value => value) : 0;
    const yoy = ytd2025 ? ((ytd2026 / ytd2025) - 1) * 100 : 0;
    const closedLabel = compareThrough >= 0 ? OFFICIAL_MONTHS[compareThrough][1] : 'nenhum mês fechado';
    useEffect(() => {
      if (!canvas.current || !window.Chart) return undefined;
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvas.current, { type:'line', data:{ labels:OFFICIAL_MONTHS.map(([, label]) => label.slice(0,3)), datasets:[
        { label:'2025', data:series[2025], borderColor:'#9ca9a0', backgroundColor:'rgba(156,169,160,.08)', tension:.32, fill:false, pointRadius:3, borderWidth:2 },
        { label:'2026', data:series[2026], borderColor:'#2a7e4e', backgroundColor:'rgba(42,126,78,.10)', tension:.32, fill:true, pointRadius:3, borderWidth:2.5 },
      ]}, options:{ responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false }, onClick:(_,elements) => { const point=elements?.[0]; if(point) context.navigatePayments({ year:2026, month:point.index }); }, onHover:(event,elements) => { if(event?.native?.target) event.native.target.style.cursor = elements?.length ? 'pointer' : 'default'; }, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, boxWidth:7, font:{ family:'Inter', size:12 } } }, tooltip:{ callbacks:{ label:ctx => `${ctx.dataset.label}: ${money(ctx.raw)}` } } }, scales:{ x:{ grid:{ display:false }, border:{ display:false } }, y:{ beginAtZero:true, border:{ display:false }, grid:{ color:'rgba(16,45,29,.06)' }, ticks:{ font:{ family:'Inter', size:11 }, callback:value => compactMoney(value) } } } } });
      return () => chartRef.current?.destroy();
    }, [series]);
    return html`<div className="revenue-chart-shell"><div className="revenue-chart-toolbar"><div className="chart-mode-toggle"><button className=${mode==='monthly'?'active':''} onClick=${()=>setMode('monthly')}>Mensal</button><button className=${mode==='cumulative'?'active':''} onClick=${()=>setMode('cumulative')}>Acumulado</button></div><div className="chart-ytd-summary"><span><small>2026 · fechado até ${closedLabel}</small><strong>${compareThrough>=0?money(ytd2026):'—'}</strong></span><span className=${yoy>=0?'positive':'negative'}><small>Vs. 2025 no mesmo período</small><strong>${ytd2025 ? `${yoy>=0?'+':''}${yoy.toFixed(1).replace('.',',')}%` : '—'}</strong></span></div></div><div className="revenue-chart"><canvas ref=${canvas}></canvas></div></div>`;
  }

  function RevenueView({ context }) {
    const revenueScrollRef = useRef(null);
    const now = new Date();
    const currentRevenueMonth = now.getFullYear() === 2026 ? now.getMonth() : 0;
    const [mobileMonth,setMobileMonth] = useState(currentRevenueMonth);
    const [onlyBelow,setOnlyBelow] = useState(false);
    const [onlyWithoutForecast,setOnlyWithoutForecast] = useState(false);
    const [onlyAbove,setOnlyAbove] = useState(false);
    const jumpToken = useRef(null);
    const isMobile = useMediaQuery('(max-width: 900px)');

    useEffect(() => {
      const jump = context.revenueJump;
      if (!jump?.token || jumpToken.current === jump.token) return;
      jumpToken.current = jump.token;
      setOnlyBelow(Boolean(jump.below));
      setOnlyWithoutForecast(Boolean(jump.withoutForecast));
      setOnlyAbove(Boolean(jump.above));
      if (Number.isInteger(jump.month)) setMobileMonth(Math.max(0,Math.min(11,Number(jump.month))));
    }, [context.revenueJump]);

    const forecastRows = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.controle === 'marcos' && record.natureza === 'receita' && record.fornecedor && hasTag(record,'previsão') && hasTag(record,'fornecedor') && record.status !== 'cancelado');
    const forecastsBySupplier = new Map();
    forecastRows.forEach(record => {
      const key = supplierKey(record.fornecedor);
      const row = forecastsBySupplier.get(key) || { name:officialSupplierName(record.fornecedor), records:[], total:0 };
      row.records.push(record); row.total += Number(record.valor_acordado || 0); forecastsBySupplier.set(key,row);
    });

    const supplierRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && isSupplierRevenueRecord(record));
    const liveRevenue = useMemo(() => liveRevenueSnapshot(context.allRecords, context.payments, context.conferences, 2026), [context.allRecords, context.payments, context.conferences]);
    const realizedBySupplier = useMemo(() => {
      const map = new Map();
      supplierRecords.forEach(record => {
        if (!record.fornecedor) return;
        const monthIndex = sourceMonthIndex(record);
        const payment = supplierRowPayment(context.payments, record, 2026, monthIndex);
        const stage = supplierRevenueStage(payment, record, context.conferences, 2026, monthIndex);
        const key = supplierKey(record.fornecedor);
        const row = map.get(key) || { name:officialSupplierName(record.fornecedor), records:[], months:OFFICIAL_MONTHS.map(() => ({ confirmed:0, open:0, confirmedCount:0, openCount:0 })) };
        row.records.push(record);
        const cell = row.months[monthIndex];
        const expected = Number(payment?.valor_previsto || record.valor_acordado || 0);
        if (stage === 'confirmado') { cell.confirmed += supplierConfirmedValue(record, payment); cell.confirmedCount += 1; }
        else { cell.open += expected; cell.openCount += 1; }
        map.set(key,row);
      });
      return map;
    }, [context.allRecords, context.payments, context.conferences]);

    const supplierKeys = new Set([...forecastsBySupplier.keys(), ...liveRevenue.bySupplier.keys(), ...realizedBySupplier.keys()]);
    const allRowData = [...supplierKeys].map(key => {
      const forecastSource = forecastsBySupplier.get(key);
      const status = realizedBySupplier.get(key) || { name:liveRevenue.bySupplier.get(key)?.name || key, records:[], months:OFFICIAL_MONTHS.map(() => ({ confirmed:0, open:0, confirmedCount:0, openCount:0 })) };
      const source = liveRevenue.bySupplier.get(key);
      const months = source ? [...source.months] : status.months.map(item => item.confirmed);
      const monthStatus = status.months.map((item,index) => {
        const expected = Number(item.confirmed || 0) + Number(item.open || 0);
        const confirmed = Number(months[index] || 0);
        return { ...item, confirmed, open:Math.max(0, expected-confirmed) };
      });
      const total = sum(months,value => value);
      const forecast = Number(forecastSource?.total || 0);
      const record = forecastSource?.records?.[0] || status.records?.[0] || { fornecedor:source?.name || status.name || key };
      return { key, name:officialSupplierName(record.fornecedor || source?.name || status.name || key), record, forecastRecords:forecastSource?.records || [], months, monthStatus, total, forecast, variance:forecast ? total-forecast : null, pct:forecast > 0 ? total/forecast*100 : null, hasForecast:forecast > 0 };
    }).sort((a,b)=>supplierCompare(a.name,b.name));

    const needle = normalize(context.search || '');
    const rowData = allRowData.filter(row => {
      if (needle && !normalize(row.name).includes(needle)) return false;
      if (onlyBelow && !(row.hasForecast && row.total < row.forecast - .005)) return false;
      if (onlyWithoutForecast && !(row.total > .005 && !row.hasForecast)) return false;
      if (onlyAbove && !(row.hasForecast && row.total > row.forecast + .005)) return false;
      return true;
    });
    const isFiltered = Boolean(needle || onlyBelow || onlyWithoutForecast || onlyAbove);
    const supplierMonthlyTotals = OFFICIAL_MONTHS.map((_,index) => sum(allRowData,row => row.months[index]));
    const monthlyTotals = [...liveRevenue.monthlyTotals];
    const sourceAdjustments = liveRevenue.sourceAdjustments || monthlyTotals.map((value,index) => Math.round((Number(value||0)-Number(supplierMonthlyTotals[index]||0))*100)/100);
    const sourceAdjustmentTotal = sum(sourceAdjustments,value => value);
    const totalForecast = sum(allRowData,row => row.forecast);
    const totalReceived = liveRevenue.total;
    const totalOpen = sum(allRowData,row => row.hasForecast ? Math.max(0,row.forecast-row.total) : 0);
    const withoutForecastCount = allRowData.filter(row => row.total>.005 && !row.hasForecast).length;

    const indicators = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.natureza === 'indicador'); const indicator = tag => Number(indicators.find(record => hasTag(record,tag))?.valor_acordado || 0);
    const planningSnapshot = useMemo(() => buildPlanningSnapshot(context.allRecords, context.payments, 2026), [context.allRecords, context.payments]);
    const forecastInvestment = planningSnapshot.planning.length ? planningSnapshot.grandTotal : indicator('investimento');
    const realizedInvestment = planningSnapshot.paidTotal;
    const forecastRevenue = forecastRows.length ? totalForecast : indicator('receita');
    const forecastBalance = forecastRevenue - forecastInvestment;
    const realizedBalance = totalReceived - realizedInvestment;
    const closed2025 = context.allRecords.filter(record => Number(record.ano_referencia) === 2025 && record.controle === 'marcos' && record.natureza === 'receita' && record.status !== 'cancelado' && record.impacta_totais !== false);
    const closed2025Total = sum(closed2025,record => record.valor_acordado);

    const cellState = item => item.open > 0 && item.confirmed === 0 ? 'open' : item.confirmed > 0 ? 'confirmed' : 'empty';
    const cellTitle = (item, label) => {
      const parts = [`${label} 2026`];
      if (item.confirmed) parts.push(`${money(item.confirmed)} confirmado`);
      if (item.open) parts.push(`${money(item.open)} pendente`);
      return parts.join(' · ');
    };
    const forecastCell = row => {
      if (!row.forecastRecords.length) return html`<span className="forecast-not-set">Sem previsão</span>`;
      if (row.forecastRecords.length === 1) return html`<${EditableSheetCell} type="money" value=${row.forecast} onSave=${value => context.quickUpdateRecord(row.forecastRecords[0],{ valor_acordado:value },'Previsão atualizada.')}/>`;
      return html`<button className="forecast-multi" onClick=${()=>context.openForecastGroup({supplier:row.name,recordIds:row.forecastRecords.map(record=>record.id)})} title="Este total é composto por mais de um registro. Abra o detalhamento para editar cada origem com segurança."><strong>${money(row.forecast)}</strong><small>${row.forecastRecords.length} origens · editar</small></button>`;
    };
    const varianceCell = row => {
      if (!row.hasForecast) return html`<td className="balance-cell no-forecast"><span className="variance-value">Sem previsão</span><small>${row.total>.005?'receita não planejada':'sem movimento'}</small></td>`;
      return html`<td className=${`balance-cell ${row.variance > .005 ? 'above' : row.variance < -.005 ? 'below' : 'on-target'}`}>${row.variance > .005 ? html`<span className="variance-value">+ ${money(row.variance)}</span><small>acima</small>` : row.variance < -.005 ? html`<span className="variance-value">${money(Math.abs(row.variance))}</span><small>abaixo</small>` : html`<span className="variance-value">—</span><small>meta atingida</small>`}</td>`;
    };
    const progressCell = row => row.pct === null ? html`<span className="no-forecast-chip">Sem previsão</span>` : html`<span className=${`revenue-progress ${row.pct >= 100 ? 'target-hit' : row.pct >= 80 ? 'near-target' : 'below-target'}`}><i style=${{ width:`${Math.min(100,row.pct)}%` }}></i><b>${Math.round(row.pct)}%</b></span>`;
    const clearFilters = () => { setOnlyBelow(false); setOnlyWithoutForecast(false); setOnlyAbove(false); context.setSearch(''); };
    const shiftMobileMonth = direction => setMobileMonth(index => Math.max(0,Math.min(11,index+direction)));
    const mobileMonthTotal = Number(monthlyTotals[mobileMonth] || 0);
    const mobileRows = rowData.filter(row => row.months[mobileMonth] || row.monthStatus[mobileMonth]?.open || row.hasForecast);

    useLucide([rowData.length, context.saving, context.conferences?.length, mobileMonth, isMobile]);
    return html`<section className="spreadsheet-view revenue-sheet-view">
      <${SpreadsheetTitle} kicker="Fonte oficial · MKTG 2026 / Receita" title="RECEITA ANUAL 2026" subtitle="Receita, Pagamentos e Planejamento usam a mesma base viva. Confirmou em Pagamentos, aparece aqui; alterou Planejamento, os totais acima acompanham." actions=${html`<span className="closed-year-chip"><small>Fechado 2025</small><strong>${money(closed2025Total)}</strong></span>`}/>
      <section className="budget-strip integrated-budget-strip"><div className="budget-title"><span>CONTROLE INTEGRADO</span><small>Planejamento + Pagamentos + Receita</small></div><div className="budget-cell investment"><span>INVESTIMENTO PREVISTO</span><strong>${money(forecastInvestment)}</strong><small>${money(realizedInvestment)} já pago</small></div><div className="budget-cell revenue"><span>RECEITA PREVISTA</span><strong>${money(forecastRevenue)}</strong><small>${money(totalReceived)} confirmado</small></div><div className="budget-cell balance"><span>SALDO PREVISTO</span><strong>${money(forecastBalance)}</strong><small>Saldo realizado ${money(realizedBalance)}</small></div></section>

      <div className="revenue-rule-strip">
        <button className="confirmed" onClick=${clearFilters}><i></i><small>Receita confirmada</small><strong>${money(totalReceived)}</strong><em>Pagamentos confirmados</em></button>
        <button className="open" onClick=${() => context.navigateRevenue({below:true})}><i></i><small>A receber</small><strong>${money(totalOpen)}</strong><em>Fornecedores abaixo da previsão</em></button>
      </div>

      <div className="revenue-filter-bar"><button className=${onlyBelow?'active':''} onClick=${()=>{setOnlyBelow(v=>!v);setOnlyWithoutForecast(false);setOnlyAbove(false)}}><${Icon} name="trending-down"/>Abaixo da previsão</button><button className=${onlyAbove?'active':''} onClick=${()=>{setOnlyAbove(v=>!v);setOnlyBelow(false);setOnlyWithoutForecast(false)}}><${Icon} name="trending-up"/>Acima da previsão</button><button className=${onlyWithoutForecast?'active warning':''} onClick=${()=>{setOnlyWithoutForecast(v=>!v);setOnlyBelow(false);setOnlyAbove(false)}}><${Icon} name="circle-help"/>Sem previsão ${withoutForecastCount?`(${withoutForecastCount})`:''}</button>${isFiltered&&html`<button className="clear" onClick=${clearFilters}><${Icon} name="x"/>Limpar</button>`}<span>${isFiltered?`Exibindo ${rowData.length} de ${allRowData.length} fornecedores`:`${allRowData.length} fornecedores em ordem alfabética`}</span></div>

      ${rowData.length===0 && isFiltered ? html`<div className="filtered-empty"><${Icon} name="search-x"/><div><strong>Nenhum fornecedor nesta seleção.</strong><span>Limpe os filtros para voltar à Receita completa.</span></div><button className="button secondary" onClick=${clearFilters}>Limpar filtros</button></div>` : null}

      ${rowData.length>0 && html`<section className="mobile-competence-only mobile-revenue-mode"><div className="mobile-competence-bar"><button aria-label="Mês anterior" disabled=${mobileMonth===0} onClick=${()=>shiftMobileMonth(-1)}><${Icon} name="chevron-left"/></button><label><small>Competência</small><select value=${mobileMonth} onChange=${event=>setMobileMonth(Number(event.target.value))}>${OFFICIAL_MONTHS.map(([,label],index)=>html`<option value=${index}>${label} 2026${index===currentRevenueMonth?' · em andamento':''}</option>`)}</select></label><button aria-label="Próximo mês" disabled=${mobileMonth===11} onClick=${()=>shiftMobileMonth(1)}><${Icon} name="chevron-right"/></button></div><div className="mobile-month-summary"><span><small>Confirmado em ${OFFICIAL_MONTHS[mobileMonth][1]}</small><strong>${money(mobileMonthTotal)}</strong></span><span><small>Fornecedores exibidos</small><strong>${mobileRows.length}</strong></span></div><div className="mobile-revenue-list">${mobileRows.map(row=>{const item=row.monthStatus[mobileMonth]; const confirmed=Number(row.months[mobileMonth]||0); return html`<article className="mobile-revenue-card"><header><button onClick=${()=>context.openSupplier(row.name)}><strong>${row.name}</strong><${Icon} name="panel-right-open"/></button><span className=${cellState(item)}>${cellState(item)==='confirmed'?'Confirmado':cellState(item)==='open'?'Pendente':'Sem movimento'}</span></header><div className="mobile-revenue-kpis"><span><small>Mês</small><button onClick=${()=>context.navigatePayments({year:2026,month:mobileMonth,supplier:row.name})}>${confirmed?money(confirmed):'—'}</button></span><span><small>Previsão anual</small>${forecastCell(row)}</span><span><small>Total anual</small><strong>${money(row.total)}</strong></span></div><div className="mobile-revenue-progress">${row.pct===null?html`<span className="no-forecast-chip">Sem previsão</span>`:html`<span>${Math.round(row.pct)}% da previsão</span>`}${item.open>0&&html`<small>${money(item.open)} pendente nesta competência</small>`}</div></article>`;})}</div></section>`}

      ${rowData.length>0 && html`<div className="desktop-sheet-only"><${EasySheetNavigator} scrollRef=${revenueScrollRef} focusSelector=".revenue-live-sheet thead .current-month-col" focusLabel="Mês atual"/></div>`}
      ${rowData.length>0 && html`<article className="spreadsheet-card revenue-card desktop-sheet-only"><div className="spreadsheet-scroll assisted-scroll" ref=${revenueScrollRef}><table className="live-sheet revenue-live-sheet"><thead><tr><th className="sticky-first supplier-col">FORNECEDORES</th><th className="forecast-col">PREVISÃO</th>${OFFICIAL_MONTHS.map(([,label], monthIndex) => html`<th className=${monthIndex === currentRevenueMonth ? 'current-month-col' : ''}>${label.toUpperCase()}${monthIndex===currentRevenueMonth?html`<small>em andamento</small>`:''}</th>`)}<th className="total-head">TOTAL</th><th className="balance-head">DIFERENÇA VS. PREVISÃO</th><th>%</th></tr></thead><tbody>
        ${rowData.map(row => html`<tr><th className="sticky-first supplier-col"><button onClick=${() => context.openSupplier(row.name)}>${row.name}<${Icon} name="panel-right-open"/></button></th><td className="forecast-col">${forecastCell(row)}</td>${row.months.map((value,monthIndex) => {
          const item = row.monthStatus[monthIndex]; const state = cellState(item); const label = OFFICIAL_MONTHS[monthIndex][1];
          return html`<td className=${`derived-revenue-td ${state} ${monthIndex === currentRevenueMonth ? 'current-month-col' : ''}`}><button className="derived-revenue-cell" title=${cellTitle(item,label)} onClick=${() => context.navigatePayments({ year:2026, month:monthIndex, supplier:row.name })}><span>${value ? money(value) : '—'}</span><i></i></button></td>`;
        })}<td className="row-total">${money(row.total)}</td>${varianceCell(row)}<td>${progressCell(row)}</td></tr>`)}
        ${Math.abs(sourceAdjustmentTotal) > .005 && !isFiltered && html`<tr className="source-adjustment-row"><th className="sticky-first supplier-col"><span>AJUSTES DA FONTE</span><small>Marcadores sem fornecedor no MKTG</small></th><td className="forecast-col">—</td>${sourceAdjustments.map((value,monthIndex)=>html`<td className=${monthIndex===currentRevenueMonth?'current-month-col':''}>${Math.abs(value)>.005?money(value):'—'}</td>`)}<td className="row-total">${money(sourceAdjustmentTotal)}</td><td className="balance-cell on-target"><span className="variance-value">Fonte</span><small>SOMA MENSAL</small></td><td>—</td></tr>`}
      </tbody><tfoot><tr><th className="sticky-first">${isFiltered?'TOTAL EXIBIDO':'SOMA MENSAL'}</th><th>${money(sum(rowData,row=>row.forecast))}</th>${OFFICIAL_MONTHS.map((_,monthIndex)=>html`<th className=${monthIndex===currentRevenueMonth?'current-month-col':''}>${money(sum(rowData,row=>row.months[monthIndex]))}</th>`)}<th>${money(sum(rowData,row=>row.total))}</th><th>${isFiltered?'Seleção filtrada':totalReceived-totalForecast > .005 ? `+ ${money(totalReceived-totalForecast)} acima` : totalReceived-totalForecast < -.005 ? `${money(Math.abs(totalReceived-totalForecast))} abaixo` : 'Meta atingida'}</th><th>${sum(rowData,row=>row.forecast)>0?`${Math.round(sum(rowData,row=>row.total)/sum(rowData,row=>row.forecast)*100)}%`:'—'}</th></tr></tfoot></table></div></article>`}
      <div className="sheet-footnote revenue-footnote"><${Icon} name="shield-check"/><span><strong>Base reconciliada:</strong> o MKTG 2026 continua como referência histórica, mas confirmações novas feitas em Pagamentos entram imediatamente no realizado. Linhas são conciliadas individualmente para evitar que dois lançamentos do mesmo fornecedor e mês compartilhem a mesma confirmação. Totais compostos por múltiplas previsões são protegidos contra edição consolidada incorreta.</span></div>
    </section>`;
  }

  function ClosingView({ context }) {
    const marketingRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.controle === 'marketing' && record.natureza === 'receita' && record.impacta_totais !== false && hasTag(record, 'fornecedores') && record.status !== 'cancelado');
    const marketingIds = new Set(marketingRecords.map(record => record.id));
    const availableMonths = useMemo(() => uniq(context.payments.filter(payment => payment.status === 'pago' && marketingIds.has(payment.registro_id)).map(paymentMonthKey)).filter(Boolean).sort(), [context.payments, marketingRecords.length]);
    const [chosenMonth, setChosenMonth] = useState('');
    const month = chosenMonth || availableMonths.at(-1) || '2026-01';
    const marketingBySupplier = new Map();
    marketingRecords.forEach(record => {
      const value = sum(realizedPayments(context.payments, record.id).filter(payment => paymentMonthKey(payment) === month), paymentValue);
      if (value <= 0 || !record.fornecedor) return; const key=supplierKey(record.fornecedor); const row=marketingBySupplier.get(key)||{name:record.fornecedor,value:0,records:[]}; row.value += value; row.records.push(record); marketingBySupplier.set(key,row);
    });
    const marcosRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.controle === 'marcos' && record.natureza === 'receita' && record.impacta_totais !== false && hasTag(record, 'previsão') && record.status !== 'cancelado');
    const marcosBySupplier = new Map();
    marcosRecords.forEach(record => { const value=sum(realizedPayments(context.payments, record.id).filter(payment => paymentMonthKey(payment) === month), paymentValue); if (value>0 && record.fornecedor) marcosBySupplier.set(supplierKey(record.fornecedor),(marcosBySupplier.get(supplierKey(record.fornecedor))||0)+value); });
    const detailRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.controle === 'marketing' && hasTag(record,'centro-custo') && !hasTag(record,'legado-fora-coluna-valor') && String(record.data_inicio || '').startsWith(month));
    const detailBySupplier = new Map();
    detailRecords.forEach(record => { const key=supplierKey(record.fornecedor); const rows=detailBySupplier.get(key)||[]; rows.push(record); detailBySupplier.set(key,rows); });
    const competence = monthKeyToDate(month);
    const conferenceBySupplier = new Map((context.conferences || []).filter(item => String(item.competencia || '').slice(0,7) === month).map(item => [supplierKey(item.fornecedor), item]));
    const rows = [...marketingBySupplier.entries()].map(([key,row]) => ({ ...row, key, marcos:Number(marcosBySupplier.get(key)||0), conference:conferenceBySupplier.get(key), details:detailBySupplier.get(key)||[] })).sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
    const total = sum(rows,row=>row.value); const referenceTotal=sum(rows,row=>row.marcos); const signed=rows.filter(row=>row.conference?.status==='conferido').length; const divergent=rows.filter(row=>row.conference?.status==='divergente').length;
    useLucide([month, rows.length, signed, divergent]);
    const save = (row,status) => context.saveConference({ competencia:competence, fornecedor:row.name, status, valor:row.value, observacoes:status === 'divergente' ? `Divergência com referência MKTG: ${money(row.marcos)}. Marketing: ${money(row.value)}.` : `Conferido contra fechamento do Marketing em ${monthLong(month)}.` });
    return html`<section className="management-section closing-view"><div className="management-hero closing-hero"><div><span className="eyebrow light">Fechamento mensal</span><h2>Marketing lança.<br/>Marcos confere.</h2><p>O valor realizado nasce uma vez no Marketing. Aqui ele aparece em ordem alfabética, com o de-para da planilha do Marcos e assinatura de conferência.</p></div><label className="closing-month"><span>Competência</span><select value=${month} onChange=${event=>setChosenMonth(event.target.value)}>${availableMonths.length ? availableMonths.map(key=>html`<option value=${key}>${monthLong(key)}</option>`) : html`<option value=${month}>${monthLong(month)}</option>`}</select></label></div>
      ${context.conferencesSetupMissing && html`<div className="management-setup-warning"><${Icon} name="database-zap"/><div><strong>Conferência ainda não ativada no Supabase</strong><p>Execute <code>sql/11-GESTAO-MKT-V1.3.0.sql</code>. A leitura funciona sem ele; a assinatura fica bloqueada.</p></div></div>`}
      <div className="closing-kpis"><span><small>Fechamento Marketing</small><strong>${money(total)}</strong></span><span><small>Referência MKTG</small><strong>${money(referenceTotal)}</strong></span><span><small>Conferidos</small><strong>${signed}/${rows.length}</strong></span><span className=${divergent ? 'danger' : ''}><small>Divergências</small><strong>${divergent}</strong></span></div>
      <article className="management-panel"><div className="panel-heading compact"><div><span className="eyebrow">De-para mensal</span><h2>${monthLong(month)}</h2><p>Fornecedor por fornecedor, exatamente na ordem em que a conferência precisa acontecer.</p></div><span className="management-chip">${rows.length} fornecedores</span></div>${rows.length ? html`<div className="closing-table-wrap"><table className="closing-table"><thead><tr><th>Fornecedor</th><th>Centros de custo</th><th>Marketing</th><th>Referência Marcos</th><th>Diferença</th><th>Conferência</th></tr></thead><tbody>${rows.map(row=>{ const diff=row.value-row.marcos; const status=row.conference?.status||'pendente'; return html`<tr className=${status}><td><strong>${row.name}</strong><small>${row.records.length} lançamento(s)</small></td><td><div className="cost-chips">${row.details.length ? row.details.map(detail=>html`<span className=${hasTag(detail,'adicional-investimento')?'extra':''}>${detail.centro_custo || category(detail.categoria).label}<b>${money(detail.valor_acordado)}</b></span>`) : html`<em>Sem abertura</em>`}</div></td><td><strong>${money(row.value)}</strong></td><td>${row.marcos ? money(row.marcos) : html`<span className="muted-value">Sem valor</span>`}</td><td><span className=${Math.abs(diff)>.01?'diff danger':'diff ok'}>${money(diff)}</span></td><td>${status==='conferido' ? html`<span className="signed-pill"><${Icon} name="badge-check"/>Assinado<small>${row.conference?.conferido_em ? dateTime(row.conference.conferido_em) : ''}</small></span>` : html`<div className="conference-actions"><button className="button primary small" disabled=${context.saving || context.conferencesSetupMissing} onClick=${()=>save(row,'conferido')}><${Icon} name="signature"/>Assinar</button><button className=${`icon-button ${status==='divergente'?'divergent':''}`} title="Marcar divergência" disabled=${context.saving || context.conferencesSetupMissing} onClick=${()=>save(row,'divergente')}><${Icon} name="triangle-alert"/></button></div>`}</td></tr>`;})}</tbody></table></div>` : html`<${MiniEmpty} icon="calendar-x" title="Nenhum fechamento nesta competência" text="Importe a planilha de fornecedores ou escolha outro mês."/>`}</article>
    </section>`;
  }

  function RecordsView({ context }) {
    const { records, payments, openRecord, editRecord, newRecord } = context;
    const [status, setStatus] = useState('todos'); const [categoryFilter, setCategoryFilter] = useState('todos'); const [layout, setLayout] = useState('table');
    const [pageSize, setPageSize] = useState(150);
    const filtered = records.filter(record => (status === 'todos' || record.status === status) && (categoryFilter === 'todos' || record.categoria === categoryFilter));
    const visible = filtered.slice(0, pageSize);
    useLucide([status, categoryFilter, layout, filtered.length]);
    return html`<section className="records-section"><div className="view-tools"><div className="view-tools-copy"><span className="eyebrow">Base unificada</span><h2>Todos os acompanhamentos</h2><p>Marcos e Marketing trabalhando sobre a mesma fonte de verdade.</p></div><div className="view-tools-actions"><label className="compact-select"><${Icon} name="list-filter"/><select value=${status} onChange=${e => setStatus(e.target.value)}><option value="todos">Todos os status</option>${Object.entries(RECORD_STATUS).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></label><label className="compact-select"><${Icon} name="shapes"/><select value=${categoryFilter} onChange=${e => setCategoryFilter(e.target.value)}><option value="todos">Todas as categorias</option>${Object.entries(CATEGORIES).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></label><div className="layout-toggle"><button className=${layout === 'table' ? 'active' : ''} onClick=${() => setLayout('table')}><${Icon} name="list"/></button><button className=${layout === 'cards' ? 'active' : ''} onClick=${() => setLayout('cards')}><${Icon} name="layout-grid"/></button></div></div></div>
      ${filtered.length ? html`${layout === 'table' ? html`<div className="records-table-wrap"><table className="records-table"><thead><tr><th>Acompanhamento</th><th>Controle</th><th>Categoria</th><th>Status</th><th>Financeiro</th><th>Próximo vencimento</th><th></th></tr></thead><tbody>${visible.map(record => html`<${RecordRow} key=${record.id} record=${record} payments=${payments.filter(item => item.registro_id === record.id)} onOpen=${() => openRecord(record)} onEdit=${() => editRecord(record)}/>` )}</tbody></table></div>` : html`<div className="record-card-grid">${visible.map(record => html`<${RecordCard} key=${record.id} record=${record} onOpen=${() => openRecord(record)}/>` )}</div>`}${filtered.length > visible.length && html`<div className="load-more"><span>Exibindo ${int(visible.length)} de ${int(filtered.length)}</span><button className="button secondary" onClick=${() => setPageSize(size => size + 150)}><${Icon} name="chevrons-down"/>Carregar mais 150</button></div>`}` : html`<div className="large-empty"><span><${Icon} name="telescope" size=${34}/></span><h3>Nenhum acompanhamento nesta visão</h3><p>Ajuste os filtros ou cadastre o primeiro item.</p><button className="button primary" onClick=${newRecord}><${Icon} name="plus"/>Novo acompanhamento</button></div>`}</section>`;
  }

  function RecordRow({ record, onOpen, onEdit }) {
    const meta = category(record.categoria); const finance = record.situacao_financeira || 'sem_pagamentos'; const nature = NATURES[record.natureza] || NATURES.neutro;
    return html`<tr onClick=${onOpen}><td><div className="record-title-cell"><span className=${`category-mark ${meta.tone}`}><${Icon} name=${meta.icon}/></span><div><strong>${record.fornecedor || 'Sem fornecedor'}</strong><p>${record.titulo}</p><small>#${record.codigo || '—'} · ${record.ano_referencia}${record.impacta_totais === false ? ' · detalhamento' : ''}</small></div></div></td><td><span className=${`control-pill ${record.controle}`}><i></i>${record.controle === 'marcos' ? 'Marcos' : 'Marketing'}</span></td><td><span className="plain-category">${meta.label}</span><span className=${`nature-pill ${nature.tone}`}><${Icon} name=${nature.icon}/>${nature.label}</span></td><td><span className=${`status-pill ${record.status}`}><i></i>${RECORD_STATUS[record.status]?.label || record.status}</span></td><td><div className="finance-cell"><strong>${money(record.valor_acordado)}</strong><span className=${`finance-label ${finance}`}>${FINANCE_STATUS[finance] || finance}</span></div></td><td><span className=${record.pagamentos_atrasados ? 'date-alert' : ''}>${record.proximo_vencimento ? date(record.proximo_vencimento) : '—'}</span></td><td><button className="row-action" onClick=${event => { event.stopPropagation(); onEdit(); }}><${Icon} name="pencil"/></button></td></tr>`;
  }

  function RecordCard({ record, onOpen }) {
    const meta = category(record.categoria); const nature = NATURES[record.natureza] || NATURES.neutro; const progress = record.valor_acordado ? Math.min(100, (Number(record.total_pago) / Number(record.valor_acordado)) * 100) : 0;
    return html`<button className="record-card" onClick=${onOpen}><div className="record-card-top"><span className=${`category-mark ${meta.tone}`}><${Icon} name=${meta.icon}/></span><span className=${`control-pill ${record.controle}`}><i></i>${record.controle === 'marcos' ? 'Marcos' : 'Marketing'}</span></div><span className="record-code">#${record.codigo || '—'} · ${record.ano_referencia}${record.impacta_totais === false ? ' · DETALHE' : ''}</span><h3>${record.fornecedor || record.titulo}</h3><p>${record.fornecedor ? record.titulo : record.referencia || 'Acompanhamento PMG'}</p><div className="record-card-meta"><span className=${`status-pill ${record.status}`}><i></i>${RECORD_STATUS[record.status]?.label || record.status}</span><span className=${`nature-pill ${nature.tone}`}><${Icon} name=${nature.icon}/>${nature.label}</span></div><div className="record-card-value"><span><small>Valor acompanhado</small><strong>${money(record.valor_acordado)}</strong></span><b>${Math.round(progress)}%</b></div><div className="record-progress"><i style=${{ width:`${progress}%` }}></i></div><div className="record-card-foot"><span>${record.proximo_vencimento ? `Próximo: ${date(record.proximo_vencimento)}` : 'Sem parcelas futuras'}</span><${Icon} name="arrow-up-right"/></div><div className="card-glow"></div></button>`;
  }

  function FinanceView({ context }) {
    const { records, payments, openRecord, newPayment } = context; const recordMap = Object.fromEntries(context.allRecords.map(item => [item.id, item]));
    const allowed = new Set(records.map(item => item.id)); const visible = payments.filter(item => allowed.has(item.registro_id));
    const [paymentStatus, setPaymentStatus] = useState('abertos'); const [month, setMonth] = useState('todos');
    const months = uniq(visible.map(item => item.vencimento?.slice(0, 7))).sort().reverse();
    const filtered = visible.filter(item => (month === 'todos' || item.vencimento?.startsWith(month)) && (paymentStatus === 'todos' || paymentStatus === 'abertos' ? (paymentStatus === 'todos' || !['pago', 'cancelado'].includes(item.status)) : item.status === paymentStatus)).sort((a, b) => String(a.vencimento || '9999').localeCompare(String(b.vencimento || '9999')));
    const due = sum(visible.filter(item => !['pago', 'cancelado'].includes(item.status)), item => item.valor_previsto);
    const paid = sum(visible.filter(item => item.status === 'pago'), item => item.valor_pago || item.valor_previsto);
    const overdue = visible.filter(isOverdue);
    useLucide([paymentStatus, month, visible.length]);
    return html`<section className="finance-section"><div className="finance-hero"><div><span className="eyebrow light">Radar financeiro PMG</span><h2>O futuro dos pagamentos,<br/>sem surpresa no vencimento.</h2><p>Acompanhe previsões, aprovações e baixas em uma linha do tempo única.</p></div><div className="finance-hero-numbers"><span><small>Em aberto</small><strong>${money(due)}</strong></span><span><small>Realizado</small><strong>${money(paid)}</strong></span><span className=${overdue.length ? 'danger' : ''}><small>Atrasados</small><strong>${int(overdue.length)}</strong></span></div><div className="finance-orbit"><i></i><i></i><span><${Icon} name="wallet-cards" size=${32}/></span></div></div>
      <div className="view-tools finance-tools"><div><span className="eyebrow">Agenda de parcelas</span><h2>${int(filtered.length)} lançamentos encontrados</h2></div><div className="view-tools-actions"><label className="compact-select"><${Icon} name="calendar"/><select value=${month} onChange=${e => setMonth(e.target.value)}><option value="todos">Todos os meses</option>${months.map(item => html`<option value=${item}>${new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric' }).format(new Date(`${item}-01T12:00:00`))}</option>`)}</select></label><label className="compact-select"><${Icon} name="circle-dollar-sign"/><select value=${paymentStatus} onChange=${e => setPaymentStatus(e.target.value)}><option value="abertos">Somente em aberto</option><option value="todos">Todos os lançamentos</option>${Object.entries(PAYMENT_STATUS).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></label><button className="button primary" onClick=${() => newPayment(null)}><${Icon} name="plus"/>Nova parcela</button></div></div>
      <div className="payment-timeline">${filtered.length ? filtered.map(payment => { const record = recordMap[payment.registro_id]; const overdueItem = isOverdue(payment); return html`<article key=${payment.id} className=${`payment-row ${overdueItem ? 'overdue' : ''} ${payment.status}`} onClick=${() => record && openRecord(record)}><div className="payment-date"><b>${payment.vencimento ? payment.vencimento.slice(8, 10) : '—'}</b><span>${payment.vencimento ? monthLabel(new Date(`${payment.vencimento}T12:00:00`)) : 'sem data'}</span></div><span className="payment-line"><i></i></span><div className="payment-main"><div><span className=${`payment-status ${overdueItem ? 'atrasado' : payment.status}`}><${Icon} name=${overdueItem ? 'triangle-alert' : PAYMENT_STATUS[payment.status]?.icon || 'clock'}/>${overdueItem ? 'Atrasado' : PAYMENT_STATUS[payment.status]?.label || payment.status}</span><h3>${record?.fornecedor || record?.titulo || 'Acompanhamento'}</h3><p>${payment.descricao || `Parcela ${payment.parcela}`} · ${record?.titulo || ''}</p></div><div className="payment-amount"><strong>${money(payment.valor_previsto)}</strong><span>${payment.forma_pagamento || 'Forma a definir'}</span></div><button className="row-action" onClick=${event => { event.stopPropagation(); context.editPayment(payment); }}><${Icon} name="pencil"/></button></div></article>`; }) : html`<div className="large-empty"><span><${Icon} name="calendar-check-2" size=${34}/></span><h3>Nenhuma parcela nesta seleção</h3><p>Cadastre uma previsão para preencher a agenda.</p></div>`}</div></section>`;
  }

  function SupplierDrawer({ supplier, context, onClose }) {
    const [tab,setTab]=useState('resumo');
    const all=context.allRecords.filter(record=>supplierKey(record.fornecedor)===supplierKey(supplier)&&record.status!=='cancelado');
    const supplierRows=all.filter(record=>Number(record.ano_referencia)===2026&&isSupplierRevenueRecord(record));
    const forecastRows=context.allRecords.filter(record=>Number(record.ano_referencia)===2026&&record.controle==='marcos'&&record.natureza==='receita'&&hasTag(record,'previsão')&&supplierKey(record.fornecedor)===supplierKey(supplier)&&record.status!=='cancelado');
    const forecast=sum(forecastRows,record=>record.valor_acordado);
    const liveRevenue=liveRevenueSnapshot(context.allRecords,context.payments,context.conferences,2026); const liveSupplier=liveRevenue.bySupplier.get(supplierKey(supplier));
    const months=OFFICIAL_MONTHS.map(([,label],index)=>{const rows=supplierRows.filter(record=>sourceMonthIndex(record)===index);const expected=sum(rows,record=>record.valor_acordado);const localConfirmed=sum(rows.filter(record=>supplierRowConfirmed(record,supplierRowPayment(context.payments,record,2026,index))),record=>supplierConfirmedValue(record,supplierRowPayment(context.payments,record,2026,index)));const confirmed=liveSupplier?Number(liveSupplier.months[index]||0):localConfirmed;return{index,label,rows,expected,confirmed,pct:expected?Math.min(100,confirmed/expected*100):0};});
    const confirmed=sum(months,item=>item.confirmed); const difference=confirmed-forecast;
    const recordIds=new Set(all.map(record=>record.id)); const activities=context.activities.filter(item=>recordIds.has(item.registro_id)).sort((a,b)=>String(b.criado_em||'').localeCompare(String(a.criado_em||''))).slice(0,40);
    const lines=supplierRows.sort((a,b)=>sourceMonthIndex(a)-sourceMonthIndex(b)||Number(a.linha_origem||9999)-Number(b.linha_origem||9999));
    useEffect(()=>{document.body.classList.add('drawer-open');return()=>document.body.classList.remove('drawer-open');},[]);
    useLucide([supplier,tab,lines.length,activities.length]);
    return html`<div className="supplier-drawer-shell" onMouseDown=${event => event.target === event.currentTarget && onClose()}><button className="drawer-backdrop" onClick=${onClose} aria-label="Fechar"></button><aside className="supplier-drawer" onMouseDown=${event => event.stopPropagation()} onClick=${event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label=${`Detalhes de ${supplier}`}> <header><div className="supplier-drawer-identity"><span>${supplier.charAt(0)}</span><div><small>FORNECEDOR · 2026</small><h2>${supplier}</h2><p>${lines.length} lançamento(s) na planilha de pagamentos</p></div></div><button className="icon-button" onClick=${onClose}><${Icon} name="x"/></button></header><section className="supplier-drawer-kpis"><div><small>Previsão</small><strong>${money(forecast)}</strong></div><div className="confirmed"><small>Confirmado</small><strong>${money(confirmed)}</strong></div><div className=${difference>=0?'above':'below'}><small>Vs. previsão</small><strong>${difference>=0?'+ ':''}${money(difference)}</strong></div></section><nav>${[['resumo','Visão geral'],['pagamentos','Pagamentos'],['historico','Histórico']].map(([key,label])=>html`<button className=${tab===key?'active':''} onClick=${()=>setTab(key)}>${label}</button>`)}</nav><div className="supplier-drawer-body">
      ${tab==='resumo'&&html`<div className="supplier-summary-stack"><div className="supplier-month-grid">${months.map(item=>html`<button className=${item.confirmed>=item.expected&&item.expected?'complete':item.confirmed?'partial':item.expected?'pending':'empty'} onClick=${()=>{context.navigatePayments({year:2026,month:item.index,supplier});onClose();}}><span>${item.label.slice(0,3)}</span><strong>${item.expected?`${Math.round(item.pct)}%`:'—'}</strong><small>${item.expected?compactMoney(item.confirmed):'sem dados'}</small></button>`)}</div><button className="supplier-primary-action" onClick=${()=>{const latest=[...months].reverse().find(item=>item.rows.length)?.index??new Date().getMonth();context.navigatePayments({year:2026,month:latest,supplier});onClose();}}><${Icon} name="table-2"/><span><strong>Abrir linhas deste fornecedor</strong><small>Planilha de Pagamentos já filtrada</small></span><${Icon} name="arrow-right"/></button></div>`}
      ${tab==='pagamentos'&&html`<div className="supplier-payment-list">${lines.length?lines.map(record=>{const monthIndex=sourceMonthIndex(record);const payment=supplierRowPayment(context.payments,record,2026,monthIndex);const confirmedRow=supplierRowConfirmed(record,payment);return html`<button onClick=${()=>{context.navigatePayments({year:2026,month:monthIndex,supplier});onClose();}}><span className=${confirmedRow?'ok':'pending'}>${confirmedRow?'✓':'○'}</span><div><strong>${OFFICIAL_MONTHS[monthIndex][1]} · ${record.referencia||'COTA'}</strong><small>${payment?.numero_documento||record.numero_documento||'Sem NF'} · ${confirmedRow?'Confirmado':'Pendente'}</small></div><b>${money(record.valor_acordado)}</b><${Icon} name="chevron-right"/></button>`;}):html`<div className="overview-empty">Sem linhas de pagamento em 2026.</div>`}</div>`}
      ${tab==='historico'&&html`<div className="supplier-history-list">${activities.length?activities.map(activity=>html`<div><span><${Icon} name=${activity.tipo?.includes('pagamento')?'receipt-text':'history'}/></span><div><strong>${activity.resumo||'Atualização'}</strong><small>${dateTime(activity.criado_em)}</small></div></div>`):all.slice(0,30).map(record=>html`<button onClick=${()=>context.openRecord(record)}><span><${Icon} name="file-text"/></span><div><strong>${record.titulo}</strong><small>${record.ano_referencia} · ${category(record.categoria).label}</small></div><b>${money(record.valor_acordado)}</b></button>`)}</div>`}
      </div></aside></div>`;
  }

  function ModalShell({ title, eyebrow, icon, onClose, children, wide = false }) {
    useEffect(() => {
      const close = event => { if (event.key === 'Escape') onClose(); };
      document.addEventListener('keydown', close); document.body.classList.add('modal-open');
      return () => { document.removeEventListener('keydown', close); document.body.classList.remove('modal-open'); };
    }, [onClose]);
    useLucide([title]);
    return html`<div className="modal-backdrop" onMouseDown=${event => event.target === event.currentTarget && onClose()}><section className=${`ac-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true"><header><span className="modal-title-icon"><${Icon} name=${icon}/></span><div><span className="eyebrow">${eyebrow}</span><h2>${title}</h2></div><button className="icon-button" onClick=${onClose}><${Icon} name="x"/></button></header>${children}</section></div>`;
  }

  function Field({ label, hint, wide = false, children }) {
    return html`<label className=${`form-field ${wide ? 'wide' : ''}`}><span>${label}${hint && html`<small>${hint}</small>`}</span>${children}</label>`;
  }

  function RecordModal({ record, collaborators, onClose, onSave, saving }) {
    const editing = Boolean(record.id);
    const submit = event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const payload = {
        controle:form.get('controle'), ano_referencia:Number(form.get('ano_referencia')),
        fornecedor:form.get('fornecedor'), fornecedor_codigo:form.get('fornecedor_codigo'), natureza:form.get('natureza'),
        impacta_totais:form.get('impacta_totais') === 'on', categoria:form.get('categoria'),
        titulo:form.get('titulo'), descricao:form.get('descricao'), referencia:form.get('referencia'), responsavel_id:form.get('responsavel_id') || null,
        contato_nome:form.get('contato_nome'), contato_email:form.get('contato_email'), contato_telefone:form.get('contato_telefone'),
        status:form.get('status'), prioridade:form.get('prioridade'), data_inicio:form.get('data_inicio'), data_fim:form.get('data_fim'),
        valor_acordado:parseMoney(form.get('valor_acordado')), centro_custo:form.get('centro_custo'), numero_documento:form.get('numero_documento'),
        tags:String(form.get('tags') || '').split(',').map(item => item.trim()).filter(Boolean), observacoes:form.get('observacoes')
      };
      onSave(payload, record.id);
    };
    return html`<${ModalShell} title=${editing ? 'Editar acompanhamento' : 'Novo acompanhamento'} eyebrow=${editing ? `Registro #${record.codigo || ''}` : 'Controle unificado'} icon=${editing ? 'pencil-line' : 'sparkles'} onClose=${onClose} wide=${true}><form className="ac-form" onSubmit=${submit}><div className="form-section"><div className="form-section-title"><span>01</span><div><strong>Identificação</strong><small>Onde este acompanhamento aparece</small></div></div><div className="form-grid">
      <${Field} label="Controle"><select name="controle" defaultValue=${record.controle || 'marketing'} required><option value="marketing">Marketing / Fornecedores</option><option value="marcos">Marcos / Presidência</option></select></${Field}>
      <${Field} label="Ano de referência"><input name="ano_referencia" type="number" min="2000" max="2200" defaultValue=${record.ano_referencia || new Date().getFullYear()} required/></${Field}>
      <${Field} label="Fornecedor / parceiro"><input name="fornecedor" defaultValue=${record.fornecedor || ''} placeholder="Ex.: Aurora"/></${Field}>
      <${Field} label="Código do fornecedor"><input name="fornecedor_codigo" defaultValue=${record.fornecedor_codigo || ''} placeholder="Opcional"/></${Field}>
      <${Field} label="Categoria"><select name="categoria" defaultValue=${record.categoria || 'outro'}>${Object.entries(CATEGORIES).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></${Field}>
      <${Field} label="Natureza financeira"><select name="natureza" defaultValue=${record.natureza || 'neutro'}>${Object.entries(NATURES).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></${Field}>
      <${Field} label="Responsável"><select name="responsavel_id" defaultValue=${record.responsavel_id || ''}><option value="">Sem responsável</option>${collaborators.map(item => html`<option value=${item.id}>${item.nome}</option>`)}</select></${Field}>
      <${Field} label="Indicadores"><div className="impact-toggle"><input name="impacta_totais" type="checkbox" defaultChecked=${record.impacta_totais !== false}/><span><i></i></span><b>Incluir nos totais</b></div></${Field}>
      <${Field} label="Título do acompanhamento" wide=${true}><input name="titulo" defaultValue=${record.titulo || ''} placeholder="Ex.: Plano anual de parceria 2026" required autoFocus/></${Field}>
      <${Field} label="A que se refere" wide=${true}><input name="referencia" defaultValue=${record.referencia || ''} placeholder="Descreva a finalidade ou origem do compromisso"/></${Field}>
      <${Field} label="Descrição completa" wide=${true}><textarea name="descricao" rows="3" defaultValue=${record.descricao || ''} placeholder="Contexto, entregas, contrapartidas e informações úteis..."></textarea></${Field}>
      </div></div><div className="form-section"><div className="form-section-title"><span>02</span><div><strong>Execução e valores</strong><small>Andamento, datas e compromisso financeiro</small></div></div><div className="form-grid">
      <${Field} label="Status"><select name="status" defaultValue=${record.status || 'rascunho'}>${Object.entries(RECORD_STATUS).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></${Field}>
      <${Field} label="Prioridade"><select name="prioridade" defaultValue=${record.prioridade || 'normal'}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></${Field}>
      <${Field} label="Data inicial"><input name="data_inicio" type="date" defaultValue=${record.data_inicio || ''}/></${Field}>
      <${Field} label="Data final"><input name="data_fim" type="date" defaultValue=${record.data_fim || ''}/></${Field}>
      <${Field} label="Valor acordado"><div className="money-input"><span>R$</span><input name="valor_acordado" inputMode="decimal" defaultValue=${record.valor_acordado || ''} placeholder="0,00"/></div></${Field}>
      <${Field} label="Centro de custo *"><input name="centro_custo" defaultValue=${record.centro_custo || ''} placeholder="Ex.: Cota, Incentivo, MTRIX, Evento..." required/></${Field}>
      <${Field} label="Documento / pedido"><input name="numero_documento" defaultValue=${record.numero_documento || ''} placeholder="NF, pedido, contrato..."/></${Field}>
      <${Field} label="Tags" hint="separe por vírgula"><input name="tags" defaultValue=${(record.tags || []).join(', ')} placeholder="diretoria, cota, 2026"/></${Field}>
      </div></div><div className="form-section"><div className="form-section-title"><span>03</span><div><strong>Contato e observações</strong><small>Informações para ninguém depender de mensagem antiga</small></div></div><div className="form-grid">
      <${Field} label="Nome do contato"><input name="contato_nome" defaultValue=${record.contato_nome || ''}/></${Field}>
      <${Field} label="E-mail"><input name="contato_email" type="email" defaultValue=${record.contato_email || ''}/></${Field}>
      <${Field} label="Telefone"><input name="contato_telefone" defaultValue=${record.contato_telefone || ''}/></${Field}>
      <${Field} label="Observações internas" wide=${true}><textarea name="observacoes" rows="3" defaultValue=${record.observacoes || ''}></textarea></${Field}>
      </div></div><footer className="modal-footer"><button type="button" className="button secondary" onClick=${onClose}>Cancelar</button><button type="submit" className="button primary" disabled=${saving}>${saving ? html`<span className="spinner"></span>` : html`<${Icon} name="save"/>`}${editing ? 'Salvar alterações' : 'Criar acompanhamento'}</button></footer></form></${ModalShell}>`;
  }

  function ForecastGroupModal({ group, context, onClose }) {
    const ids = new Set(group?.recordIds || []);
    const rows = context.allRecords.filter(record => ids.has(record.id)).sort((a,b)=>String(a.titulo||a.referencia||'').localeCompare(String(b.titulo||b.referencia||''),'pt-BR'));
    const total = sum(rows,record=>record.valor_acordado);
    return html`<${ModalShell} title=${group?.supplier || 'Previsão'} eyebrow="Previsão consolidada · origens" icon="layers-3" onClose=${onClose}><div className="forecast-breakdown"><div className="forecast-breakdown-summary"><span><small>Total consolidado</small><strong>${money(total)}</strong></span><p>Este fornecedor possui ${rows.length} registros de previsão. Edite cada origem separadamente para preservar a composição do total.</p></div><div className="forecast-breakdown-list">${rows.map((record,index)=>html`<article><span>${String(index+1).padStart(2,'0')}</span><div><strong>${record.referencia || record.titulo || `Previsão ${index+1}`}</strong><small>${record.titulo && record.titulo !== record.referencia ? record.titulo : 'MKTG 2026'}</small></div><${EditableSheetCell} type="money" value=${Number(record.valor_acordado||0)} disabled=${context.saving} onSave=${value=>context.quickUpdateRecord(record,{valor_acordado:value},'Previsão atualizada.')}/></article>`)}</div><div className="integrity-note"><${Icon} name="shield-check"/><span>A soma exibida na Receita é recalculada automaticamente após cada alteração.</span></div></div></${ModalShell}>`;
  }

  function SupplierRowModal({ defaults = {}, records, onClose, onSave, saving }) {
    const yearValue = Number(defaults.ano_referencia || 2026);
    const monthIndex = Math.max(0, Math.min(11, Number(defaults.monthIndex ?? new Date().getMonth())));
    const [type,setType] = useState(defaults.tipo_documento || 'nota_fiscal');
    const [categoryKey,setCategoryKey] = useState(defaults.categoria || 'cota_anual');
    const suppliers = useMemo(() => [...new Map(records.map(item => item.fornecedor).filter(Boolean).map(name => [supplierKey(name), officialSupplierName(name)])).values()].sort(supplierCompare), [records]);
    const submit = event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      onSave({ fornecedor:form.get('fornecedor'), categoria:form.get('categoria'), tipo_documento:form.get('tipo_documento'), numero_documento:form.get('numero_documento'), valor_acordado:parseMoney(form.get('valor_acordado')), ano_referencia:yearValue, monthIndex });
    };
    const documentLabel = type === 'nota_fiscal' ? 'Número da NF' : type === 'deposito' ? 'Comprovante / referência' : 'Documento / referência';
    const documentHint = type === 'deposito' ? 'opcional para depósito' : 'opcional';
    return html`<${ModalShell} title="Nova linha" eyebrow=${`${OFFICIAL_MONTHS[monthIndex][1]} · ${yearValue}`} icon="plus" onClose=${onClose}><form className="ac-form simple-payment-form" onSubmit=${submit}><div className="simple-form-intro"><strong>Só o que precisa para lançar.</strong><p>O restante é preenchido automaticamente pela Central e entra na mesma base de Pagamentos, Receita e Dashboard.</p></div><div className="form-grid simple-payment-grid">
      <${Field} label="Fornecedor" wide=${true}><input name="fornecedor" list="supplier-options" defaultValue=${defaults.fornecedor || ''} placeholder="Digite ou escolha o fornecedor" required autoFocus/><datalist id="supplier-options">${suppliers.map(name => html`<option value=${name}></option>`)}</datalist></${Field}>
      <${Field} label="Categoria / a que se refere"><select name="categoria" value=${categoryKey} onChange=${event=>setCategoryKey(event.target.value)}>${MANUAL_PAYMENT_CATEGORIES.map(key => html`<option value=${key}>${category(key).label}</option>`)}</select></${Field}>
      <${Field} label="Tipo"><select name="tipo_documento" value=${type} onChange=${event=>setType(event.target.value)}><option value="nota_fiscal">Nota fiscal</option><option value="deposito">Depósito</option><option value="outro">Outro</option></select></${Field}>
      <${Field} label=${documentLabel} hint=${documentHint}><input name="numero_documento" defaultValue=${defaults.numero_documento || ''} placeholder=${type === 'nota_fiscal' ? 'Ex.: 123456' : type === 'deposito' ? 'Ex.: comprovante, banco ou deixe em branco' : 'Referência opcional'}/></${Field}>
      <${Field} label="Valor" hint=${categoryKey === 'pendencia' ? 'pode ficar em branco em uma pendência' : ''}><div className="money-input"><span>R$</span><input name="valor_acordado" inputMode="decimal" defaultValue=${defaults.valor_acordado || ''} placeholder="0,00" required=${categoryKey !== 'pendencia'}/></div></${Field}>
      <div className="simple-payment-competence"><${Icon} name="calendar-days"/><span>Competência</span><strong>${OFFICIAL_MONTHS[monthIndex][1]} de ${yearValue}</strong></div>
      </div><footer className="modal-footer"><button type="button" className="button secondary" onClick=${onClose}>Cancelar</button><button type="submit" className="button primary" disabled=${saving}>${saving ? html`<span className="spinner"></span>` : html`<${Icon} name="plus"/>`}Adicionar linha</button></footer></form></${ModalShell}>`;
  }

  function PaymentModal({ payment, records, onClose, onSave, saving }) {
    const editing = Boolean(payment.id); const defaultRecord = payment.registro_id || records[0]?.id || '';
    const submit = event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const status = form.get('status'); const value = parseMoney(form.get('valor_previsto'));
      onSave({ parcela:Number(form.get('parcela') || 1), descricao:form.get('descricao'), valor_previsto:value,
        valor_pago:parseMoney(form.get('valor_pago')) || (status === 'pago' ? value : 0), vencimento:form.get('vencimento'), pago_em:form.get('pago_em'),
        status, forma_pagamento:form.get('forma_pagamento'), favorecido:form.get('favorecido'), numero_documento:form.get('numero_documento'), observacoes:form.get('observacoes') }, payment.id, form.get('registro_id'));
    };
    return html`<${ModalShell} title=${editing ? 'Editar pagamento' : 'Nova previsão de pagamento'} eyebrow="Agenda financeira" icon="receipt-text" onClose=${onClose}><form className="ac-form payment-form" onSubmit=${submit}><div className="form-grid">
      <${Field} label="Acompanhamento" wide=${true}><select name="registro_id" defaultValue=${defaultRecord} required disabled=${editing}><option value="">Selecione...</option>${[...records].sort((a,b)=>supplierCompare(a,b)||String(a.titulo||'').localeCompare(String(b.titulo||''),'pt-BR')).map(item => html`<option value=${item.id}>#${item.codigo || '—'} · ${item.fornecedor || item.titulo} — ${item.titulo}</option>`)}</select>${editing && html`<input type="hidden" name="registro_id" value=${defaultRecord}/>`}</${Field}>
      <${Field} label="Parcela"><input name="parcela" type="number" min="1" defaultValue=${payment.parcela || 1}/></${Field}>
      <${Field} label="Descrição"><input name="descricao" defaultValue=${payment.descricao || ''} placeholder="Ex.: 1ª parcela"/></${Field}>
      <${Field} label="Valor previsto"><div className="money-input"><span>R$</span><input name="valor_previsto" inputMode="decimal" defaultValue=${payment.valor_previsto || ''} required/></div></${Field}>
      <${Field} label="Vencimento"><input name="vencimento" type="date" defaultValue=${payment.vencimento || ''}/></${Field}>
      <${Field} label="Status"><select name="status" defaultValue=${payment.status || 'previsto'}>${Object.entries(PAYMENT_STATUS).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></${Field}>
      <${Field} label="Forma de pagamento"><select name="forma_pagamento" defaultValue=${payment.forma_pagamento || ''}><option value="">A definir</option>${PAYMENT_METHODS.map(item => html`<option value=${item}>${item}</option>`)}</select></${Field}>
      <${Field} label="Data realizada"><input name="pago_em" type="date" defaultValue=${payment.pago_em || ''}/></${Field}>
      <${Field} label="Valor realizado"><div className="money-input"><span>R$</span><input name="valor_pago" inputMode="decimal" defaultValue=${payment.valor_pago || ''}/></div></${Field}>
      <${Field} label="Favorecido"><input name="favorecido" defaultValue=${payment.favorecido || ''}/></${Field}>
      <${Field} label="Documento / NF"><input name="numero_documento" defaultValue=${payment.numero_documento || ''}/></${Field}>
      <${Field} label="Observações" wide=${true}><textarea name="observacoes" rows="3" defaultValue=${payment.observacoes || ''}></textarea></${Field}>
      </div><footer className="modal-footer"><button type="button" className="button secondary" onClick=${onClose}>Cancelar</button><button type="submit" className="button primary" disabled=${saving}>${saving ? html`<span className="spinner"></span>` : html`<${Icon} name="save"/>`}Salvar pagamento</button></footer></form></${ModalShell}>`;
  }

  function RecordDrawer({ record, context, onClose }) {
    const [tab, setTab] = useState('resumo'); const [uploading, setUploading] = useState(false); const fileRef = useRef(null);
    const payments = context.payments.filter(item => item.registro_id === record.id).sort((a, b) => (a.parcela || 0) - (b.parcela || 0));
    const attachments = context.attachments.filter(item => item.registro_id === record.id);
    const linkedDocuments = (context.documentItems || []).filter(item => item.registro_id === record.id && item.status === 'aprovado');
    const activities = context.activities.filter(item => item.registro_id === record.id);
    const collaboratorMap = Object.fromEntries(context.collaborators.map(item => [item.id, item]));
    const meta = category(record.categoria); const nature = NATURES[record.natureza] || NATURES.neutro; const progress = record.valor_acordado ? Math.min(100, Number(record.total_pago) / Number(record.valor_acordado) * 100) : 0;
    useEffect(() => { document.body.classList.add('drawer-open'); return () => document.body.classList.remove('drawer-open'); }, []);
    useLucide([tab, payments.length, attachments.length, activities.length, uploading]);

    async function archiveRecord() {
      if (!confirm('Arquivar este acompanhamento? Ele sairá das visões ativas, mas o histórico será preservado.')) return;
      if (DEMO_MODE) { context.notify('Modo demonstração: arquivamento validado.', 'info'); onClose(); return; }
      context.setSaving(true);
      try { const { error } = await context.client.rpc('arquivar_acompanhamento_v1', { p_registro_id:record.id }); if (error) throw error; await context.reload(true); context.notify('Acompanhamento arquivado.'); onClose(); }
      catch (error) { context.notify(error.message || 'Não foi possível arquivar.', 'error'); } finally { context.setSaving(false); }
    }

    async function quickPaid(payment) {
      if (DEMO_MODE) { context.notify('Pagamento marcado como realizado.', 'info'); return; }
      context.setSaving(true);
      try { const { error } = await context.client.rpc('salvar_pagamento_acompanhamento_v1', { p_pagamento_id:payment.id, p_registro_id:record.id, p_dados:{ ...payment, status:'pago', valor_pago:payment.valor_pago || payment.valor_previsto, pago_em:todayKey() } }); if (error) throw error; await context.reload(true); context.notify('Pagamento realizado.'); }
      catch (error) { context.notify(error.message || 'Não foi possível baixar o pagamento.', 'error'); } finally { context.setSaving(false); }
    }

    async function uploadFiles(event) {
      const files = [...(event.target.files || [])]; if (!files.length) return;
      if (DEMO_MODE) { context.notify('Modo demonstração: arquivos validados.', 'info'); return; }
      setUploading(true);
      try {
        const { data:userData, error:userError } = await context.client.auth.getUser(); if (userError || !userData?.user) throw userError || new Error('Sessão inválida.');
        for (const file of files) {
          if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name}: limite de 15 MB.`);
          const path = `${userData.user.id}/${record.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
          const { error:uploadError } = await context.client.storage.from('acompanhamento').upload(path, file, { contentType:file.type || 'application/octet-stream', upsert:false });
          if (uploadError) throw uploadError;
          const { error:metaError } = await context.client.rpc('registrar_anexo_acompanhamento_v1', { p_registro_id:record.id, p_pagamento_id:null, p_nome:file.name, p_caminho:path, p_mime_type:file.type, p_tamanho_bytes:file.size, p_tipo:'documento' });
          if (metaError) throw metaError;
        }
        await context.reload(true); context.notify(`${files.length} arquivo(s) anexado(s).`);
      } catch (error) { context.notify(error.message || 'Falha no envio.', 'error'); }
      finally { setUploading(false); event.target.value = ''; }
    }

    async function openAttachment(item) {
      if (DEMO_MODE) return context.notify('Arquivo disponível no ambiente real.', 'info');
      const { data, error } = await context.client.storage.from('acompanhamento').createSignedUrl(item.caminho, 120);
      if (error) return context.notify(error.message, 'error');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    }

    async function openInboxDocument(item) {
      if (DEMO_MODE) return context.notify('Documento disponível no ambiente real.', 'info');
      const path = item.entrada?.caminho;
      if (!path) return context.notify('Arquivo original não localizado.', 'error');
      const { data, error } = await context.client.storage.from('acompanhamento').createSignedUrl(path, 120);
      if (error) return context.notify(error.message, 'error');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    }

    return html`<div className="drawer-shell"><button className="drawer-backdrop" onClick=${onClose} aria-label="Fechar detalhes"></button><aside className="record-drawer"><header className="drawer-head"><div className="drawer-head-actions"><span className=${`control-pill ${record.controle}`}><i></i>${record.controle === 'marcos' ? 'Planejamento / Receita' : 'Pagamentos / Fornecedores'}</span><button className="icon-button" onClick=${onClose}><${Icon} name="x"/></button></div><div className="drawer-identity"><span className=${`category-mark large ${meta.tone}`}><${Icon} name=${meta.icon} size=${24}/></span><div><small>#${record.codigo || '—'} · ${record.ano_referencia} · ${meta.label}</small><h2>${record.fornecedor || record.titulo}</h2><p>${record.fornecedor ? record.titulo : record.referencia || ''}</p></div></div><div className="drawer-status-row"><span className=${`status-pill ${record.status}`}><i></i>${RECORD_STATUS[record.status]?.label || record.status}</span><span className=${`nature-pill ${nature.tone}`}><${Icon} name=${nature.icon}/>${nature.label}</span><span className=${`finance-label ${record.situacao_financeira}`}>${FINANCE_STATUS[record.situacao_financeira] || record.situacao_financeira}</span>${record.impacta_totais === false && html`<span className="detail-pill"><${Icon} name="layers-2"/>Detalhamento</span>`}${record.prioridade === 'urgente' && html`<span className="priority-urgent"><${Icon} name="siren"/>Urgente</span>`}</div></header>
      <nav className="drawer-tabs">${[['resumo','Visão geral'],['pagamentos','Pagamentos'],['documentos','Documentos'],['historico','Histórico']].map(([key, label]) => html`<button className=${tab === key ? 'active' : ''} onClick=${() => setTab(key)}>${label}${key === 'pagamentos' && html`<b>${payments.length}</b>`}${key === 'documentos' && (attachments.length + linkedDocuments.length) ? html`<b>${attachments.length + linkedDocuments.length}</b>` : null}</button>`)}</nav>
      <div className="drawer-content">
        ${tab === 'resumo' && html`<div className="drawer-section-stack"><section className="drawer-money-card"><div><small>Valor acompanhado</small><strong>${money(record.valor_acordado)}</strong></div><div className="drawer-money-split"><span><small>Realizado</small><b>${money(record.total_pago)}</b></span><span><small>Saldo futuro</small><b>${money(record.saldo_aberto)}</b></span></div><div className="drawer-progress-label"><span>Execução financeira</span><b>${Math.round(progress)}%</b></div><div className="drawer-progress"><i style=${{ width:`${progress}%` }}></i></div></section><section className="drawer-info-grid"><div><span><${Icon} name="calendar-range"/>Período</span><strong>${record.data_inicio ? date(record.data_inicio) : 'Não definido'} → ${record.data_fim ? date(record.data_fim) : 'aberto'}</strong></div><div><span><${Icon} name="user-round"/>Responsável</span><strong>${collaboratorMap[record.responsavel_id]?.nome || 'Não atribuído'}</strong></div><div><span><${Icon} name="crosshair"/>Referência</span><strong>${record.referencia || 'Não informada'}</strong></div><div><span><${Icon} name="file-text"/>Documento</span><strong>${record.numero_documento || 'Não informado'}</strong></div></section>${record.descricao && html`<section className="drawer-text"><span className="eyebrow">Descrição</span><p>${record.descricao}</p></section>`}${record.observacoes && html`<section className="drawer-note"><${Icon} name="sticky-note"/><div><strong>Observações internas</strong><p>${record.observacoes}</p></div></section>`}<div className="drawer-actions"><button className="button primary" onClick=${() => context.editRecord(record)}><${Icon} name="pencil"/>Editar acompanhamento</button><button className="button secondary" onClick=${() => context.newPayment(record)}><${Icon} name="receipt-text"/>Adicionar parcela</button><button className="button danger-ghost" onClick=${archiveRecord}><${Icon} name="archive"/>Arquivar</button></div></div>`}
        ${tab === 'pagamentos' && html`<div className="drawer-section-stack"><div className="drawer-section-heading"><div><span className="eyebrow">Cronograma financeiro</span><h3>${payments.length ? `${payments.length} lançamento(s)` : 'Sem parcelas'}</h3></div><button className="button primary small" onClick=${() => context.newPayment(record)}><${Icon} name="plus"/>Adicionar</button></div>${payments.length ? payments.map(payment => html`<article className=${`drawer-payment ${isOverdue(payment) ? 'overdue' : ''}`}><span className=${`payment-check ${payment.status}`}><${Icon} name=${payment.status === 'pago' ? 'check' : isOverdue(payment) ? 'triangle-alert' : 'clock-3'}/></span><div><strong>${payment.descricao || `Parcela ${payment.parcela}`}</strong><p>${payment.vencimento ? `Vence ${date(payment.vencimento)}` : 'Sem vencimento'} · ${payment.forma_pagamento || 'Forma a definir'}</p></div><span><strong>${money(payment.valor_previsto)}</strong><small>${isOverdue(payment) ? 'Atrasado' : PAYMENT_STATUS[payment.status]?.label}</small></span><div className="drawer-payment-actions">${payment.status !== 'pago' && html`<button title="Marcar como pago" onClick=${() => quickPaid(payment)}><${Icon} name="check"/></button>`}<button title="Editar" onClick=${() => context.editPayment(payment)}><${Icon} name="pencil"/></button></div></article>`) : html`<${MiniEmpty} icon="receipt-text" title="Nenhum pagamento cadastrado" text="Crie parcelas, datas e formas de pagamento para controlar o fluxo futuro." action=${() => context.newPayment(record)}/>`}</div>`}
        ${tab === 'documentos' && html`<div className="drawer-section-stack"><div className="dropzone" onClick=${() => fileRef.current?.click()}><input ref=${fileRef} type="file" multiple hidden onChange=${uploadFiles}/><span><${Icon} name=${uploading ? 'loader-circle' : 'cloud-upload'} size=${28}/></span><h3>${uploading ? 'Enviando arquivos...' : 'Anexar documentos'}</h3><p>Contratos, notas fiscais, boletos, propostas ou comprovantes · até 15 MB</p><button className="button secondary small" type="button">Selecionar arquivos</button></div>${linkedDocuments.length ? html`<div className="linked-documents"><span className="eyebrow">Conferidos pela Caixa de Entrada</span>${linkedDocuments.map(item => html`<button className="attachment-row reviewed" onClick=${() => openInboxDocument(item)}><span><${Icon} name="scan-line"/></span><div><strong>${item.entrada?.nome_arquivo || 'Documento conferido'}</strong><small>${documentTypeLabel(item.tipo)} · página ${(item.paginas || []).join(', ')}</small></div><${Icon} name="badge-check"/></button>`)}</div>` : null}<div className="attachment-list">${attachments.map(item => html`<button className="attachment-row" onClick=${() => openAttachment(item)}><span><${Icon} name=${item.mime_type?.includes('pdf') ? 'file-text' : item.mime_type?.includes('image') ? 'image' : 'paperclip'}/></span><div><strong>${item.nome}</strong><small>${item.tipo?.replace('_', ' ')} · ${item.tamanho_bytes ? `${Math.round(item.tamanho_bytes / 1024)} KB` : ''}</small></div><${Icon} name="external-link"/></button>`)}</div></div>`}
        ${tab === 'historico' && html`<div className="drawer-section-stack"><div className="history-timeline">${activities.length ? activities.map(activity => html`<div className="history-row"><span><${Icon} name=${activity.tipo.includes('pagamento') ? 'receipt-text' : activity.tipo === 'criado' ? 'sparkles' : activity.tipo === 'anexo' ? 'paperclip' : 'pencil-line'}/></span><div><strong>${collaboratorMap[activity.ator_id]?.nome || 'Equipe PMG'} ${activity.resumo}</strong><small>${dateTime(activity.criado_em)}</small></div></div>`) : html`<${MiniEmpty} icon="history" title="Ainda sem movimentações" text="Cada alteração será registrada automaticamente."/>`}</div></div>`}
      </div></aside></div>`;
  }

  const OFFICIAL_MONTHS = [
    ['janeiro', 'Janeiro'], ['fevereiro', 'Fevereiro'], ['marco', 'Março'], ['abril', 'Abril'],
    ['maio', 'Maio'], ['junho', 'Junho'], ['julho', 'Julho'], ['agosto', 'Agosto'],
    ['setembro', 'Setembro'], ['outubro', 'Outubro'], ['novembro', 'Novembro'], ['dezembro', 'Dezembro'],
  ];

  const OFFICIAL_SUPPLIER_ALIASES = {
    lawbweston:'Lamb Weston', 'lamb weston':'Lamb Weston', quata:'Quatá', 'j macedo':'J. Macêdo',
    'ajinomoto do brasil':'Ajinomoto', 'ajinomoto do brasil industria e comercio de alimentos':'Ajinomoto', 'ajinomoto do brasil industria e comercio de alimentos ltda':'Ajinomoto',
    'pq alimentos':'PQ Alimentos', 'gl foods':'GL Foods', 'gt foods':'GT Foods', 'mister beef':'Mister Beef',
    'bem brasil':'Bem Brasil', 'gomes da costa':'Gomes da Costa', 'clara milk':'Clara Milk',
    'dauphine farm frites':'Dauphine / Farm Frites', 'azeite lisboa':'Azeite Lisboa', 'arco bello':'Arco Bello',
  };

  function officialSupplierName(value) {
    const key = normalize(value);
    if (!key) return '';
    if (OFFICIAL_SUPPLIER_ALIASES[key]) return OFFICIAL_SUPPLIER_ALIASES[key];
    const lowerWords = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
    return String(value).trim().toLocaleLowerCase('pt-BR').replace(/\s*\/\s*/g, ' / ').split(/\s+/).map((word, index) => {
      if (index && lowerWords.has(word)) return word;
      return word ? `${word[0].toLocaleUpperCase('pt-BR')}${word.slice(1)}` : '';
    }).join(' ').replace(/\bPmg\b/g, 'PMG').replace(/\bIfb\b/g, 'IFB').replace(/\bAbad\b/g, 'ABAD');
  }

  function officialMonthEnd(year, monthIndex) {
    const day = new Date(year, monthIndex + 1, 0).getDate();
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function officialMonthStart(year, monthIndex) {
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
  }

  function officialMoney(value) {
    return Math.round(parseMoney(value) * 100) / 100;
  }

  function officialMethod(value) {
    const text = normalize(value); const deposit = text.includes('deposito') || text.includes('desposito'); const discount = text.includes('desconto') || text.includes('abatimento');
    if (deposit && discount) return 'Depósito + abatimento em verba';
    if (deposit) return 'Depósito'; if (discount) return 'Abatimento em verba';
    if (text.includes('pix')) return 'PIX'; if (text.includes('boleto')) return 'Boleto';
    if (text.includes('transfer')) return 'Transferência bancária'; if (text.includes('bonific')) return 'Bonificação';
    return /\d/.test(text) ? 'Nota fiscal / faturamento' : 'Não informado';
  }

  function officialTags(value) {
    const text = normalize(value); const rules = [
      ['cota', /cota/], ['incentivo', /incentivo|campanha|promocao/], ['podcast', /podcast/],
      ['convenção', /convencao/], ['feira', /feira|fipan|fispal|anuga|expo/], ['evento', /evento|30 anos|copa|dia do motorista/], ['mtrix', /mtrix/],
    ];
    return rules.filter(([, regex]) => regex.test(text)).map(([tag]) => tag);
  }

  function officialItem(registro, pagamentos = []) {
    return { registro:{
      fornecedor:'', fornecedor_codigo:'', natureza:'neutro', impacta_totais:true, categoria:'outro', descricao:'', referencia:'',
      status:'rascunho', prioridade:'normal', data_inicio:'', data_fim:'', valor_acordado:0, centro_custo:'', numero_documento:'',
      tags:[], observacoes:'', linha_origem:null, dados_originais:{}, ...registro,
    }, pagamentos };
  }

  function parseOfficialSupplierWorkbook(fileName, workbook, year) {
    const canonicalFile = `Fornecedores ${year}.xlsx`; const items = []; const totals = []; let recognizedMonths = 0;

    function sheetLayout(rows) {
      const firstRows = rows.slice(0, 15);
      let headerIndex = firstRows.findIndex(row => {
        const cells = (row || []).map(normalize);
        const hasSupplier = cells.some(value => value === 'fornecedor' || value.includes('fornecedor'));
        const hasFinancial = cells.some(value => value === 'verba' || value === 'valor' || value.includes('nota fiscal') || value === 'nf');
        return hasSupplier && hasFinancial;
      });
      if (headerIndex < 0) headerIndex = Math.min(1, Math.max(0, rows.length - 1));
      const headers = (rows[headerIndex] || []).map(normalize);
      const findColumn = aliases => {
        const normalizedAliases = aliases.map(normalize).filter(Boolean);
        const exact = headers.findIndex(value => Boolean(value) && normalizedAliases.includes(value));
        if (exact >= 0) return exact;
        return headers.findIndex(value => Boolean(value) && normalizedAliases.some(alias => alias && (value.includes(alias) || alias.includes(value))));
      };
      const categoryIndex = Math.max(0, findColumn(['campanha','categoria','tipo','ação','acao']));
      const supplierIndex = (() => { const found = findColumn(['fornecedor','parceiro','empresa']); return found >= 0 ? found : 1; })();
      let primaryValueIndex = findColumn(['verba','verba recebida','receita','valor verba']);
      if (primaryValueIndex < 0) primaryValueIndex = findColumn(['valor']);
      if (primaryValueIndex < 0) primaryValueIndex = 2;
      const documentIndex = (() => { const found = findColumn(['nf','nota fiscal','documento','nº nf','numero nf']); return found >= 0 ? found : 3; })();
      let specificValueIndex = findColumn(['valor específico','valor especifico','investimento específico','investimento especifico']);
      if (specificValueIndex < 0 && normalize(headers[primaryValueIndex]) !== 'valor') {
        const plainValue = headers.findIndex((value, index) => value === 'valor' && index !== primaryValueIndex);
        if (plainValue >= 0) specificValueIndex = plainValue;
      }
      if (specificValueIndex < 0 && primaryValueIndex !== 4 && headers.length > 4) specificValueIndex = 4;
      if (specificValueIndex === primaryValueIndex) specificValueIndex = -1;
      return { headerIndex, categoryIndex, supplierIndex, primaryValueIndex, documentIndex, specificValueIndex };
    }

    workbook.SheetNames.forEach(sheetName => {
      const monthIndex = monthIndexFromText(sheetName);
      if (monthIndex < 0) return;
      recognizedMonths += 1;
      const monthLabel = OFFICIAL_MONTHS[monthIndex][1];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header:1, defval:null, raw:true, blankrows:false });
      const layout = sheetLayout(rows); const dataRows = rows.slice(layout.headerIndex + 1);
      let sourceTotal = 0; let calculated = 0;

      dataRows.forEach((row, offset) => {
        const line = layout.headerIndex + offset + 2;
        const supplierRaw = String(row[layout.supplierIndex] ?? '').trim();
        const categoryRaw = String(row[layout.categoryIndex] ?? '').trim() || 'COTA';
        if (!supplierRaw || normalize(supplierRaw) === 'fornecedor' || normalize(categoryRaw) === 'total') {
          if (normalize(categoryRaw) === 'total') sourceTotal = officialMoney(row[layout.primaryValueIndex]);
          return;
        }
        const value = officialMoney(row[layout.primaryValueIndex]); if (value <= 0) return;
        const supplier = officialSupplierName(supplierRaw); const document = String(row[layout.documentIndex] ?? '').trim();
        const highlighted = layout.specificValueIndex >= 0 ? officialMoney(row[layout.specificValueIndex]) : 0;
        const recordFingerprint = fingerprint(['marketing', 'fornecedores', year, monthLabel, supplier, categoryRaw]);
        calculated += value;
        items.push(officialItem({
          controle:'marketing', ano_referencia:year, fornecedor:supplier, natureza:'receita', impacta_totais:true,
          categoria:inferCategory(categoryRaw), titulo:`${categoryRaw.replace(/\s+/g, ' ').trim()} — ${supplier} — ${monthLabel} ${year}`,
          descricao:`Verba mensal de fornecedor registrada pelo Marketing.${highlighted > 0 ? ` A fonte destaca ${money(highlighted)} para abertura de centro de custo.` : ''}`,
          referencia:categoryRaw, status:'concluido', data_inicio:officialMonthStart(year, monthIndex), data_fim:officialMonthEnd(year, monthIndex),
          valor_acordado:value, numero_documento:document, tags:['marketing', 'fornecedores', String(year), monthLabel.toLocaleLowerCase('pt-BR'), ...officialTags(categoryRaw)],
          observacoes:highlighted > 0 ? `Centro de custo destacado: ${money(highlighted)}.` : '', origem_importacao:canonicalFile, linha_origem:line,
          fingerprint:recordFingerprint, dados_originais:{ arquivo:canonicalFile, arquivo_enviado:fileName, aba:sheetName, linha:line, campanha:categoryRaw, fornecedor_original:supplierRaw, verba:value, nf:document, valor_especifico:highlighted || null },
        }, [{
          parcela:1, descricao:`Competência ${monthLabel} ${year}`, valor_previsto:value, valor_pago:value,
          vencimento:officialMonthEnd(year, monthIndex), pago_em:officialMonthEnd(year, monthIndex), status:'pago', forma_pagamento:officialMethod(document),
          favorecido:supplier, numero_documento:document, observacoes:'Importado da planilha oficial de Fornecedores; a competência mensal é considerada recebida.',
          fingerprint:fingerprint([recordFingerprint, 'competencia', year, monthIndex + 1]),
        }]));
        if (highlighted > 0) {
          const center = costCenterFromCampaign(categoryRaw); const outsideVerba = /mtrix|emitrix/.test(normalize(categoryRaw));
          const detailFingerprint = fingerprint(['marketing', 'centro-custo', year, monthLabel, supplier, categoryRaw, center]);
          items.push(officialItem({
            controle:'marketing', ano_referencia:year, fornecedor:supplier, natureza:'despesa', impacta_totais:outsideVerba,
            categoria:inferCategory(categoryRaw), titulo:`Centro de custo — ${center} — ${supplier} — ${monthLabel} ${year}`,
            descricao:outsideVerba ? 'Investimento MTRIX / Emitrix adicional, fora da VERBA recebida do fornecedor.' : 'Abertura do centro de custo já contida na VERBA recebida; não deve ser somada novamente à receita.',
            referencia:categoryRaw, status:'concluido', data_inicio:officialMonthStart(year, monthIndex), data_fim:officialMonthEnd(year, monthIndex),
            valor_acordado:highlighted, centro_custo:center, numero_documento:document,
            tags:['marketing','centro-custo',String(year),monthLabel.toLocaleLowerCase('pt-BR'), outsideVerba ? 'adicional-investimento' : 'dentro-verba', ...officialTags(categoryRaw)],
            observacoes:outsideVerba ? 'MTRIX / Emitrix fica fora da VERBA e entra como investimento adicional.' : 'Valor já incluído na VERBA. O registro serve para de-para e centro de custo.',
            origem_importacao:canonicalFile, linha_origem:line, fingerprint:detailFingerprint,
            dados_originais:{ arquivo:canonicalFile, arquivo_enviado:fileName, aba:sheetName, linha:line, campanha:categoryRaw, fornecedor_original:supplierRaw, verba_recebida:value, valor_centro_custo:highlighted, incluido_na_verba:!outsideVerba, coluna_valor:layout.specificValueIndex >= 0 ? XLSX.utils.encode_col(layout.specificValueIndex) : null },
          }, [{ parcela:1, descricao:`Centro de custo — ${monthLabel} ${year}`, valor_previsto:highlighted, valor_pago:highlighted,
            vencimento:officialMonthEnd(year, monthIndex), pago_em:officialMonthEnd(year, monthIndex), status:'pago', forma_pagamento:officialMethod(document),
            favorecido:supplier, numero_documento:document, observacoes:outsideVerba ? 'Investimento adicional fora da verba.' : 'Detalhamento já incluído na verba recebida.',
            fingerprint:fingerprint([detailFingerprint, 'centro-custo', year, monthIndex + 1]) }]));
        }
      });

      dataRows.forEach((row, offset) => {
        const noteCell = (row || []).find(value => /pendent|falta|ainda nao|faltou/.test(normalize(value)));
        const note = String(noteCell ?? '').trim(); if (!note) return;
        const line = layout.headerIndex + offset + 2; const noteValue = officialMoney(note.match(/R\$\s*[\d.,]+/i)?.[0]);
        items.push(officialItem({
          controle:'marketing', ano_referencia:year, natureza:'receita', impacta_totais:noteValue > 0, categoria:'pendencia',
          titulo:`Pendência — ${monthLabel} ${year}`, descricao:note, referencia:'Observação da planilha mensal', status:'negociacao', prioridade:'alta',
          data_inicio:officialMonthEnd(year, monthIndex), valor_acordado:noteValue, tags:['marketing', 'pendência', String(year), monthLabel.toLocaleLowerCase('pt-BR')],
          observacoes:note, origem_importacao:canonicalFile, linha_origem:line,
          fingerprint:fingerprint(['marketing', 'fornecedores', year, sheetName, line, note]),
          dados_originais:{ arquivo:canonicalFile, arquivo_enviado:fileName, aba:sheetName, linha:line, observacao:note },
        }));
      });
      totals.push({ sheet:sheetName, expected:sourceTotal, calculated:Math.round(calculated * 100) / 100, hasExpected:sourceTotal > 0 });
    });

    const warnings = totals.filter(item => item.hasExpected && Math.abs(item.expected - item.calculated) > .01)
      .map(item => `${item.sheet}: diferença de ${money(item.calculated - item.expected)}`);
    if (!recognizedMonths) warnings.push('Nenhuma aba mensal (Janeiro–Dezembro) foi reconhecida.');
    if (recognizedMonths && !items.length) warnings.push('As abas mensais foram reconhecidas, mas nenhuma linha válida de fornecedor foi encontrada.');
    return { kind:'fornecedores', label:`Modelo oficial Fornecedores ${year}`, modelFile:canonicalFile, control:'marketing', year, items, totals, warnings };
  }

  function planningCategory(value) {
    const key = normalize(value); const map = {
      promocoes:'campanha_incentivo', 'catalogo fold':'material', podcast:'midia', 'funcionario mes':'equipe', boletim:'midia',
      'feiras eventos':'feira', google:'midia', edm2:'midia', 'videos pmg':'midia', brindes:'material', 'graac aacd':'social',
      ifb:'parceria', abad:'parceria', diversos:'outro', convencao:'evento',
    }; return map[key] || inferCategory(value);
  }

  function officialRowsFromSheet(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    return sheet ? XLSX.utils.sheet_to_json(sheet, { header:1, defval:null, raw:true, blankrows:false }) : [];
  }

  function appendOfficialDetail({ canonicalFile, sheetName, title, nature, category:detailCategory, value, lines, status = 'em_andamento', reference = '', startDate = '', observations = '' }, items) {
    if ((!Array.isArray(lines) || !lines.length) && !(Number(value) > 0)) return;
    const recordFingerprint = fingerprint(['marcos', 'detalhamento', 2026, sheetName, title]);
    items.push(officialItem({
      controle:'marcos', ano_referencia:2026, natureza:nature, impacta_totais:false, categoria:detailCategory, titulo:title,
      descricao:'Detalhamento operacional preservado da aba específica do controle MKTG 2026.', referencia:reference || sheetName,
      status, data_inicio:startDate, valor_acordado:value, centro_custo:'Marketing',
      tags:['marcos', 'detalhamento', '2026', normalize(sheetName)], observacoes:observations, origem_importacao:canonicalFile,
      fingerprint:recordFingerprint, dados_originais:{ arquivo:canonicalFile, aba:sheetName, linhas:lines },
    }, lines.filter(line => line.value > 0).map((line, index) => ({
      parcela:index + 1, descricao:line.description || `Item ${index + 1}`, valor_previsto:line.value,
      valor_pago:line.status === 'pago' ? line.value : 0, vencimento:line.due || '',
      pago_em:line.status === 'pago' ? (line.paidAt || line.due || '') : '', status:line.status || 'previsto',
      forma_pagamento:line.method || 'Não informado', favorecido:line.favored || '', observacoes:line.observations || '',
      fingerprint:fingerprint([recordFingerprint, index + 1, line.description]),
    }))));
  }

  function appendOfficialMarcosDetails(workbook, canonicalFile, items) {
    const podcast = officialRowsFromSheet(workbook, 'PODCAST');
    const sponsors = podcast.slice(0, 9).map(row => ({
      description:officialSupplierName(row[0]), value:officialMoney(row[1]), status:normalize(row[2]) === 'pago' ? 'pago' : 'previsto',
      favored:officialSupplierName(row[0]), method:'Patrocínio',
    })).filter(line => line.description && line.value > 0);
    appendOfficialDetail({
      canonicalFile, sheetName:'PODCAST', title:'Patrocínios — Podcast 2026', nature:'receita', category:'midia',
      value:officialMoney(sum(sponsors, line => line.value)), lines:sponsors, status:'concluido', reference:'Patrocínios do Podcast',
    }, items);
    const podcastCosts = podcast.slice(17, 27).map(row => ({
      description:String(row[0] ?? '').trim(), value:officialMoney(row[1]), status:'previsto',
    })).filter(line => line.description && line.value > 0);
    appendOfficialDetail({
      canonicalFile, sheetName:'PODCAST', title:'Investimento — Podcast 2026', nature:'despesa', category:'midia',
      value:officialMoney(podcast[15]?.[1]) || officialMoney(sum(podcastCosts, line => line.value)), lines:podcastCosts,
      reference:'Estrutura e equipamentos do Podcast', observations:`Itens detalhados: ${money(sum(podcastCosts, line => line.value))}.`,
    }, items);

    const copa = officialRowsFromSheet(workbook, 'COPA');
    const copaSponsors = copa.slice(0, 9).map(row => ({
      description:officialSupplierName(row[0]), value:officialMoney(row[1]), favored:officialSupplierName(row[0]), status:'previsto', method:'Patrocínio',
    })).filter(line => line.description && line.value > 0);
    appendOfficialDetail({
      canonicalFile, sheetName:'COPA', title:'Apoios de fornecedores — Copa 2026', nature:'receita', category:'evento',
      value:officialMoney(sum(copaSponsors, line => line.value)), lines:copaSponsors, reference:'Apoios para a Copa',
    }, items);
    const copaCosts = copa.slice(13, 19).map(row => ({
      description:String(row[0] ?? '').trim(), value:officialMoney(row[3]) || officialMoney(officialMoney(row[1]) * officialMoney(row[2])), status:'previsto',
    })).filter(line => line.description && line.value > 0);
    appendOfficialDetail({
      canonicalFile, sheetName:'COPA', title:'Materiais promocionais — Copa 2026', nature:'despesa', category:'evento',
      value:officialMoney(sum(copaCosts, line => line.value)), lines:copaCosts, reference:'Materiais e estrutura para a Copa',
    }, items);

    const convention = officialRowsFromSheet(workbook, 'CONV FORNEC');
    const conventionLines = convention.map(row => ({
      description:String(row[0] ?? '').trim() || 'Saldo a pagar', value:officialMoney(row[1]),
      status:normalize(row[2]).includes('pago') && !normalize(row[2]).includes('falta') ? 'pago' : 'previsto', observations:String(row[2] ?? '').trim(),
    })).filter(line => line.value > 0);
    appendOfficialDetail({
      canonicalFile, sheetName:'CONV FORNEC', title:'Convenção de Fornecedores 2026', nature:'despesa', category:'evento',
      value:officialMoney(sum(conventionLines, line => line.value)), lines:conventionLines,
      reference:'Locação, espaço e buffet da Convenção de Fornecedores',
    }, items);

    const pending = officialRowsFromSheet(workbook, 'PENDÊNCIAS');
    const pendingValue = officialMoney(pending[1]?.[2]);
    if (pendingValue > 0) items.push(officialItem({
      controle:'marcos', ano_referencia:2026, natureza:'receita', impacta_totais:true, categoria:'pendencia',
      titulo:'Pendência — haver Edilson', descricao:'Valor registrado como HAVER na aba de pendências.', referencia:'PENDÊNCIAS',
      status:'negociacao', prioridade:'alta', valor_acordado:pendingValue, tags:['marcos', 'pendência', 'haver', '2026'],
      origem_importacao:canonicalFile, linha_origem:2, fingerprint:fingerprint(['marcos', 'pendencia', 'edilson']),
      dados_originais:{ arquivo:canonicalFile, aba:'PENDÊNCIAS', responsavel:'EDILSON', tipo:'HAVER', valor:pendingValue },
    }));

    [
      ['ANUGA', 'ANUGA 2026', 'feira', '2026-04-01'], ['FISPAL', 'FISPAL 2026', 'feira', '2026-06-01'],
      ['FIPAN', 'FIPAN 2026', 'feira', '2026-07-01'], ['CONV VENDAS', 'Convenção de Vendas 2026', 'evento', '2026-03-01'],
    ].forEach(([sheetName, title, detailCategory, startDate]) => {
      let lastDescription = ''; const occurrence = new Map();
      const lines = officialRowsFromSheet(workbook, sheetName).map(row => {
        const rawDescription = String(row[0] ?? '').trim(); if (rawDescription) lastDescription = rawDescription;
        const value = officialMoney(row[1]); if (!lastDescription || value <= 0) return null;
        const key = normalize(lastDescription); occurrence.set(key, (occurrence.get(key) || 0) + 1);
        const suffix = occurrence.get(key) > 1 ? ` — parcela ${occurrence.get(key)}` : '';
        return { description:`${lastDescription}${suffix}`, value, status:'previsto' };
      }).filter(Boolean);
      appendOfficialDetail({
        canonicalFile, sheetName, title, nature:'despesa', category:detailCategory, value:officialMoney(sum(lines, line => line.value)),
        lines, startDate, reference:`${sheetName} — detalhamento de custos`,
      }, items);
    });

    const card = officialRowsFromSheet(workbook, 'CARTÃO'); let cardDate = ''; const cardLines = [];
    card.forEach(row => {
      if (row[0] instanceof Date && !Number.isNaN(row[0].getTime())) cardDate = row[0].toISOString().slice(0, 10);
      else if (typeof row[0] === 'number' && row[0] > 20000) {
        const parsed = XLSX.SSF.parse_date_code(row[0]);
        if (parsed) cardDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
      const label = String(row[1] ?? '').trim() || 'Lançamento sem descrição';
      [row[2], row[3]].forEach((cell, columnOffset) => {
        const value = officialMoney(cell);
        if (value > 0) cardLines.push({ description:`${label} — coluna ${columnOffset ? 'D' : 'C'}`, value, status:'previsto', due:cardDate });
      });
    });
    appendOfficialDetail({
      canonicalFile, sheetName:'CARTÃO', title:'Lançamentos de cartão — Julho 2026', nature:'despesa', category:'outro',
      value:officialMoney(sum(cardLines, line => line.value)), lines:cardLines, startDate:cardDate, reference:'Cartão',
      observations:'A fonte não identifica todos os lançamentos; as colunas originais foram preservadas.',
    }, items);
  }


  function workbookXmlText(workbook, path) {
    const content = workbook?.files?.[path]?.content;
    if (!content) return '';
    if (typeof content === 'string') return content;
    try { return new TextDecoder('utf-8').decode(content); } catch (_) { return String(content || ''); }
  }

  function planningPaidMaskFromWorkbook(workbook) {
    try {
      const stylesXml = workbookXmlText(workbook, 'xl/styles.xml');
      const sheetMeta = workbook?.Workbook?.Sheets?.find(item => normalize(item?.name) === 'planejamento');
      const sheetPath = `xl/worksheets/sheet${sheetMeta?.sheetId || 1}.xml`;
      const sheetXml = workbookXmlText(workbook, sheetPath);
      if (!stylesXml || !sheetXml) return null;
      const fontsBlock = stylesXml.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/i)?.[1] || '';
      const fonts = fontsBlock.match(/<font[\s\S]*?<\/font>/gi) || [];
      const redFontIds = new Set(fonts.map((font,index) => /<color[^>]*rgb=["'](?:FF)?FF0000["']/i.test(font) ? index : -1).filter(index => index >= 0));
      const xfsBlock = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/i)?.[1] || '';
      const xfs = xfsBlock.match(/<xf\b[^>]*\/?>/gi) || [];
      const redStyleIds = new Set(xfs.map((xf,index) => { const fontId = Number(xf.match(/fontId=["'](\d+)["']/i)?.[1] ?? -1); return redFontIds.has(fontId) ? index : -1; }).filter(index => index >= 0));
      if (!redStyleIds.size) return null;
      const mask = Array.from({ length:15 }, () => Array(12).fill(false));
      const cellRe = /<c\b[^>]*r=["']([B-P])(\d+)["'][^>]*s=["'](\d+)["'][^>]*>/gi;
      let match;
      while ((match = cellRe.exec(sheetXml))) {
        const columnIndex = match[1].charCodeAt(0) - 66;
        const rowNumber = Number(match[2]);
        const monthIndex = rowNumber - 3;
        const styleId = Number(match[3]);
        if (columnIndex >= 0 && columnIndex < 15 && monthIndex >= 0 && monthIndex < 12 && redStyleIds.has(styleId)) mask[columnIndex][monthIndex] = true;
      }
      return mask;
    } catch (_) { return null; }
  }

  function parseOfficialMarcosWorkbook(fileName, workbook) {
    if (!workbook.Sheets.RECEITA || !workbook.Sheets.Planejamento) return null;
    const canonicalFile = 'MKTG 2026.xlsx'; const items = [];
    const receitaRows = XLSX.utils.sheet_to_json(workbook.Sheets.RECEITA, { header:1, defval:null, raw:true, blankrows:false });
    receitaRows.slice(2, 38).forEach((row, offset) => {
      const originalName = String(row[0] ?? '').trim(); const value = officialMoney(row[1]);
      if (!originalName || normalize(originalName) === 'soma' || value <= 0) return;
      const podcast = normalize(originalName) === 'podcast'; const supplier = podcast ? '' : officialSupplierName(originalName);
      const recordFingerprint = fingerprint(['marcos', 'fechado', 2025, originalName]);
      items.push(officialItem({
        controle:'marcos', ano_referencia:2025, fornecedor:supplier, natureza:'receita', impacta_totais:true,
        categoria:podcast ? 'midia' : 'cota_anual', titulo:podcast ? 'Fechamento anual — Podcast 2025' : `Fechamento anual de verba 2025 — ${supplier}`,
        descricao:'Valor anual indicado como FECHADO no controle da Presidência.', referencia:'Previsão de Verbas 2025 — FECHADO', status:'concluido',
        data_inicio:'2025-01-01', data_fim:'2025-12-31', valor_acordado:value, tags:['marcos', 'fechado', '2025', podcast ? 'podcast' : 'fornecedor'],
        origem_importacao:canonicalFile, linha_origem:offset + 3, fingerprint:recordFingerprint,
        dados_originais:{ arquivo:canonicalFile, aba:'RECEITA', linha:offset + 3, fornecedor_original:originalName, fechado:value },
      }, [{ parcela:1, descricao:'Fechamento anual 2025', valor_previsto:value, valor_pago:value, vencimento:'2025-12-31', pago_em:'2025-12-31',
        status:'pago', forma_pagamento:'Consolidado anual', favorecido:supplier, observacoes:'Data contábil de encerramento usada porque a fonte contém apenas o valor anual fechado.',
        fingerprint:fingerprint([recordFingerprint, 'fechamento-2025']) }]));
    });
    receitaRows.slice(2, 51).forEach((row, offset) => {
      const originalName = String(row[3] ?? '').trim(); if (!originalName || /soma|previsao|prev\./.test(normalize(originalName))) return;
      const forecast = officialMoney(row[4]); const monthly = Array.from({ length:12 }, (_, index) => officialMoney(row[5 + index]));
      const movements = monthly.map((value, monthIndex) => ({ value, monthIndex })).filter(item => item.value > 1.01);
      const paidTotal = sum(movements, item => item.value); if (forecast <= 0 && paidTotal <= 0) return;
      const supplier = officialSupplierName(originalName); const recordFingerprint = fingerprint(['marcos', 'previsao-verba', 2026, supplier]);
      items.push(officialItem({
        controle:'marcos', ano_referencia:2026, fornecedor:supplier, natureza:'receita', impacta_totais:true, categoria:'cota_anual',
        titulo:`Previsão anual de verba 2026 — ${supplier}`, descricao:'Previsão anual acompanhada pela Presidência, com os movimentos mensais informados na planilha.',
        referencia:'PAGAMENTOS FORNECEDORES 2026', status:paidTotal >= forecast && forecast > 0 ? 'concluido' : 'em_andamento', data_inicio:'2026-01-01', data_fim:'2026-12-31',
        valor_acordado:forecast, tags:['marcos', 'previsão', 'fornecedor', '2026'],
        observacoes:forecast <= 0 && paidTotal > 0 ? `A previsão original está zerada e já há ${money(paidTotal)} realizado.` : '',
        origem_importacao:canonicalFile, linha_origem:offset + 3, fingerprint:recordFingerprint,
        dados_originais:{ arquivo:canonicalFile, aba:'RECEITA', linha:offset + 3, fornecedor_original:originalName, previsao:forecast, pagamentos_mensais:monthly, marcadores_um_real_ignorados:monthly.filter(value => value === 1).length },
      }, movements.map(({ value, monthIndex }, index) => ({ parcela:index + 1, descricao:`Recebimento — ${OFFICIAL_MONTHS[monthIndex][1]} 2026`,
        valor_previsto:value, valor_pago:value, vencimento:officialMonthEnd(2026, monthIndex), pago_em:officialMonthEnd(2026, monthIndex), status:'pago',
        forma_pagamento:'Não informado', favorecido:supplier, observacoes:'Valores iguais a R$ 1,00 usados como marcador foram ignorados.',
        fingerprint:fingerprint([recordFingerprint, 'recebimento', monthIndex + 1]) }))));
    });
    const somaMensalRow = receitaRows.find(row => normalize(row?.[3]) === 'soma mensal');
    if (somaMensalRow) {
      const monthlyTotals = Array.from({ length:12 }, (_, index) => officialMoney(somaMensalRow[5 + index]));
      const exactTotal = officialMoney(somaMensalRow[17]) || sum(monthlyTotals, value => value);
      items.push(officialItem({ controle:'marcos', ano_referencia:2026, natureza:'indicador', impacta_totais:false, categoria:'meta_financeira',
        titulo:'Receita realizada 2026 — total oficial', descricao:'Total realizado preservado exatamente da linha SOMA MENSAL da aba RECEITA do MKTG 2026.',
        referencia:'SOMA MENSAL', status:'concluido', data_inicio:'2026-01-01', data_fim:'2026-12-31', valor_acordado:exactTotal,
        tags:['marcos','indicador','2026','receita-realizada','soma-mensal'], origem_importacao:canonicalFile,
        fingerprint:fingerprint(['marcos','indicador',2026,'receita-realizada']),
        dados_originais:{ arquivo:canonicalFile, aba:'RECEITA', indicador:'receita-realizada', pagamentos_mensais:monthlyTotals, total:exactTotal } }));
    }

    const planningRows = XLSX.utils.sheet_to_json(workbook.Sheets.Planejamento, { header:1, defval:null, raw:true, blankrows:false });
    const planningPaidMask = planningPaidMaskFromWorkbook(workbook);
    for (let columnIndex = 1; columnIndex <= 15; columnIndex += 1) {
      const header = String(planningRows[1]?.[columnIndex] ?? '').trim(); if (!header) continue;
      const monthly = Array.from({ length:12 }, (_, index) => officialMoney(planningRows[2 + index]?.[columnIndex]));
      const paidMonthly = Array.from({ length:12 }, (_, index) => monthly[index] > 0 && Boolean(planningPaidMask?.[columnIndex - 1]?.[index] ?? OFFICIAL_PLANNING_2026[normalize(header)]?.paid?.[index]));
      const total = sum(monthly, value => value); if (total <= 0) continue;
      const recordFingerprint = fingerprint(['marcos', 'planejamento', 2026, header]);
      items.push(officialItem({
        controle:'marcos', ano_referencia:2026, natureza:'despesa', impacta_totais:true, categoria:planningCategory(header), titulo:`Planejamento 2026 — ${header}`,
        descricao:'Planejamento anual de investimento do Marketing acompanhado pela Presidência.', referencia:header, status:'em_andamento',
        data_inicio:'2026-01-01', data_fim:'2026-12-31', valor_acordado:total, centro_custo:'Marketing', tags:['marcos', 'planejamento', 'despesa', '2026', normalize(header)],
        origem_importacao:canonicalFile, linha_origem:2, fingerprint:recordFingerprint,
        dados_originais:{ arquivo:canonicalFile, aba:'Planejamento', coluna:XLSX.utils.encode_col(columnIndex), categoria_original:header, valores_mensais:monthly, pagos_mensais:paidMonthly },
      }, monthly.map((value, monthIndex) => ({ value, monthIndex })).filter(item => item.value > 0).map(({ value, monthIndex }, index) => ({
        parcela:index + 1, descricao:`${header} — ${OFFICIAL_MONTHS[monthIndex][1]} 2026`, valor_previsto:value, valor_pago:paidMonthly[monthIndex] ? value : 0,
        vencimento:officialMonthEnd(2026, monthIndex), pago_em:paidMonthly[monthIndex] ? officialMonthEnd(2026, monthIndex) : '', status:paidMonthly[monthIndex] ? 'pago' : 'previsto', forma_pagamento:'Não informado',
        observacoes:paidMonthly[monthIndex] ? 'Marcado em vermelho na fonte oficial: tratado como já pago.' : 'Valor planejado ainda não marcado como pago na fonte oficial.',
        fingerprint:fingerprint([recordFingerprint, 'planejamento', monthIndex + 1])
      }))));
    }
    [['receita', workbook.Sheets.RECEITA.E58?.v], ['investimento', workbook.Sheets.RECEITA.E56?.v], ['saldo', workbook.Sheets.RECEITA.E60?.v]].forEach(([key, rawValue]) => {
      const value = officialMoney(rawValue); if (value <= 0) return; const titles = { receita:'Previsão de receita 2026', investimento:'Previsão de investimento 2026', saldo:'Previsão de saldo 2026' };
      items.push(officialItem({ controle:'marcos', ano_referencia:2026, natureza:'indicador', impacta_totais:false, categoria:'meta_financeira', titulo:titles[key],
        descricao:'Indicador executivo preservado exatamente como informado no controle MKTG 2026.', referencia:'PREVISÃO ORÇAMENTÁRIA', status:'aprovado',
        data_inicio:'2026-01-01', data_fim:'2026-12-31', valor_acordado:value, tags:['marcos', 'indicador', '2026', key], origem_importacao:canonicalFile,
        fingerprint:fingerprint(['marcos', 'indicador', 2026, key]), dados_originais:{ arquivo:canonicalFile, aba:'RECEITA', indicador:key, valor:value } }));
    });
    appendOfficialMarcosDetails(workbook, canonicalFile, items);
    return { kind:'mktg', label:'Modelo oficial MKTG 2026', modelFile:canonicalFile, control:'marcos', year:2026, items, totals:[], warnings:[] };
  }

  function detectClosingWorkbookLayout(workbook) {
    const firstSheetName = workbook.SheetNames?.[0];
    if (!firstSheetName || workbook.SheetNames.length !== 1) return null;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { header:1, defval:null, raw:true, blankrows:false });
    const probe = rows.slice(0, 20);
    const headerIndex = probe.findIndex(row => {
      const cells = (row || []).map(normalize).filter(Boolean);
      return cells.some(value => value.includes('fornecedor'))
        && cells.some(value => value === 'verba' || value === 'valor' || value.includes('valor'))
        && cells.some(value => value.includes('campanha') || value.includes('categoria') || value.includes('tipo'));
    });
    if (headerIndex < 0) return null;
    const headers = (rows[headerIndex] || []).map(normalize);
    const findColumn = aliases => {
      const normalizedAliases = aliases.map(normalize).filter(Boolean);
      const exact = headers.findIndex(value => Boolean(value) && normalizedAliases.includes(value));
      if (exact >= 0) return exact;
      return headers.findIndex(value => Boolean(value) && normalizedAliases.some(alias => alias && (value.includes(alias) || alias.includes(value))));
    };
    const supplierIndex = findColumn(['fornecedor','parceiro','empresa']);
    const categoryIndex = findColumn(['campanha','categoria','tipo','ação','acao']);
    let primaryValueIndex = findColumn(['verba','verba recebida','receita','valor verba']);
    if (primaryValueIndex < 0) primaryValueIndex = findColumn(['valor']);
    const documentIndex = findColumn(['nf','nota fiscal','documento','nº nf','numero nf']);
    const competenceIndex = findColumn(['competência','competencia','mês','mes','referência','referencia']);
    let specificValueIndex = findColumn(['valor específico','valor especifico','investimento específico','investimento especifico']);
    if (specificValueIndex < 0 && primaryValueIndex >= 0 && normalize(headers[primaryValueIndex]) !== 'valor') {
      const plainValue = headers.findIndex((value, index) => value === 'valor' && index !== primaryValueIndex);
      if (plainValue >= 0) specificValueIndex = plainValue;
    }
    if (supplierIndex < 0 || categoryIndex < 0 || primaryValueIndex < 0) return null;
    return { firstSheetName, rows, headerIndex, supplierIndex, categoryIndex, primaryValueIndex, documentIndex, competenceIndex, specificValueIndex };
  }

  function parseOfficialClosingWorkbook(fileName, workbook, year, forcedMonthIndex = null) {
    const layout = detectClosingWorkbookLayout(workbook);
    if (!layout) return null;
    const canonicalFile = `Fornecedores ${year}.xlsx`;
    const items = []; const totals = [];
    const dataRows = layout.rows.slice(layout.headerIndex + 1);
    const filenameMonth = monthIndexFromText(fileName);
    const sheetMonth = monthIndexFromText(layout.firstSheetName);
    const hasForcedMonth = Number.isInteger(forcedMonthIndex) && forcedMonthIndex >= 0;
    const defaultMonthIndex = hasForcedMonth ? forcedMonthIndex : (filenameMonth >= 0 ? filenameMonth : sheetMonth);
    let needsCompetence = defaultMonthIndex < 0 && layout.competenceIndex < 0;
    let recognizedRows = 0;

    dataRows.forEach((row, offset) => {
      const supplierRaw = String(row[layout.supplierIndex] ?? '').trim();
      const categoryRaw = String(row[layout.categoryIndex] ?? '').trim() || 'COTA';
      if (!supplierRaw || normalize(supplierRaw) === 'fornecedor' || normalize(categoryRaw) === 'total') return;
      const value = officialMoney(row[layout.primaryValueIndex]);
      if (value <= 0) return;
      let monthIndex = defaultMonthIndex;
      if (!hasForcedMonth && layout.competenceIndex >= 0) {
        const cellMonth = monthIndexFromText(String(row[layout.competenceIndex] ?? ''));
        if (cellMonth >= 0) monthIndex = cellMonth;
      }
      if (monthIndex < 0) { needsCompetence = true; return; }
      recognizedRows += 1;
      const monthLabel = OFFICIAL_MONTHS[monthIndex][1];
      const line = layout.headerIndex + offset + 2;
      const supplier = officialSupplierName(supplierRaw);
      const document = layout.documentIndex >= 0 ? String(row[layout.documentIndex] ?? '').trim() : '';
      const highlighted = layout.specificValueIndex >= 0 ? officialMoney(row[layout.specificValueIndex]) : 0;
      const recordFingerprint = fingerprint(['marketing','fornecedores',year,monthLabel,supplier,categoryRaw]);
      items.push(officialItem({
        controle:'marketing', ano_referencia:year, fornecedor:supplier, natureza:'receita', impacta_totais:true,
        categoria:inferCategory(categoryRaw), titulo:`${categoryRaw.replace(/\s+/g,' ').trim()} — ${supplier} — ${monthLabel} ${year}`,
        descricao:'Fechamento de fornecedor importado para Pagamentos e conciliado com a Receita.', referencia:categoryRaw,
        status:'concluido', data_inicio:officialMonthStart(year, monthIndex), data_fim:officialMonthEnd(year, monthIndex),
        valor_acordado:value, numero_documento:document, tags:['marketing','fornecedores','fechamento',String(year),normalize(monthLabel),...officialTags(categoryRaw)],
        observacoes:highlighted > 0 ? `Centro de custo destacado: ${money(highlighted)}.` : '', origem_importacao:canonicalFile, linha_origem:line,
        fingerprint:recordFingerprint,
        dados_originais:{ arquivo:canonicalFile, arquivo_enviado:fileName, aba:layout.firstSheetName, linha:line, campanha:categoryRaw, fornecedor_original:supplierRaw, verba:value, nf:document, valor_especifico:highlighted || null },
      }, [{
        parcela:1, descricao:`Competência ${monthLabel} ${year}`, valor_previsto:value, valor_pago:value,
        vencimento:officialMonthEnd(year, monthIndex), pago_em:officialMonthEnd(year, monthIndex), status:'pago', forma_pagamento:officialMethod(document),
        favorecido:supplier, numero_documento:document, observacoes:'Importado do modelo de Fechamento; a competência é considerada recebida.',
        fingerprint:fingerprint([recordFingerprint,'competencia',year,monthIndex + 1]),
      }]));
    });

    return {
      kind:'fechamento', label:`Modelo de Fechamento ${year}`, modelFile:canonicalFile, control:'marketing', year, items, totals, warnings:[],
      needsCompetence, competenceMonthIndex:defaultMonthIndex >= 0 ? defaultMonthIndex : null, recognizedRows,
      sourceSheet:layout.firstSheetName,
    };
  }

  function normalizeImportItem(item) {
    const source = item && typeof item === 'object' ? item : {};
    const rawRecord = source.registro && typeof source.registro === 'object' ? source.registro : {};
    const record = {
      ...rawRecord,
      fornecedor:String(rawRecord.fornecedor ?? ''), fornecedor_codigo:String(rawRecord.fornecedor_codigo ?? ''),
      natureza:String(rawRecord.natureza ?? 'neutro'), categoria:String(rawRecord.categoria ?? 'outro'), titulo:String(rawRecord.titulo ?? ''),
      descricao:String(rawRecord.descricao ?? ''), referencia:String(rawRecord.referencia ?? ''), status:String(rawRecord.status ?? 'rascunho'),
      prioridade:String(rawRecord.prioridade ?? 'normal'), data_inicio:String(rawRecord.data_inicio ?? ''), data_fim:String(rawRecord.data_fim ?? ''),
      valor_acordado:Number(rawRecord.valor_acordado || 0), centro_custo:String(rawRecord.centro_custo ?? ''), numero_documento:String(rawRecord.numero_documento ?? ''),
      tags:Array.isArray(rawRecord.tags) ? rawRecord.tags.map(value => String(value)) : [],
      observacoes:String(rawRecord.observacoes ?? ''), fingerprint:String(rawRecord.fingerprint ?? ''),
      dados_originais:rawRecord.dados_originais && typeof rawRecord.dados_originais === 'object' && !Array.isArray(rawRecord.dados_originais) ? rawRecord.dados_originais : {},
    };
    const payments = Array.isArray(source.pagamentos) ? source.pagamentos.filter(payment => payment && typeof payment === 'object').map(payment => ({
      ...payment,
      descricao:String(payment.descricao ?? ''), valor_previsto:Number(payment.valor_previsto || 0), valor_pago:Number(payment.valor_pago || 0),
      vencimento:String(payment.vencimento ?? ''), pago_em:String(payment.pago_em ?? ''), status:String(payment.status ?? 'previsto'),
      forma_pagamento:String(payment.forma_pagamento ?? ''), favorecido:String(payment.favorecido ?? ''), numero_documento:String(payment.numero_documento ?? ''),
      observacoes:String(payment.observacoes ?? ''), fingerprint:String(payment.fingerprint ?? ''),
    })) : [];
    return { ...source, registro:record, pagamentos:payments };
  }

  function parseOfficialWorkbook(fileName, workbook, options = {}) {
    const supplierMatch = fileName.match(/fornecedores\D*(20\d{2})/i);
    const yearMatch = fileName.match(/(20\d{2})/);
    const inferredYear = Number(yearMatch?.[1] || new Date().getFullYear());
    let parsed = null;
    if (supplierMatch) parsed = parseOfficialSupplierWorkbook(fileName, workbook, Number(supplierMatch[1]));
    else if (/mktg|marketing/i.test(fileName) && workbook.Sheets.RECEITA && workbook.Sheets.Planejamento) parsed = parseOfficialMarcosWorkbook(fileName, workbook);
    else if (/fechamento/i.test(fileName) || detectClosingWorkbookLayout(workbook)) parsed = parseOfficialClosingWorkbook(fileName, workbook, inferredYear, options.forcedMonthIndex);
    if (!parsed) return null;
    return { ...parsed, items:(parsed.items || []).map(normalizeImportItem), warnings:Array.isArray(parsed.warnings) ? parsed.warnings.map(value => String(value)) : [], totals:Array.isArray(parsed.totals) ? parsed.totals : [] };
  }

  function ImportView({ context }) {
    const inputRef = useRef(null);
    const workbookRef = useRef(null);
    const [file, setFile] = useState(null);
    const [official, setOfficial] = useState(null);
    const [reading, setReading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState(null);
    const [localError, setLocalError] = useState('');
    const [dragging, setDragging] = useState(false);
    const [closingMonth, setClosingMonth] = useState(new Date().getMonth());
    useLucide([file?.name, official?.kind, reading, importing, result, localError, dragging, closingMonth]);

    const resetFile = () => {
      setFile(null); setOfficial(null); setResult(null); setLocalError(''); setReading(false); setImporting(false); workbookRef.current = null;
      if (inputRef.current) inputRef.current.value = '';
    };

    async function loadFile(nextFile) {
      if (!nextFile) return;
      if (!/\.(xlsx|xls|xlsm)$/i.test(nextFile.name)) {
        setLocalError('Use uma planilha Excel no padrão Fornecedores ou MKTG.');
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      setReading(true); setResult(null); setLocalError(''); setFile(nextFile); setOfficial(null);
      try {
        await ensureXlsxAsset();
        const buffer = await withTimeout(nextFile.arrayBuffer(), 10000, 'A leitura do arquivo demorou demais.');
        const workbook = XLSX.read(buffer, { type:'array', cellDates:true, cellStyles:true, bookFiles:true });
        if (!Array.isArray(workbook?.SheetNames) || !workbook.SheetNames.length) throw new Error('A planilha não possui abas legíveis.');
        workbookRef.current = workbook;
        let detected = parseOfficialWorkbook(nextFile.name, workbook);
        if (detected?.kind === 'fechamento') {
          const selectedMonth = Number.isInteger(detected.competenceMonthIndex) ? detected.competenceMonthIndex : closingMonth;
          detected = parseOfficialWorkbook(nextFile.name, workbook, { forcedMonthIndex:selectedMonth });
          setClosingMonth(selectedMonth);
        }
        if (!detected) throw new Error('Modelo não reconhecido. Use Fornecedores 20XX, MKTG 2026 ou o modelo de Fechamento da PMG.');
        if (detected.warnings?.length) throw new Error(detected.warnings.join(' · '));
        setOfficial(detected);
      } catch (error) {
        console.error('[PMG Importação] Falha ao analisar arquivo:', error);
        setOfficial(null);
        setLocalError(error?.message || 'Não foi possível ler a planilha.');
      } finally {
        setReading(false);
      }
    }

    const supplierRevenueFingerprints = payload => (payload || [])
      .filter(item => item?.registro?.natureza === 'receita' && (item.registro.tags || []).includes('fornecedores') && item?.pagamentos?.some(payment => payment.status === 'pago'))
      .map(item => item.registro.fingerprint).filter(Boolean);

    async function preflightOfficialSupplierImport() {
      if (!['fornecedores','fechamento'].includes(official?.kind)) return;
      const { error } = await withTimeout(
        context.client.rpc('confirmar_pagamentos_lote_v1', { p_registro_ids:[], p_confirmado:true }),
        12000,
        'O banco demorou para validar a importação.'
      );
      if (!error) return;
      const details = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' · ');
      const missing = /confirmar_pagamentos_lote_v1|PGRST202|schema cache|could not find the function/i.test(details);
      if (missing) throw new Error('A confirmação segura em lote ainda não está instalada. Execute o SQL 19 da Central antes de importar.');
      throw error;
    }

    async function confirmOfficialSupplierRows(payload) {
      const fingerprints = supplierRevenueFingerprints(payload);
      if (!fingerprints.length) return 0;
      const ids = [];
      for (let index = 0; index < fingerprints.length; index += 200) {
        const chunk = fingerprints.slice(index, index + 200);
        const { data:records, error } = await withTimeout(
          context.client.from('acompanhamento_registros').select('id,fingerprint').in('fingerprint', chunk).is('arquivado_em', null),
          12000,
          'O banco demorou para conciliar os pagamentos importados.'
        );
        if (error) throw error;
        ids.push(...(records || []).map(record => record.id).filter(Boolean));
      }
      if (ids.length !== new Set(fingerprints).size) throw new Error('Algumas linhas foram importadas, mas não puderam ser conciliadas com segurança. A confirmação foi interrompida.');
      let confirmed = 0;
      for (let index = 0; index < ids.length; index += 500) {
        const chunk = ids.slice(index, index + 500);
        const { data, error } = await withTimeout(
          context.client.rpc('confirmar_pagamentos_lote_v1', { p_registro_ids:chunk, p_confirmado:true }),
          15000,
          'O banco demorou para confirmar os pagamentos importados.'
        );
        if (error) throw error;
        const count = Number(data?.total ?? chunk.length);
        if (count !== chunk.length) throw new Error('O banco confirmou menos linhas do que o esperado.');
        confirmed += count;
      }
      return confirmed;
    }

    function updateClosingMonth(monthIndex) {
      const nextMonth = Number(monthIndex); setClosingMonth(nextMonth); setResult(null); setLocalError('');
      if (!file || !workbookRef.current) return;
      const reparsed = parseOfficialWorkbook(file.name, workbookRef.current, { forcedMonthIndex:nextMonth });
      if (reparsed) setOfficial(reparsed);
    }

    async function reconcileImportedOrigin(payload) {
      const fingerprints = payload.map(item => item.registro.fingerprint).filter(Boolean);
      if (official.kind !== 'fechamento') {
        const { data, error } = await withTimeout(
          context.client.rpc('conciliar_origem_acompanhamentos_v1', {
            p_controle:official.control, p_ano:Number(official.year), p_modelo:official.modelFile, p_fingerprints:fingerprints
          }),
          15000,
          'A conciliação da planilha demorou para responder.'
        );
        if (error) throw error;
        return Number(data) || 0;
      }

      const competence = `${official.year}-${String(Number(official.competenceMonthIndex) + 1).padStart(2, '0')}-01`;
      const { data, error } = await withTimeout(
        context.client.rpc('conciliar_origem_competencia_acompanhamentos_v1', {
          p_controle:official.control, p_ano:Number(official.year), p_modelo:official.modelFile,
          p_competencia:competence, p_fingerprints:fingerprints
        }),
        15000,
        'A conciliação desta competência demorou para responder.'
      );
      if (!error) return Number(data) || 0;
      const details = [error.message,error.details,error.hint,error.code].filter(Boolean).join(' · ');
      if (/conciliar_origem_competencia_acompanhamentos_v1|PGRST202|schema cache|could not find the function/i.test(details)) {
        context.notify('O mês foi atualizado sem alterar os demais. Execute o SQL 25 para também remover linhas que saíram deste fechamento.', 'info');
        return 0;
      }
      throw error;
    }

    async function runImport() {
      if (!official || !file) return;
      const payload = official.items || [];
      if (!payload.length) { setLocalError('Nenhum lançamento válido foi encontrado.'); return; }
      if (DEMO_MODE) {
        const demoResult = { criadas:payload.length, atualizadas:0, ignoradas:0, arquivadas:0, confirmadas:['fornecedores','fechamento'].includes(official.kind) ? supplierRevenueFingerprints(payload).length : 0, erros:[] };
        setResult(demoResult); return;
      }
      setImporting(true); setLocalError(''); setResult(null);
      try {
        await preflightOfficialSupplierImport();
        const total = { criadas:0, atualizadas:0, ignoradas:0, arquivadas:0, confirmadas:0, erros:[] };
        for (let index = 0; index < payload.length; index += 300) {
          const chunk = payload.slice(index, index + 300);
          const { data, error } = await withTimeout(
            context.client.rpc('importar_acompanhamentos_v1', { p_controle:official.control, p_ano:Number(official.year), p_nome_arquivo:file.name, p_linhas:chunk }),
            20000,
            'A importação demorou para responder. Nenhuma nova tentativa automática foi feita.'
          );
          if (error) throw error;
          total.criadas += Number(data?.criadas || 0); total.atualizadas += Number(data?.atualizadas || 0); total.ignoradas += Number(data?.ignoradas || 0); total.erros.push(...(data?.erros || []));
        }
        total.arquivadas = await reconcileImportedOrigin(payload);
        if (['fornecedores','fechamento'].includes(official.kind)) total.confirmadas = await confirmOfficialSupplierRows(payload);
        if (official.kind === 'mktg') {
          const { error:syncError } = await withTimeout(context.client.rpc('sincronizar_confirmacoes_mktg_2026_v1'), 15000, 'A sincronização da Receita demorou para responder.');
          if (syncError) {
            const details = [syncError.message, syncError.details, syncError.hint, syncError.code].filter(Boolean).join(' · ');
            if (!/sincronizar_confirmacoes_mktg_2026_v1|PGRST202|schema cache|could not find the function/i.test(details)) throw syncError;
          }
        }
        setResult(total);
        const refreshed = await context.reload(true);
        if (refreshed === false) context.notify('A planilha foi importada, mas a atualização da tela demorou. Reabra a aba para atualizar os dados.', 'info');
        else context.notify('Planilha importada com sucesso.');
      } catch (error) {
        const details = [error?.message,error?.details,error?.hint,error?.code].filter(Boolean).join(' · ');
        if (/importar_acompanhamentos_v1|conciliar_origem_acompanhamentos_v1|PGRST202|could not find the function|schema cache/i.test(details)) {
          setLocalError('O importador do banco ainda não está instalado nesta base. Execute a estrutura de importação da Central e tente novamente.');
        } else setLocalError(error?.message || 'Falha na importação.');
      } finally { setImporting(false); }
    }

    const openImportedData = () => ['fornecedores','fechamento'].includes(official?.kind)
      ? context.navigatePayments({ year:Number(official.year || 2026), pending:false })
      : context.setView('receita');
    const movementCount = official ? sum(official.items || [], item => Array.isArray(item?.pagamentos) ? item.pagamentos.length : 0) : 0;
    const destination = ['fornecedores','fechamento'].includes(official?.kind) ? 'Pagamentos → Receita → Dashboard' : 'Planejamento → Receita → Dashboard';

    return html`<section className="import-simple">
      <div className="import-simple-head"><div><span className="eyebrow">Importar planilha</span><h2>Escolha o Excel e confirme.</h2><p>A Central identifica o modelo e envia os dados para as abas certas.</p></div></div>
      ${!file ? html`<div className=${`import-simple-drop ${dragging ? 'dragging' : ''}`} onDragOver=${event => { event.preventDefault(); setDragging(true); }} onDragLeave=${() => setDragging(false)} onDrop=${event => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }} onClick=${() => inputRef.current?.click()}>
        <input ref=${inputRef} hidden type="file" accept=".xlsx,.xls,.xlsm" onChange=${event => loadFile(event.target.files[0])}/>
        <span className="import-simple-icon"><${Icon} name="file-spreadsheet" size=${28}/></span>
        <h3>Selecionar planilha</h3>
        <p>Fornecedores 20XX, Fechamento ou MKTG 2026</p>
        <button type="button" className="button primary"><${Icon} name="folder-open"/>Escolher arquivo</button>
        ${localError && html`<div className="import-simple-error"><${Icon} name="triangle-alert"/>${localError}</div>`}
      </div>` : html`<div className="import-simple-card">
        <div className="import-simple-file"><span className="file-badge"><${Icon} name=${reading ? 'loader-circle' : official ? 'file-check-2' : 'file-spreadsheet'}/></span><div><strong>${file.name}</strong><small>${reading ? 'Lendo a planilha...' : official ? official.label : 'Arquivo selecionado'}</small></div><button type="button" className="button secondary small" disabled=${reading || importing} onClick=${resetFile}>Trocar arquivo</button></div>
        ${reading ? html`<div className="import-simple-reading"><span className="spinner"></span><p>Reconhecendo o arquivo. Isso deve levar poucos segundos.</p></div>` : localError ? html`<div className="import-simple-error block"><${Icon} name="triangle-alert"/><div><strong>Não foi possível usar esta planilha</strong><p>${localError}</p></div></div>` : official ? html`
          <div className="import-simple-summary">
            <div><span>Modelo</span><strong>${official.label}</strong></div>
            <div><span>Lançamentos</span><strong>${int(official.items.length)}</strong></div>
            <div><span>Movimentos</span><strong>${int(movementCount)}</strong></div>
            <div className="wide"><span>Vai atualizar</span><strong>${destination}</strong></div>
            ${official.kind === 'fechamento' && html`<label className="import-competence"><span>Competência</span><select value=${closingMonth} disabled=${importing || Boolean(result)} onChange=${event => updateClosingMonth(event.target.value)}>${OFFICIAL_MONTHS.map(([, label], index) => html`<option value=${index}>${label} ${official.year}</option>`)}</select><small>Escolha o mês deste fechamento.</small></label>`}
            ${official.kind === 'fechamento' && html`<div className="wide"><span>Escopo protegido</span><strong>Somente ${OFFICIAL_MONTHS[closingMonth][1]} ${official.year}</strong><small>Os outros meses não serão alterados.</small></div>`}
          </div>
          ${result ? html`<div className="import-simple-success"><${Icon} name="circle-check-big"/><div><strong>Importação concluída</strong><p>${int(result.criadas)} novos · ${int(result.atualizadas)} atualizados · ${int(result.arquivadas || 0)} arquivados${Number(result.confirmadas || 0) ? ` · ${int(result.confirmadas)} confirmados` : ''}</p></div></div>` : null}
          <div className="import-simple-actions">${result ? html`<button type="button" className="button primary large" onClick=${openImportedData}>${['fornecedores','fechamento'].includes(official.kind) ? 'Abrir Pagamentos' : 'Abrir Receita'}<${Icon} name="arrow-right"/></button>` : html`<button type="button" className="button primary large" onClick=${runImport} disabled=${importing}>${importing ? html`<span className="spinner"></span>` : html`<${Icon} name="upload"/>`}${importing ? 'Importando...' : official.kind === 'fechamento' ? `Atualizar somente ${OFFICIAL_MONTHS[closingMonth][1]}` : 'Importar planilha'}</button>`}</div>
        ` : null}
      </div>`}
      <p className="import-simple-note"><${Icon} name="shield-check"/>Selecionar o arquivo não altera nada.${official?.kind === 'fechamento' ? html` O Fechamento atualiza <b>somente a competência escolhida</b> e preserva todos os outros meses.` : html` Os dados só são gravados depois da confirmação.`}</p>
    </section>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${AppErrorBoundary}><${App}/></${AppErrorBoundary}>`);
})();
