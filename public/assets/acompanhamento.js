/* PMG Connect — Central de Acompanhamento UX V2.3.10 / React + HTM */
(() => {
  'use strict';

  const { useCallback, useEffect, useMemo, useRef, useState } = React;
  const html = htm.bind(React.createElement);
  const DEMO_MODE = new URLSearchParams(location.search).get('demo') === '1';

  const VIEWS = {
    dashboard: { label: 'Dashboard', eyebrow: 'Visão geral · 2026', icon: 'layout-dashboard' },
    pagamentos: { label: 'Pagamentos', eyebrow: 'Fornecedores · mês a mês', icon: 'table-2' },
    planejamento: { label: 'Planejamento PMG', eyebrow: 'Matriz oficial · 2026', icon: 'target' },
    receita: { label: 'Receita anual', eyebrow: 'Previsão e pagamentos por fornecedor', icon: 'landmark' },
    documentos: { label: 'Documentos', eyebrow: 'Leitura e conferência', icon: 'scan-line' },
    importar: { label: 'Atualizar planilhas', eyebrow: 'Importação das fontes oficiais', icon: 'file-spreadsheet' },
    fechamento: { label: 'Conferência mensal', eyebrow: 'Assinaturas e divergências', icon: 'badge-check' },
    registros: { label: 'Base completa', eyebrow: 'Registros técnicos', icon: 'rows-3' },
    financeiro: { label: 'Agenda financeira', eyebrow: 'Parcelas e previsões', icon: 'wallet-cards' },
  };
  const NAV_VIEW_KEYS = ['dashboard', 'pagamentos', 'planejamento', 'receita', 'documentos', 'importar'];

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
  const supplierKey = value => normalize(value).replace(/\s+/g, ' ');

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

  function refreshIcons() {
    requestAnimationFrame(() => {
      try { window.lucide?.createIcons({ attrs: { 'stroke-width': 1.9 } }); } catch (_) {}
    });
  }

  function Icon({ name, size = 18 }) {
    return html`<i data-lucide=${name} style=${{ width: size, height: size }}></i>`;
  }

  function useLucide(deps) {
    useEffect(refreshIcons, deps);
  }

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
      await window.PMGConnect.ready;
      return { db: window.PMGConnect.client, me: window.PMGConnect.profile, session: window.PMGConnect.session };
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
      const result = await makeQuery().range(offset, offset + pageSize - 1);
      if (result.error) return result;
      const page = result.data || [];
      rows.push(...page);
      if (page.length < pageSize) return { ...result, data:rows };
    }
  }

  async function fetchAll(db) {
    const queries = await Promise.all([
      fetchAllPages(() => db.from('acompanhamento_painel').select('*').order('atualizado_em', { ascending:false }).order('id')),
      fetchAllPages(() => db.from('acompanhamento_pagamentos').select('*').order('vencimento', { ascending:true }).order('id')),
      db.from('colaboradores').select('id,nome,foto_url,cargo,role,ativo').eq('ativo', true).order('nome'),
      fetchAllPages(() => db.from('acompanhamento_anexos').select('*').order('criado_em', { ascending:false }).order('id')),
      db.from('acompanhamento_atividades').select('*').order('criado_em', { ascending:false }).limit(300),
      db.from('acompanhamento_importacoes').select('*').order('criado_em', { ascending:false }).limit(30),
      fetchAllPages(() => db.from('acompanhamento_registros').select('id,pagamento_confirmado,pagamento_confirmado_em,pagamento_confirmado_por').order('id')),
    ]);
    const failed = queries.find(result => result.error);
    if (failed) throw failed.error;
    const documentQueries = await Promise.all([
      fetchAllPages(() => db.from('acompanhamento_documentos_entrada').select('*').order('criado_em', { ascending:false }).order('id')),
      fetchAllPages(() => db.from('acompanhamento_documentos_itens').select('*,entrada:acompanhamento_documentos_entrada(id,nome_arquivo,caminho,mime_type,tamanho_bytes,total_paginas,status,criado_em)').order('criado_em', { ascending:false }).order('id')),
    ]);
    const documentFailure = documentQueries.find(result => result.error);
    const documentsSetupMissing = Boolean(documentFailure && isMissingDocumentSetupError(documentFailure.error));
    if (documentFailure && !documentsSetupMissing) throw documentFailure.error;
    const conferenceQuery = await fetchAllPages(() => db.from('acompanhamento_conferencias').select('*').order('competencia', { ascending:false }).order('id'));
    const conferencesSetupMissing = Boolean(conferenceQuery.error && isMissingConferenceSetupError(conferenceQuery.error));
    if (conferenceQuery.error && !conferencesSetupMissing) throw conferenceQuery.error;
    const confirmationMap = new Map((queries[6].data || []).map(item => [item.id, item]));
    const rawRecords = (queries[0].data || []).map(record => ({ ...record, ...(confirmationMap.get(record.id) || {}) }));
    const records = decorateOfficialRevenueTruth(rawRecords);
    return {
      records, payments:queries[1].data || [], collaborators:queries[2].data || [],
      attachments:queries[3].data || [], activities:queries[4].data || [], imports:queries[5].data || [],
      conferences:conferencesSetupMissing ? [] : (conferenceQuery.data || []), conferencesSetupMissing,
      documents:documentsSetupMissing ? [] : (documentQueries[0].data || []),
      documentItems:documentsSetupMissing ? [] : (documentQueries[1].data || []), documentsSetupMissing
    };
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

  function sourceConfirmsSupplierRow(record, snapshot) {
    if (!snapshot?.hasData || !record?.fornecedor) return false;
    const source = snapshot.bySupplier.get(supplierKey(record.fornecedor));
    const monthIndex = sourceMonthIndex(record);
    // R$ 1,00 é marcador da planilha, não uma linha financeira real da planilha Fornecedores.
    return Number(source?.months?.[monthIndex] || 0) > 1.01;
  }

  function decorateOfficialRevenueTruth(records) {
    const sourceRecords = records || [];
    const snapshots = new Map();
    return sourceRecords.map(record => {
      if (!isSupplierRevenueRecord(record) || Number(record?.ano_referencia || 0) < 2026) return record;
      const year = Number(record.ano_referencia);
      if (!snapshots.has(year)) snapshots.set(year, officialRevenueSnapshot(sourceRecords, year));
      const snapshot = snapshots.get(year);
      if (!sourceConfirmsSupplierRow(record, snapshot)) return record;
      const source = snapshot.bySupplier.get(supplierKey(record.fornecedor));
      return { ...record, _oficial_confirmado:true, _oficial_valor_fonte:Number(source?.months?.[sourceMonthIndex(record)] || 0) };
    });
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

  function App() {
    const [view, setView] = useState('dashboard');
    const [mobileNav, setMobileNav] = useState(false);
    const [commandOpen, setCommandOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [setupMissing, setSetupMissing] = useState(false);
    const [client, setClient] = useState(null);
    const [me, setMe] = useState(null);
    const [data, setData] = useState({ records:[], payments:[], collaborators:[], attachments:[], activities:[], imports:[], conferences:[], conferencesSetupMissing:false, documents:[], documentItems:[], documentsSetupMissing:false });
    const [control, setControl] = useState('todos');
    const [year, setYear] = useState(new Date().getFullYear());
    const [search, setSearch] = useState('');
    const [recordModal, setRecordModal] = useState(null);
    const [paymentModal, setPaymentModal] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [supplierSelected, setSupplierSelected] = useState(null);
    const [paymentJump, setPaymentJump] = useState(null);
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
        const nextData = await fetchAll(client);
        if (requestSeq !== reloadSeqRef.current) return;
        setData(nextData);
        setError(null); setSetupMissing(false);
        return true;
      } catch (fetchError) {
        if (requestSeq !== reloadSeqRef.current) return;
        const missing = isMissingSetupError(fetchError);
        if (missing) setData({ records:[], payments:[], collaborators:[], attachments:[], activities:[], imports:[], conferences:[], conferencesSetupMissing:true, documents:[], documentItems:[], documentsSetupMissing:true });
        setSetupMissing(missing);
        setError(fetchError);
        return false;
      } finally {
        if (requestSeq === reloadSeqRef.current && !quiet) setLoading(false);
      }
    }, [client]);

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
          setClient(connection.db); setMe(connection.me);
        } catch (initError) {
          if (alive) { setError(initError); setLoading(false); }
        }
      })();
      return () => { alive = false; };
    }, []);

    useEffect(() => { if (client) void reload(); }, [client, reload]);

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
      let channel = client.channel('central-acompanhamento-live')
        .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_registros' }, () => void reload(true))
        .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_pagamentos' }, () => void reload(true));
      if (!data.conferencesSetupMissing) {
        channel = channel.on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_conferencias' }, () => void reload(true));
      }
      if (!data.documentsSetupMissing) {
        channel = channel
          .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_documentos_entrada' }, () => void reload(true))
          .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_documentos_itens' }, () => void reload(true));
      }
      subscriptionRef.current = channel.subscribe();
      return () => subscriptionRef.current?.unsubscribe?.();
    }, [client, reload, data.documentsSetupMissing, data.conferencesSetupMissing]);

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
      setPaymentJump({ ...options, token:Date.now() });
      setView('pagamentos');
      requestAnimationFrame(() => window.scrollTo({ top:0, behavior:'smooth' }));
    }, []);
    const openSupplier = useCallback(name => { if (name) { setSelectedId(null); setSupplierSelected(name); } }, []);
    const context = { ...data, records:filteredRecords, allRecords:data.records, activeControl:control, activeYear:year, setControl, setYear, search, setSearch, client, me, reload, notify, saving, setSaving, paymentJump, navigatePayments, openSupplier,
      openRecord:record => setSelectedId(record.id), editRecord:record => setRecordModal(record), newRecord:(defaults = {}) => setRecordModal({ controle:control === 'todos' ? 'marketing' : control, ano_referencia:year === 'todos' ? new Date().getFullYear() : year, ...defaults }),
      newPayment:record => setPaymentModal({ registro_id:record?.id || selectedId }), editPayment:payment => setPaymentModal(payment), saveConference, setView,
      quickUpdateRecord, quickUpdatePayment, quickUpsertPayment, quickTogglePlanningPaid, quickTogglePaid, quickBulkConfirm, quickBulkNF, quickBulkArchive, quickUpdateSupplierRow, quickUpdateSpecificValue };

    useLucide([view, mobileNav, commandOpen, loading, error, setupMissing, selectedId, recordModal, paymentModal, toast, filteredRecords.length]);

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
      setData(current => ({ ...current, records:current.records.some(item => item.id === id)
        ? current.records.map(item => item.id === id ? { ...item, ...patch } : item)
        : [...current.records, { id, ...buildRecordPayload(record || {}, patch) }] }));
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
        if (!DEMO_MODE && await reload(true) === false) {
          notify('Alteração salva. Não foi possível atualizar o restante da base; tente recarregar a página.', 'info');
          return true;
        }
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
      if (record._oficial_confirmado === true) {
        notify('Este pagamento já consta no MKTG 2026 e permanece confirmado pela fonte oficial.', 'info');
        return true;
      }
      const willPay = !supplierRowConfirmed(record, payment);
      const expectedStatus = willPay ? 'pago' : 'previsto';
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
      const valid = (rows || []).filter(row => row?.record?.id);
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
            if (!missingBulkRpc) throw new Error(details || 'O Supabase recusou a confirmação em lote.');

            // Compatibilidade: se o SQL novo ainda não foi instalado, confirma em paralelo
            // em pequenos grupos, evitando o caminho sequencial antigo.
            const concurrency = 6;
            for (let index = 0; index < recordIds.length; index += concurrency) {
              const batch = recordIds.slice(index, index + concurrency);
              const results = await Promise.all(batch.map(id => client.rpc('confirmar_pagamento_linha_v1', { p_registro_id:id, p_confirmado:confirmed })));
              const failed = results.find(result => result.error);
              if (failed?.error) throw failed.error;
            }
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
      const doc = String(documentNumber || '').trim();
      const valid = (rows || []).filter(row => row?.record?.id);
      if (!valid.length || !doc || saving) return false;
      setSaving(true);
      try {
        for (const row of valid) {
          await rpcRecord(row.record, { numero_documento:doc });
          if (row.payment) await rpcPayment(row.payment, row.record.id, { numero_documento:doc, forma_pagamento:officialMethod(doc) });
        }
        if (!DEMO_MODE) await reload(true);
        notify(`NF/documento aplicado em ${valid.length} linha(s).`);
        return true;
      } catch (error) {
        notify(error.message || 'Não foi possível alterar o documento em lote.', 'error');
        return false;
      } finally { setSaving(false); }
    }

    async function quickBulkArchive(records) {
      const valid = (records || []).filter(record => record?.id);
      if (!valid.length || saving) return false;
      setSaving(true);
      try {
        for (const record of valid) await rpcRecord(record, { status:'cancelado' });
        if (!DEMO_MODE) await reload(true);
        notify(`${valid.length} linha(s) arquivada(s).`, 'info');
        return true;
      } catch (error) {
        notify(error.message || 'Não foi possível arquivar as linhas selecionadas.', 'error');
        return false;
      } finally { setSaving(false); }
    }

    async function quickUpdateSupplierRow(record, payment, field, rawValue) {
      const monthIndex = sourceMonthIndex(record);
      if (field === 'campanha') {
        const reference = String(rawValue || '').trim() || 'COTA';
        const supplier = record.fornecedor || 'Fornecedor';
        return quickUpdateRecord(record, { referencia:reference, titulo:`${reference} — ${supplier} — ${OFFICIAL_MONTHS[monthIndex][1]} ${record.ano_referencia}` });
      }
      if (field === 'fornecedor') {
        const supplier = String(rawValue || '').trim();
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
        <${Sidebar} view=${view} setView=${setView} open=${mobileNav} setOpen=${setMobileNav} me=${me} records=${data.records} documentItems=${data.documentItems}/>
        <div className="ac-main">
          <${Topbar} view=${view} search=${search} setSearch=${setSearch} setMobileNav=${setMobileNav} me=${me} context=${context} openCommand=${() => setCommandOpen(true)}/>
          <main className="ac-content">
            ${!['dashboard','pagamentos','documentos','planejamento','receita','fechamento'].includes(view) && html`<${FilterBand} control=${control} setControl=${setControl} year=${year} setYear=${setYear} years=${years} count=${filteredRecords.length}/>`}
            ${setupMissing ? html`<${SetupState}/>` : html`
              <div className="view-stage" key=${view}>
                ${view === 'dashboard' && html`<${OverviewDashboard} context=${context}/>`}
                ${view === 'pagamentos' && html`<${PaymentsView} context=${context}/>`}
                ${view === 'planejamento' && html`<${PlanningView} context=${context}/>`}
                ${view === 'receita' && html`<${RevenueView} context=${context}/>`}
                ${view === 'fechamento' && html`<${ClosingView} context=${context}/>`}
                ${view === 'registros' && html`<${RecordsView} context=${context}/>`}
                ${view === 'financeiro' && html`<${FinanceView} context=${context}/>`}
                ${view === 'documentos' && window.PMGDocumentModule?.DocumentInbox && html`<${DocumentErrorBoundary} onBack=${() => setView('dashboard')}><${window.PMGDocumentModule.DocumentInbox} context=${context}/></${DocumentErrorBoundary}>`}
                ${view === 'documentos' && !window.PMGDocumentModule?.DocumentInbox && html`<${MiniEmpty} icon="scan-line" title="Módulo de documentos indisponível" text="Atualize a página para carregar a Caixa de Entrada."/>`}
                ${view === 'importar' && html`<${ImportView} context=${context} defaultControl=${control} defaultYear=${year}/>`}
              </div>`}
          </main>
        </div>
        ${recordModal && html`<${RecordModal} record=${recordModal} collaborators=${data.collaborators} onClose=${() => setRecordModal(null)} onSave=${saveRecord} saving=${saving}/>`}
        ${paymentModal && html`<${PaymentModal} payment=${paymentModal} records=${data.records} onClose=${() => setPaymentModal(null)} onSave=${savePayment} saving=${saving}/>`}
        ${selected && html`<${RecordDrawer} record=${selected} context=${context} onClose=${() => setSelectedId(null)}/>`}
        ${supplierSelected && html`<${SupplierDrawer} supplier=${supplierSelected} context=${context} onClose=${() => setSupplierSelected(null)}/>`}
        ${commandOpen && html`<${CommandPalette} context=${context} onClose=${() => setCommandOpen(false)}/>`}
        ${toast && html`<${Toast} toast=${toast}/>`}
      </div>`;
  }

  function BootScreen() {
    useLucide([]);
    return html`<div className="boot-screen"><div className="boot-mark"><img src="/imagenssite/pmglogo.png" alt="PMG"/><span></span><span></span><span></span></div><strong>Abrindo as planilhas vivas...</strong><small>Pagamentos · Receita · Planejamento</small></div>`;
  }

  function FatalState({ error }) {
    useLucide([]);
    return html`<div className="fatal-screen"><div className="fatal-card"><span className="fatal-icon"><${Icon} name="shield-alert" size=${34}/></span><p className="eyebrow">PMG Connect</p><h1>Não foi possível abrir a Central</h1><p>${error?.message || 'Falha de autenticação.'}</p><div className="fatal-actions"><a className="button primary" href="/central.html"><${Icon} name="arrow-left"/>Voltar ao início</a><button className="button secondary" onClick=${() => location.reload()}><${Icon} name="refresh-cw"/>Tentar novamente</button></div></div></div>`;
  }

  function SetupState() {
    useLucide([]);
    return html`<section className="setup-state"><div className="setup-orbit"><span></span><span></span><i><${Icon} name="database-zap" size=${32}/></i></div><div><p className="eyebrow">Uma etapa para ativar</p><h2>A interface está pronta. Falta criar a estrutura no banco.</h2><p>Execute <code>sql/06-CENTRAL-ACOMPANHAMENTO.sql</code> no SQL Editor do Supabase. Depois, carregue os dados pelos arquivos numerados da pasta <code>sql/carga-acompanhamento-sql-editor</code> ou pela tela Importar planilhas. A carga integral foi dividida para respeitar o limite do editor.</p><div className="setup-steps"><span><b>1</b>Executar o SQL 06</span><span><b>2</b>Carregar os lotes 07</span><span><b>3</b>Atualizar esta página</span></div><button className="button primary" onClick=${() => location.reload()}><${Icon} name="refresh-cw"/>Já executei, verificar agora</button></div></section>`;
  }

  function Sidebar({ view, setView, open, setOpen, me, records, documentItems = [] }) {
    const overdue = records.filter(record => record.situacao_financeira === 'atrasado').length;
    const pendingDocuments = documentItems.filter(item => item.status === 'aguardando_conferencia').length;
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
            ${['documentos','importar'].map(key => { const item = VIEWS[key]; return html`<button key=${key} className=${`side-link ${view === key ? 'active' : ''}`} onClick=${() => navigate(key)}><span><${Icon} name=${item.icon}/></span><b>${item.label}</b>${key === 'documentos' && pendingDocuments > 0 ? html`<em>${pendingDocuments}</em>` : null}</button>`; })}
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
    const meta = VIEWS[view];
    useLucide([view]);
    const documentView = view === 'documentos';
    return html`<header className="ac-topbar"><div className="topbar-title"><button className="icon-button mobile-only" onClick=${() => setMobileNav(true)}><${Icon} name="menu"/></button><span className="topbar-view-icon"><${Icon} name=${meta.icon}/></span><div><span>${meta.eyebrow}</span><h1>${meta.label}</h1></div></div><div className="topbar-actions"><button className="command-trigger" onClick=${openCommand}><${Icon} name="search"/><span><b>Busca rápida</b><small>Fornecedor, NF, pendentes...</small></span><kbd>Ctrl K</kbd></button><label className="global-search compact-search"><${Icon} name="search"/><input value=${search} onInput=${event => setSearch(event.target.value)} placeholder="Filtrar visão..."/></label><button className="button secondary import-shortcut" onClick=${() => context.setView(documentView ? 'registros' : 'importar')}><${Icon} name=${documentView ? 'rows-3' : 'sheet'}/>${documentView ? 'Acompanhamentos' : 'Importar'}</button><button className="button primary topbar-create" onClick=${documentView ? () => window.dispatchEvent(new CustomEvent('pmg:document-upload')) : context.newRecord}><${Icon} name=${documentView ? 'file-up' : 'plus'}/>${documentView ? 'Enviar PDF' : 'Novo'}</button><div className="topbar-avatar" title=${me?.nome || ''}>${String(me?.nome || 'P').charAt(0)}</div></div></header>`;
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
    const supplierNames = useMemo(() => uniq(context.allRecords.map(item => item.fornecedor)).filter(Boolean), [context.allRecords]);
    const supplierHits = needle ? supplierNames.filter(name => normalize(name).includes(needle.replace(/^fornecedor\s+/,''))).slice(0,4) : [];
    const nfRecords = nfNeedle ? uniq(context.payments.filter(payment => normalize(payment.numero_documento).includes(nfNeedle)).map(payment => payment.registro_id)).map(id => recordMap[id]).filter(Boolean).slice(0,5) : [];
    const recordResults = needle ? context.allRecords.filter(record => normalize([record.codigo,record.fornecedor,record.titulo,record.referencia,record.numero_documento,...(record.tags||[])].join(' ')).includes(needle)).slice(0,7) : [];

    const smart = [];
    if (monthIndex >= 0) smart.push({ type:'smart', icon:wantsPending ? 'circle-dollar-sign' : 'calendar-range', label:`${wantsPending ? 'Pendentes de' : 'Abrir'} ${OFFICIAL_MONTHS[monthIndex][1]}`, detail:wantsPending ? 'Planilha já filtrada somente no que falta confirmar' : 'Ir direto para a competência', action:() => context.navigatePayments({ year:2026, month:monthIndex, pending:wantsPending }) });
    if (/acima da previsao|superou a previsao|mais que previsto/.test(needle)) smart.push({ type:'smart', icon:'trending-up', label:'Fornecedores acima da previsão', detail:'Abrir Receita anual para comparar previsto x realizado', action:() => context.setView('receita') });
    if (/abaixo da previsao|falta receber|menos que previsto/.test(needle)) smart.push({ type:'smart', icon:'trending-down', label:'Fornecedores abaixo da previsão', detail:'Abrir Receita anual e localizar diferenças', action:() => context.setView('receita') });
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
      { label:'Atualizar planilhas', detail:'Importar as fontes oficiais', icon:'file-up', action:() => context.setView('importar') },
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
    const forecastRecords = context.allRecords.filter(record => Number(record.ano_referencia) === year && record.controle === 'marcos' && record.natureza === 'receita' && record.fornecedor && hasTag(record,'previsão') && hasTag(record,'fornecedor') && record.status !== 'cancelado');
    const forecastRevenueBase = sum(forecastRecords, record => record.valor_acordado);
    const planningRecords = context.allRecords.filter(record => Number(record.ano_referencia) === year && record.natureza === 'despesa' && hasTag(record,'planejamento') && record.status !== 'cancelado');
    const planningBase = sum(planningRecords, record => record.valor_acordado);
    const indicators = context.allRecords.filter(record => Number(record.ano_referencia) === year && record.natureza === 'indicador');
    const indicator = tag => Number(indicators.find(record => hasTag(record,tag))?.valor_acordado || 0);
    const forecastRevenue = indicator('receita') || forecastRevenueBase;
    const forecastInvestment = indicator('investimento') || planningBase;
    const forecastBalance = indicator('saldo') || (forecastRevenue - forecastInvestment);

    const officialRevenue = officialRevenueSnapshot(context.allRecords, year);
    const supplierRecords = context.allRecords.filter(record => Number(record.ano_referencia) === year && isSupplierRevenueRecord(record));
    const stages = supplierRecords.map(record => {
      const monthIndex = sourceMonthIndex(record); const payment = supplierRowPayment(context.payments,record,year,monthIndex);
      const stage = supplierRevenueStage(payment,record,context.conferences,year,monthIndex); const expected=Number(record.valor_acordado||0);
      return { record,payment,monthIndex,stage,expected,value:stage==='confirmado'?supplierConfirmedValue(record,payment):0 };
    });
    const confirmedRows=stages.filter(item=>item.stage==='confirmado'); const openRows=stages.filter(item=>item.stage==='a_receber');
    const received=officialRevenue.hasData ? officialRevenue.total : sum(confirmedRows,item=>item.value);
    const toReceiveAmount=Math.max(0, forecastRevenue-received); const realizationPct=forecastRevenue?received/forecastRevenue*100:0;
    const difference=received-forecastRevenue;
    const currentRows=stages.filter(item=>item.monthIndex===currentMonth); const currentConfirmed=currentRows.filter(item=>item.stage==='confirmado');
    const currentConfirmedAmount=officialRevenue.hasData ? Number(officialRevenue.monthlyTotals[currentMonth] || 0) : sum(currentConfirmed,item=>item.value); const currentOpen=currentRows.filter(item=>item.stage==='a_receber');
    const pendingRecords=context.allRecords.filter(record=>Number(record.ano_referencia)===year&&record.categoria==='pendencia'&&!['concluido','cancelado'].includes(record.status));

    const confirmedBySupplier=new Map();
    if (officialRevenue.hasData) officialRevenue.bySupplier.forEach((source,key)=>confirmedBySupplier.set(key,{name:source.name,value:source.total}));
    else confirmedRows.forEach(({record,value})=>{ if(!record.fornecedor)return; const key=supplierKey(record.fornecedor); const row=confirmedBySupplier.get(key)||{name:record.fornecedor,value:0}; row.value+=value; confirmedBySupplier.set(key,row); });
    const forecastBySupplier=new Map(); forecastRecords.forEach(record=>{ const key=supplierKey(record.fornecedor); const row=forecastBySupplier.get(key)||{name:record.fornecedor,forecast:0}; row.forecast+=Number(record.valor_acordado||0); forecastBySupplier.set(key,row); });
    const supplierPerformance=[...forecastBySupplier.entries()].map(([key,row])=>({ ...row, confirmed:confirmedBySupplier.get(key)?.value||0, diff:(confirmedBySupplier.get(key)?.value||0)-row.forecast })).sort((a,b)=>a.diff-b.diff);
    const belowSuppliers=supplierPerformance.filter(item=>item.diff<-.01); const aboveSuppliers=supplierPerformance.filter(item=>item.diff>.01);
    const topSuppliers=[...confirmedBySupplier.values()].sort((a,b)=>b.value-a.value).slice(0,5); const maxSupplier=topSuppliers[0]?.value||1;
    const monthly=OFFICIAL_MONTHS.map(([,label],index)=>{ const rows=stages.filter(item=>item.monthIndex===index); const amount=sum(rows,item=>item.expected); const localConfirmed=sum(rows.filter(item=>item.stage==='confirmado'),item=>item.value); const confirmed=officialRevenue.hasData ? Number(officialRevenue.monthlyTotals[index] || 0) : localConfirmed; const count=rows.length; const confirmedCount=rows.filter(item=>item.stage==='confirmado').length; const pct=amount?Math.min(100,confirmed/amount*100):0; const state=!count&&!confirmed?'empty':count&&confirmedCount===count?'complete':confirmed?'partial':'pending'; return {label,index,amount,confirmed,count,confirmedCount,pct,state,active:index===currentMonth}; });

    useLucide([context.allRecords.length,context.payments.length,currentMonth,pendingRecords.length,openRows.length]);
    return html`<section className="overview-dashboard ux-dashboard-v2">
      <header className="executive-hero">
        <div className="executive-copy"><span className="overview-kicker"><i></i>Central de Acompanhamentos · ${year}</span><h2>Previsto, confirmado e o que exige ação.</h2><p>Uma leitura rápida do ano, com cada número abrindo exatamente a planilha que o explica.</p><div className="executive-actions"><button className="button primary" onClick=${() => context.navigatePayments({year,month:currentMonth})}><${Icon} name="table-2"/>Trabalhar ${OFFICIAL_MONTHS[currentMonth][1]}</button><button className="button secondary hero-secondary" onClick=${() => context.setView('receita')}><${Icon} name="landmark"/>Ver Receita anual</button></div></div>
        <div className="executive-flow"><div><small>Receita prevista</small><strong>${money(forecastRevenue)}</strong></div><span><${Icon} name="arrow-right"/></span><div className="confirmed"><small>Confirmada</small><strong>${money(received)}</strong><em>${Math.round(realizationPct)}%</em></div><span><${Icon} name="arrow-right"/></span><div className=${difference>=0?'positive':'remaining'}><small>${difference>=0?'Acima da previsão':'Ainda falta'}</small><strong>${money(Math.abs(difference))}</strong></div><i><b style=${{width:`${Math.min(100,Math.max(0,realizationPct))}%`}}></b></i></div>
      </header>

      <div className="executive-metrics">
        <button onClick=${() => context.navigatePayments({year,month:currentMonth,pending:true})}><span className="metric-glyph amber"><${Icon} name="circle-dollar-sign"/></span><div><small>FALTA P/ PREVISÃO</small><strong>${money(toReceiveAmount)}</strong><p>Base oficial do MKTG 2026</p></div><${Icon} name="arrow-up-right"/></button>
        <button onClick=${() => context.navigatePayments({year,month:currentMonth})}><span className="metric-glyph green"><${Icon} name="calendar-check"/></span><div><small>CONFIRMADO EM ${OFFICIAL_MONTHS[currentMonth][1].toUpperCase()}</small><strong>${money(currentConfirmedAmount)}</strong><p>${currentConfirmed.length} pagamento(s) confirmado(s)</p></div><${Icon} name="arrow-up-right"/></button>
        <button onClick=${() => context.setView('receita')}><span className="metric-glyph dark"><${Icon} name="trending-down"/></span><div><small>ABAIXO DA PREVISÃO</small><strong>${int(belowSuppliers.length)}</strong><p>${aboveSuppliers.length} fornecedor(es) acima</p></div><${Icon} name="arrow-up-right"/></button>
        <button onClick=${() => context.setView('planejamento')}><span className="metric-glyph violet"><${Icon} name="target"/></span><div><small>INVESTIMENTO PREVISTO</small><strong>${money(forecastInvestment)}</strong><p>Saldo previsto ${money(forecastBalance)}</p></div><${Icon} name="arrow-up-right"/></button>
      </div>

      <div className="dashboard-grid-v2">
        <article className="overview-panel overview-evolution"><div className="overview-panel-head"><div><span>EVOLUÇÃO</span><h3>Receita confirmada por mês</h3><p>Clique no gráfico para abrir a competência.</p></div><button onClick=${() => context.setView('receita')}>Matriz anual <${Icon} name="arrow-up-right"/></button></div><${RevenueComparisonChart} context=${context}/></article>
        <article className="overview-panel attention-v2"><div className="overview-panel-head"><div><span>ATENÇÃO AGORA</span><h3>O que vale abrir primeiro</h3><p>Sem KPI inventado. Só coisa que pede ação.</p></div></div>
          <button className=${currentOpen.length?'attention-item warning':'attention-item ok'} onClick=${() => context.navigatePayments({year,month:currentMonth,pending:true})}><span><${Icon} name=${currentOpen.length?'circle-dollar-sign':'circle-check'}/></span><div><strong>${currentOpen.length} pendente(s) em ${OFFICIAL_MONTHS[currentMonth][1]}</strong><small>${currentOpen.length?`${money(sum(currentOpen,item=>item.expected))} aguardando confirmação`:'Competência em dia'}</small></div><${Icon} name="chevron-right"/></button>
          <button className=${pendingRecords.length?'attention-item danger':'attention-item ok'} onClick=${() => context.navigatePayments({year,month:currentMonth})}><span><${Icon} name=${pendingRecords.length?'triangle-alert':'circle-check'}/></span><div><strong>${pendingRecords.length} pendência(s) registradas</strong><small>${pendingRecords.length?'Observações abertas nas planilhas':'Nenhuma pendência aberta'}</small></div><${Icon} name="chevron-right"/></button>
          <button className=${belowSuppliers.length?'attention-item neutral':'attention-item ok'} onClick=${() => context.setView('receita')}><span><${Icon} name="trending-down"/></span><div><strong>${belowSuppliers.length} fornecedor(es) abaixo da previsão</strong><small>${aboveSuppliers.length} já estão acima do previsto</small></div><${Icon} name="chevron-right"/></button>
        </article>

        <article className="overview-panel annual-timeline-panel"><div className="overview-panel-head"><div><span>COMPETÊNCIAS</span><h3>Janeiro → Dezembro</h3><p>Estado e confirmação do ano inteiro sem trocar de zoom.</p></div></div><div className="annual-timeline">${monthly.map(item=>html`<button className=${`${item.state} ${item.active?'active':''}`} onClick=${() => context.navigatePayments({year,month:item.index})} title=${item.amount?`${money(item.confirmed)} confirmado de ${money(item.amount)}`:'Sem dados'}><span><b>${item.label.slice(0,3)}</b><em>${item.active?'Agora':item.state==='complete'?'Fechado':item.state==='partial'?'Parcial':item.state==='pending'?'Pendente':'—'}</em></span><strong>${item.amount?`${Math.round(item.pct)}%`:'—'}</strong><i><u style=${{width:`${item.pct}%`}}></u></i><small>${item.count?`${item.confirmedCount}/${item.count} linhas`:'sem dados'}</small></button>`)}</div></article>
        <article className="overview-panel overview-suppliers"><div className="overview-panel-head"><div><span>FORNECEDORES</span><h3>Maiores receitas confirmadas</h3><p>Clique em um parceiro para abrir os detalhes sem sair do Dashboard.</p></div></div><div className="top-supplier-list interactive">${topSuppliers.length?topSuppliers.map((item,index)=>html`<button onClick=${() => context.openSupplier(item.name)}><b>${String(index+1).padStart(2,'0')}</b><span><strong>${item.name}</strong><i><em style=${{width:`${item.value/maxSupplier*100}%`}}></em></i></span><small>${money(item.value)}</small><${Icon} name="chevron-right"/></button>`):html`<div className="overview-empty">Nenhuma receita confirmada ainda.</div>`}</div></article>
      </div>

    </section>`;
  }

  function PaymentsView({ context }) {
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
    let rows=supplierRecords.filter(record=>Number(record.ano_referencia)===Number(sheetYear)&&sourceMonthIndex(record)===sheetMonth).map(record=>({record,payment:supplierRowPayment(context.payments,record,sheetYear,sheetMonth)})).sort((a,b)=>Number(a.record.linha_origem||9999)-Number(b.record.linha_origem||9999)||String(a.record.fornecedor).localeCompare(String(b.record.fornecedor),'pt-BR'));
    if(needle)rows=rows.filter(row=>normalize([row.record.fornecedor,row.record.referencia,row.record.numero_documento,row.payment?.numero_documento,row.record.titulo].join(' ')).includes(needle));
    if(supplierDrill)rows=rows.filter(row=>supplierKey(row.record.fornecedor)===supplierKey(supplierDrill));
    if(onlyPending)rows=rows.filter(row=>!supplierRowConfirmed(row.record,row.payment));

    const monthTotal=sum(rows,row=>row.record.valor_acordado); const confirmedRows=rows.filter(row=>supplierRowConfirmed(row.record,row.payment)); const confirmedCount=confirmedRows.length; const confirmedAmount=sum(confirmedRows,row=>supplierConfirmedValue(row.record,row.payment)); const pendingAmount=Math.max(0,monthTotal-confirmedAmount);
    const pendingRecords=context.allRecords.filter(record=>Number(record.ano_referencia)===Number(sheetYear)&&record.categoria==='pendencia'&&record.status!=='cancelado'&&(!record.data_inicio||String(record.data_inicio).startsWith(currentKey)));
    const monthLabelLong=OFFICIAL_MONTHS[sheetMonth]?.[1]||'';
    const addRow=()=>context.newRecord({controle:'marketing',ano_referencia:sheetYear,natureza:'receita',impacta_totais:true,categoria:'cota_anual',referencia:'COTA',titulo:`COTA — Novo fornecedor — ${monthLabelLong} ${sheetYear}`,status:'concluido',prioridade:'normal',data_inicio:officialMonthStart(sheetYear,sheetMonth),data_fim:officialMonthEnd(sheetYear,sheetMonth),centro_custo:'Cota',tags:['marketing','fornecedores',String(sheetYear),monthLabelLong.toLocaleLowerCase('pt-BR'),'cota']});
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
      <${SpreadsheetTitle} kicker="Fonte oficial · Fornecedores" title=${`PLANILHA DE PAGAMENTO ${sheetYear}`} subtitle="Edite na célula, confirme com um clique e use seleção em lote quando o mês apertar." actions=${html`<label className="sheet-select"><span>Ano</span><select value=${sheetYear} onChange=${e=>setSheetYear(Number(e.target.value))}>${yearOptions.map(value=>html`<option value=${value}>${value}</option>`)}</select></label><button className=${`sheet-filter-button ${onlyPending?'active':''}`} onClick=${()=>setOnlyPending(value=>!value)}><${Icon} name="filter"/>${onlyPending?'Só pendentes':'Pendentes'}</button>${pendingVisibleRows.length>0&&html`<button className="confirm-pending-fast" disabled=${context.saving} onClick=${confirmVisiblePending} title=${`Confirmar ${pendingVisibleRows.length} pendente(s) visível(is)`}><${Icon} name="badge-check"/><span>Confirmar pendentes</span><b>${pendingVisibleRows.length}</b></button>`}<button className="sheet-density-toggle" onClick=${toggleDensity}><${Icon} name=${compactMode?'maximize-2':'minimize-2'}/>${compactMode?'Confortável':'Compacta'}</button><button className="button primary sheet-add" onClick=${addRow}><${Icon} name="plus"/>Nova linha</button>`}/>

      <div className="workbook-tabs annual-workbook-tabs" role="tablist">${monthSnapshots.map(item=>{const isNow=Number(sheetYear)===new Date().getFullYear()&&item.index===new Date().getMonth();return html`<button role="tab" aria-selected=${sheetMonth===item.index} className=${`${sheetMonth===item.index?'active':''} ${item.state} ${isNow?'is-now':''}`} onClick=${()=>setSheetMonth(item.index)}><span>${item.label}${isNow&&html`<em>Atual</em>`}</span><strong>${item.total?`${Math.round(item.pct)}%`:'—'}</strong><i><u style=${{width:`${item.pct}%`}}></u></i><small>${item.total?`${compactMoney(item.confirmed)} / ${compactMoney(item.total)}`:'sem dados'}</small></button>`;})}</div>

      <div className="sheet-command-row"><div className="sheet-stats compact-stats"><span className="stat-total"><small>Total</small><strong>${money(monthTotal)}</strong></span><span className="stat-confirmed-value"><small>Confirmado</small><strong>${money(confirmedAmount)}</strong></span><span className="stat-pending-value"><small>Pendente</small><strong>${money(pendingAmount)}</strong></span><span className=${`stat-signed ${confirmedCount===rows.length&&rows.length?'ok':''}`}><small>Status</small><strong>${confirmedCount}/${rows.length}</strong></span></div><div className="active-sheet-filters">${supplierDrill&&html`<button onClick=${()=>setSupplierDrill('')}><${Icon} name="building-2"/>${supplierDrill}<${Icon} name="x"/></button>`}${onlyPending&&html`<button onClick=${()=>setOnlyPending(false)}><${Icon} name="filter"/>Só pendentes<${Icon} name="x"/></button>`}</div></div>

      <article className="spreadsheet-card payments-fullscreen-card"><div className="spreadsheet-scroll assisted-scroll"><table className="live-sheet payment-live-sheet"><thead><tr><th className="select-col"><input type="checkbox" aria-label="Selecionar linhas visíveis" checked=${rows.length>0&&rows.every(row=>selectedRows.has(row.record.id))} onChange=${event=>setSelectedRows(event.target.checked?new Set(rows.map(row=>row.record.id)):new Set())}/></th><th>CAMPANHA</th><th>FORNECEDOR</th><th className="money-col">VALOR</th><th>NF</th><th>STATUS</th><th></th></tr></thead><tbody>
        ${rows.length?rows.map((row,index)=>{const isPaid=supplierRowConfirmed(row.record,row.payment);const sourcePaid=Boolean(row.record._oficial_confirmado);return html`<tr key=${row.record.id} className=${`${isPaid?'signed-row':''} ${selectedRows.has(row.record.id)?'selected-row':''}`} style=${{'--row-delay':`${Math.min(index,35)*12}ms`}}><td className="select-col"><input type="checkbox" checked=${selectedRows.has(row.record.id)} onChange=${()=>toggleSelected(row.record.id)}/></td><td><${EditableSheetCell} value=${row.record.referencia||'COTA'} onSave=${value=>context.quickUpdateSupplierRow(row.record,row.payment,'campanha',value)}/></td><td className="supplier-sheet-cell"><div className="supplier-edit-wrap"><${EditableSheetCell} value=${row.record.fornecedor||''} onSave=${value=>context.quickUpdateSupplierRow(row.record,row.payment,'fornecedor',value)}/><button className="supplier-peek" title="Ver fornecedor" onClick=${()=>context.openSupplier(row.record.fornecedor)}><${Icon} name="panel-right-open"/></button></div></td><td className="money-col unified-value-cell"><${EditableSheetCell} type="money" value=${row.record.valor_acordado} onSave=${value=>context.quickUpdateSupplierRow(row.record,row.payment,'valor',value)}/></td><td><${EditableSheetCell} value=${row.payment?.numero_documento||row.record.numero_documento||''} onSave=${value=>context.quickUpdateSupplierRow(row.record,row.payment,'nf',value)}/></td><td><button disabled=${context.saving} className=${`one-click-status status-simple ${isPaid?'paid':'open'} ${sourcePaid?'source-confirmed':''}`} onClick=${()=>context.quickTogglePaid(row.payment,row.record)} title=${sourcePaid?'Confirmado automaticamente pelo MKTG 2026':isPaid?'Clique para desfazer':'Confirmar pagamento'}><span className="status-dot">${isPaid?'✓':'○'}</span><span>${sourcePaid?'Confirmado · fonte':isPaid?'Confirmado':'Pendente'}</span></button></td><td><button className="sheet-open-row" onClick=${()=>context.openRecord(row.record)} title="Mais detalhes"><${Icon} name="more-horizontal"/></button></td></tr>`;}) : html`<tr className="sheet-empty-row"><td colSpan="7"><div><${Icon} name="sheet"/><strong>Nenhuma linha em ${monthLabelLong} de ${sheetYear}</strong><p>${supplierDrill?'Retire o filtro do fornecedor ou escolha outro mês.':'Crie a primeira linha diretamente por aqui.'}</p><button className="button primary" onClick=${addRow}><${Icon} name="plus"/>Adicionar linha</button></div></td></tr>`}
      </tbody><tfoot><tr><th></th><th colSpan="2">TOTAL</th><th className="money-col">${money(monthTotal)}</th><th></th><th>${confirmedCount} confirmados</th><th></th></tr></tfoot></table></div></article>

      ${selectedRows.size>0&&html`<div className="sheet-selection-bar bulk-actions-v2"><div><strong>${selectedRows.size}</strong><span>${selectedRows.size===1?'linha selecionada':'linhas selecionadas'}</span></div><button onClick=${async()=>{const open=chosenRows.filter(row=>!supplierRowConfirmed(row.record,row.payment));await context.quickBulkConfirm(open,true);clearSelected();}} disabled=${context.saving}><${Icon} name="badge-check"/>Confirmar pendentes</button><button onClick=${setBulkNF} disabled=${context.saving}><${Icon} name="receipt-text"/>Definir NF</button><button className="bulk-archive" onClick=${archiveBulk} disabled=${context.saving}><${Icon} name="archive"/>Arquivar</button><button className="selection-clear" onClick=${clearSelected}><${Icon} name="x"/>Limpar</button></div>`}

      <section className="sheet-pendencies"><div className="sheet-section-heading"><div><span>PENDÊNCIAS</span><h3>${monthLabelLong} ${sheetYear}</h3></div><button onClick=${()=>context.newRecord({controle:'marketing',ano_referencia:sheetYear,natureza:'receita',categoria:'pendencia',titulo:`Pendência — ${monthLabelLong} ${sheetYear}`,referencia:'Observação da planilha mensal',status:'negociacao',prioridade:'alta',data_inicio:officialMonthEnd(sheetYear,sheetMonth),tags:['marketing','pendência',String(sheetYear),monthLabelLong.toLocaleLowerCase('pt-BR')]})}><${Icon} name="plus"/>Adicionar pendência</button></div><div className="pendency-sheet-list">${pendingRecords.length?pendingRecords.map(record=>html`<article className=${record.status==='concluido'?'resolved':''}><span className="pendency-mark"><${Icon} name=${record.status==='concluido'?'circle-check':'triangle-alert'}/></span><div><${EditableSheetCell} value=${record.descricao||record.observacoes||record.titulo} onSave=${value=>context.quickUpdateRecord(record,{descricao:value,observacoes:value})}/><small>${record.fornecedor||'Pendência geral'}${record.valor_acordado?` · ${money(record.valor_acordado)}`:''}</small></div><button className="resolve-one-click" onClick=${()=>context.quickUpdateRecord(record,{status:record.status==='concluido'?'negociacao':'concluido'},record.status==='concluido'?'Pendência reaberta.':'Pendência resolvida.')}><${Icon} name="check"/>${record.status==='concluido'?'Reabrir':'Resolver'}</button></article>`):html`<div className="pendency-empty"><${Icon} name="circle-check-big"/><span>Nenhuma pendência nesta competência.</span></div>`}</div></section>
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
      return Number(planningSourceMeta(record)?.monthly?.[monthIndex] || 0);
    };
    const sourcePlanningPaid = (record, monthIndex) => {
      const stored = record?.dados_originais?.pagos_mensais;
      if (Array.isArray(stored) && stored.length >= 12) return Boolean(stored[monthIndex]);
      return Boolean(planningSourceMeta(record)?.paid?.[monthIndex]);
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
    return { planning, paymentMap, planningCellValue, planningCellPaid, monthTotals, columnTotals, paidColumnTotals, grandTotal, paidTotal, remainingTotal };
  }

  function PlanningView({ context }) {
    const planningScrollRef = useRef(null);
    const { planning, paymentMap, planningCellValue, planningCellPaid, monthTotals, columnTotals, paidColumnTotals, grandTotal, paidTotal, remainingTotal } =
      useMemo(() => buildPlanningSnapshot(context.allRecords, context.payments), [context.allRecords, context.payments]);
    const currentMonth = new Date().getFullYear() === 2026 ? new Date().getMonth() : -1;
    const jumpToPlanningColumn = index => {
      const scroller = planningScrollRef.current; if (!scroller) return;
      const target = scroller.querySelectorAll('.planning-live-sheet thead th')[index + 1]; if (!target) return;
      scroller.scrollTo({ left:Math.max(0, target.offsetLeft - 220), behavior:'smooth' });
    };
    useLucide([planning.length, context.saving]);
    return html`<section className="spreadsheet-view planning-sheet-view">
      <${SpreadsheetTitle} kicker="Fonte oficial · MKTG 2026 / Planejamento" title="PLANEJAMENTO PMG 2026" subtitle="Meses nas linhas e frentes nas colunas, como na fonte oficial. Edite os valores e use o botão de cada mês para marcar pago ou em aberto." actions=${html`<span className="sheet-help"><${Icon} name="mouse-pointer-click"/>Clique no valor para editar</span><button className="button secondary" title="Abrir Documentos e escolher o PDF para uma nova leitura com IA" onClick=${() => context.setView('documentos')}><${Icon} name="scan-line"/>Reescanear PDF com IA</button><button className="button secondary" onClick=${() => context.setView('importar')}><${Icon} name="refresh-cw"/>Reimportar fonte</button>`}/>
      <div className="planning-summary-line"><span><small>Frentes</small><strong>${planning.length}</strong></span><span><small>Total planejado</small><strong>${money(grandTotal)}</strong></span><span className="paid"><small>Já pago</small><strong>${money(paidTotal)}</strong></span><span className="pending"><small>A pagar</small><strong>${money(remainingTotal)}</strong></span></div>
      ${planning.length ? html`<section className="planning-fronts-panel"><div className="planning-fronts-heading"><div><span>Frentes do planejamento</span><strong>${planning.length} elementos oficiais</strong></div><small>Vermelho = pago · escuro = em aberto</small></div><div className="planning-fronts-grid">${planning.map((record,index)=>html`<button onClick=${()=>jumpToPlanningColumn(index)} title=${`Ir para ${planningName(record)}`}><span>${String(index+1).padStart(2,'0')}</span><div><strong>${planningName(record)}</strong><small>${money(columnTotals[index])} planejado</small><em>${money(paidColumnTotals[index])} pago</em></div><${Icon} name="arrow-right"/></button>`)}</div></section>` : html`<div className="planning-missing"><span><${Icon} name="triangle-alert"/></span><div><strong>As frentes do Planejamento 2026 não foram carregadas.</strong><p>A fonte oficial possui 15 frentes. Reimporte o MKTG 2026 para restaurar a matriz.</p></div><button className="button primary" onClick=${()=>context.setView('importar')}><${Icon} name="refresh-cw"/>Reimportar MKTG 2026</button></div>`}
      ${planning.length ? html`<${EasySheetNavigator} scrollRef=${planningScrollRef} focusSelector=".planning-live-sheet .total-head" focusLabel="Ir ao total"/>` : null}
      ${planning.length ? html`<article className="spreadsheet-card planning-card"><div className="spreadsheet-scroll assisted-scroll" ref=${planningScrollRef}><table className="live-sheet planning-live-sheet"><thead><tr><th className="sticky-first">Programação</th>${planning.map(record => html`<th title=${planningName(record)}>${planningName(record)}</th>`)}<th className="total-head">TOTAL</th></tr></thead><tbody>
        ${OFFICIAL_MONTHS.map(([,label],monthIndex) => html`<tr className=${currentMonth === monthIndex ? 'current-month-row' : ''}><th className="sticky-first">${label}${currentMonth === monthIndex && html`<small>agora</small>`}</th>${planning.map(record => { const payment = paymentMap.get(`${record.id}|${monthIndex}`); const value = planningCellValue(record, monthIndex); const paid = planningCellPaid(record, monthIndex); return html`<td className=${`${value ? 'has-value' : 'blank-value'} ${paid ? 'planning-paid-cell' : (value ? 'planning-planned-cell' : '')}`} title=${paid ? 'Pago: valor atual do planejamento' : (payment ? 'Valor salvo no sistema' : (value ? 'Previsto no MKTG 2026' : ''))}><div className="planning-cell-controls"><${EditableSheetCell} type="money" value=${value} disabled=${context.saving} onSave=${next => context.quickUpsertPayment(record,payment,monthIndex,next,{ status:paid ? 'pago' : 'previsto', syncRecordTotal:true, fingerprintLabel:'planejamento' })}/>${value > 0 ? html`<button type="button" className=${`planning-payment-toggle ${paid ? 'is-paid' : 'is-open'}`} disabled=${context.saving} aria-label=${`${paid ? 'Marcar em aberto' : 'Marcar como pago'}: ${planningName(record)}, ${label} de 2026, ${money(value)}`} title=${paid ? 'Reabrir este mês sem apagar seu valor' : 'Registrar este valor como pago hoje'} onClick=${() => context.quickTogglePlanningPaid(record,monthIndex)}><span aria-hidden="true">${paid ? '↶' : '✓'}</span>${paid ? 'Marcar em aberto' : 'Marcar como pago'}</button>` : null}</div></td>`; })}<td className="row-total">${money(monthTotals[monthIndex])}</td></tr>`)}
      </tbody><tfoot><tr><th className="sticky-first">Total</th>${columnTotals.map(value => html`<th>${money(value)}</th>`)}<th>${money(grandTotal)}</th></tr></tfoot></table></div></article>` : null}
      ${planning.length ? html`<div className="sheet-footnote"><${Icon} name="info"/><span>Vermelho indica pago; escuro indica em aberto. Suas alterações atualizam os totais e prevalecem sobre a leitura inicial. O botão de IA abre a Caixa de Documentos para reescanear um PDF; para atualizar a planilha, use Reimportar fonte.</span></div>` : null}
    </section>`;
  }

  function RevenueComparisonChart({ context }) {
    const canvas = useRef(null); const chartRef = useRef(null);
    const series = useMemo(() => {
      const values = { 2025:Array(12).fill(0), 2026:Array(12).fill(0) };
      const official2026 = officialRevenueSnapshot(context.allRecords, 2026);
      if (official2026.hasData) values[2026] = [...official2026.monthlyTotals];
      const records = context.allRecords.filter(record => isSupplierRevenueRecord(record) && [2025, 2026].includes(Number(record.ano_referencia)));
      records.forEach(record => {
        const year = Number(record.ano_referencia);
        if (year === 2026 && official2026.hasData) return;
        const monthIndex = sourceMonthIndex(record);
        const payment = supplierRowPayment(context.payments, record, year, monthIndex);
        if (supplierRevenueStage(payment, record, context.conferences, year, monthIndex) !== 'confirmado') return;
        values[year][monthIndex] += supplierConfirmedValue(record, payment);
      });
      return values;
    }, [context.allRecords, context.payments, context.conferences]);
    useEffect(() => {
      if (!canvas.current || !window.Chart) return undefined;
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvas.current, { type:'line', data:{ labels:OFFICIAL_MONTHS.map(([, label]) => label.slice(0,3)), datasets:[
        { label:'2025', data:series[2025], borderColor:'#9ca9a0', backgroundColor:'rgba(156,169,160,.08)', tension:.32, fill:false, pointRadius:3, borderWidth:2 },
        { label:'2026', data:series[2026], borderColor:'#2a7e4e', backgroundColor:'rgba(42,126,78,.10)', tension:.32, fill:true, pointRadius:3, borderWidth:2.5 },
      ]}, options:{ responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false }, onClick:(_,elements) => { const point=elements?.[0]; if(point) context.navigatePayments({ year:2026, month:point.index }); }, onHover:(event,elements) => { if(event?.native?.target) event.native.target.style.cursor = elements?.length ? 'pointer' : 'default'; }, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, boxWidth:7, font:{ family:'Inter', size:12 } } }, tooltip:{ callbacks:{ label:ctx => `${ctx.dataset.label}: ${money(ctx.raw)}` } } }, scales:{ x:{ grid:{ display:false }, border:{ display:false } }, y:{ beginAtZero:true, border:{ display:false }, grid:{ color:'rgba(16,45,29,.06)' }, ticks:{ font:{ family:'Inter', size:11 }, callback:value => compactMoney(value) } } } } });
      return () => chartRef.current?.destroy();
    }, [series]);
    return html`<div className="revenue-chart"><canvas ref=${canvas}></canvas></div>`;
  }

  function RevenueView({ context }) {
    const revenueScrollRef = useRef(null);
    const forecasts = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.controle === 'marcos' && record.natureza === 'receita' && record.fornecedor && hasTag(record,'previsão') && hasTag(record,'fornecedor') && record.status !== 'cancelado')
      .sort((a,b) => Number(a.linha_origem || 9999) - Number(b.linha_origem || 9999) || String(a.fornecedor).localeCompare(String(b.fornecedor),'pt-BR'));

    const supplierRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && isSupplierRevenueRecord(record));
    const officialRevenue = useMemo(() => officialRevenueSnapshot(context.allRecords, 2026), [context.allRecords]);
    const realizedBySupplier = useMemo(() => {
      const map = new Map();
      supplierRecords.forEach(record => {
        if (!record.fornecedor) return;
        const monthIndex = sourceMonthIndex(record);
        const payment = supplierRowPayment(context.payments, record, 2026, monthIndex);
        const stage = supplierRevenueStage(payment, record, context.conferences, 2026, monthIndex);
        const key = supplierKey(record.fornecedor);
        const row = map.get(key) || { months:OFFICIAL_MONTHS.map(() => ({ confirmed:0, open:0, confirmedCount:0, openCount:0 })) };
        const cell = row.months[monthIndex];
        const expected = Number(payment?.valor_previsto || record.valor_acordado || 0);
        if (stage === 'confirmado') { cell.confirmed += supplierConfirmedValue(record, payment); cell.confirmedCount += 1; }
        else { cell.open += expected; cell.openCount += 1; }
        map.set(key,row);
      });
      return map;
    }, [context.allRecords, context.payments, context.conferences]);

    const rowData = forecasts.map(record => {
      const status = realizedBySupplier.get(supplierKey(record.fornecedor)) || { months:OFFICIAL_MONTHS.map(() => ({ confirmed:0, open:0, confirmedCount:0, openCount:0 })) };
      const source = officialRevenue.bySupplier.get(supplierKey(record.fornecedor));
      const months = source ? [...source.months] : status.months.map(item => item.confirmed);
      const monthStatus = status.months.map((item,index) => {
        const expected = Number(item.confirmed || 0) + Number(item.open || 0);
        const confirmed = Number(months[index] || 0);
        return { ...item, confirmed, open:Math.max(0, expected-confirmed) };
      });
      const total = sum(months,value => value);
      const forecast = Number(record.valor_acordado || 0);
      return { record, months, monthStatus, total, forecast, variance:total-forecast, pct:forecast ? total/forecast*100 : 0 };
    });
    const supplierMonthlyTotals = OFFICIAL_MONTHS.map((_,index) => sum(rowData,row => row.months[index]));
    const monthlyTotals = officialRevenue.hasData ? [...officialRevenue.monthlyTotals] : supplierMonthlyTotals;
    const sourceAdjustments = monthlyTotals.map((value,index) => Math.round((Number(value||0)-Number(supplierMonthlyTotals[index]||0))*100)/100);
    const sourceAdjustmentTotal = sum(sourceAdjustments,value => value);
    const totalForecast = sum(rowData,row => row.forecast);
    const totalReceived = officialRevenue.hasData ? officialRevenue.total : sum(rowData,row => row.total);
    const totalOpen = sum(rowData,row => Math.max(0,row.forecast-row.total));

    const indicators = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.natureza === 'indicador'); const indicator = tag => Number(indicators.find(record => hasTag(record,tag))?.valor_acordado || 0);
    const planningTotal = sum(context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.natureza === 'despesa' && hasTag(record,'planejamento') && record.status !== 'cancelado'),record => record.valor_acordado);
    const forecastInvestment = indicator('investimento') || planningTotal;
    const forecastRevenue = indicator('receita') || totalForecast;
    const forecastBalance = indicator('saldo') || Math.max(0,forecastRevenue-forecastInvestment);
    const closed2025 = context.allRecords.filter(record => Number(record.ano_referencia) === 2025 && record.controle === 'marcos' && record.natureza === 'receita' && record.status !== 'cancelado' && record.impacta_totais !== false);
    const closed2025Total = sum(closed2025,record => record.valor_acordado);

    const currentRevenueMonth = new Date().getMonth();
    const cellState = item => item.open > 0 && item.confirmed === 0 ? 'open' : item.confirmed > 0 ? 'confirmed' : 'empty';
    const cellTitle = (item, label) => {
      const parts = [`${label} 2026`];
      if (item.confirmed) parts.push(`${money(item.confirmed)} confirmado`);
      if (item.open) parts.push(`${money(item.open)} pendente`);
      return parts.join(' · ');
    };

    useLucide([forecasts.length, context.saving, context.conferences?.length]);
    return html`<section className="spreadsheet-view revenue-sheet-view">
      <${SpreadsheetTitle} kicker="Fonte oficial · MKTG 2026 / Receita" title="RECEITA ANUAL 2026" subtitle="Previsão e realizado seguem a aba RECEITA do MKTG 2026. A planilha de Pagamentos é reconciliada com essa fonte." actions=${html`<span className="closed-year-chip"><small>Fechado 2025</small><strong>${money(closed2025Total)}</strong></span><button className="button secondary" onClick=${() => context.setView('importar')}><${Icon} name="refresh-cw"/>Atualizar fonte</button>`}/>
      <section className="budget-strip"><div className="budget-title"><span>PREVISÃO ORÇAMENTÁRIA</span><small>Visão anual antes da matriz</small></div><div className="budget-cell investment"><span>PREV. INVESTIMENTO</span><strong>${money(forecastInvestment)}</strong></div><div className="budget-cell revenue"><span>PREV. RECEITA</span><strong>${money(forecastRevenue)}</strong></div><div className="budget-cell balance"><span>PREV. SALDO</span><strong>${money(forecastBalance)}</strong></div></section>

      <div className="revenue-rule-strip">
        <button className="confirmed" onClick=${() => context.setView('receita')}><i></i><small>Receita confirmada</small><strong>${money(totalReceived)}</strong><em>Pagamentos confirmados</em></button>
        <button className="open" onClick=${() => context.navigatePayments({ year:2026, month:new Date().getMonth(), pending:true })}><i></i><small>A receber</small><strong>${money(totalOpen)}</strong><em>Aguardando confirmação</em></button>
      </div>

      <${EasySheetNavigator} scrollRef=${revenueScrollRef} focusSelector=".revenue-live-sheet thead .current-month-col" focusLabel="Mês atual"/>
      <article className="spreadsheet-card revenue-card"><div className="spreadsheet-scroll assisted-scroll" ref=${revenueScrollRef}><table className="live-sheet revenue-live-sheet"><thead><tr><th className="sticky-first supplier-col">FORNECEDORES</th><th className="forecast-col">PREVISÃO</th>${OFFICIAL_MONTHS.map(([,label], monthIndex) => html`<th className=${monthIndex === currentRevenueMonth ? 'current-month-col' : ''}>${label.toUpperCase()}</th>`)}<th className="total-head">TOTAL</th><th className="balance-head">DIFERENÇA VS. PREVISÃO</th><th>%</th></tr></thead><tbody>
        ${rowData.map(row => html`<tr><th className="sticky-first supplier-col"><button onClick=${() => context.openSupplier(row.record.fornecedor)}>${row.record.fornecedor}<${Icon} name="panel-right-open"/></button></th><td className="forecast-col"><${EditableSheetCell} type="money" value=${row.forecast} onSave=${value => context.quickUpdateRecord(row.record,{ valor_acordado:value },'Previsão atualizada.')}/></td>${row.months.map((value,monthIndex) => {
          const item = row.monthStatus[monthIndex]; const state = cellState(item); const label = OFFICIAL_MONTHS[monthIndex][1];
          return html`<td className=${`derived-revenue-td ${state} ${monthIndex === currentRevenueMonth ? 'current-month-col' : ''}`}><button className="derived-revenue-cell" title=${cellTitle(item,label)} onClick=${() => context.navigatePayments({ year:2026, month:monthIndex, supplier:row.record.fornecedor })}><span>${value ? money(value) : '—'}</span><i></i></button></td>`;
        })}<td className="row-total">${money(row.total)}</td><td className=${`balance-cell ${row.variance > .005 ? 'above' : row.variance < -.005 ? 'below' : 'on-target'}`}>${row.variance > .005 ? html`<span className="variance-value">+ ${money(row.variance)}</span><small>acima</small>` : row.variance < -.005 ? html`<span className="variance-value">${money(Math.abs(row.variance))}</span><small>abaixo</small>` : html`<span className="variance-value">—</span><small>meta atingida</small>`}</td><td><span className=${`revenue-progress ${row.pct >= 100 ? 'target-hit' : row.pct >= 80 ? 'near-target' : 'below-target'}`}><i style=${{ width:`${Math.min(100,row.pct)}%` }}></i><b>${Math.round(row.pct)}%</b></span></td></tr>`)}
        ${Math.abs(sourceAdjustmentTotal) > .005 && html`<tr className="source-adjustment-row"><th className="sticky-first supplier-col"><span>AJUSTES DA FONTE</span><small>Marcadores sem fornecedor no MKTG</small></th><td className="forecast-col">—</td>${sourceAdjustments.map((value,monthIndex)=>html`<td className=${monthIndex===currentRevenueMonth?'current-month-col':''}>${Math.abs(value)>.005?money(value):'—'}</td>`)}<td className="row-total">${money(sourceAdjustmentTotal)}</td><td className="balance-cell on-target"><span className="variance-value">Fonte</span><small>SOMA MENSAL</small></td><td>—</td></tr>`}
      </tbody><tfoot><tr><th className="sticky-first">SOMA MENSAL</th><th>${money(totalForecast)}</th>${monthlyTotals.map((value, monthIndex) => html`<th className=${monthIndex === currentRevenueMonth ? 'current-month-col' : ''}>${money(value)}</th>`)}<th>${money(totalReceived)}</th><th>${totalReceived-totalForecast > .005 ? `+ ${money(totalReceived-totalForecast)} acima` : totalReceived-totalForecast < -.005 ? `${money(Math.abs(totalReceived-totalForecast))} abaixo` : 'Meta atingida'}</th><th>${totalForecast ? `${Math.round(totalReceived/totalForecast*100)}%` : '0%'}</th></tr></tfoot></table></div></article>
      <div className="sheet-footnote revenue-footnote"><${Icon} name="shield-check"/><span><strong>Fonte oficial:</strong> os valores realizados desta matriz vêm diretamente do MKTG 2026. Linhas que já constam na fonte são marcadas automaticamente como confirmadas em Pagamentos; confirmações manuais continuam disponíveis para lançamentos novos.</span></div>
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
    const officialRevenue=officialRevenueSnapshot(context.allRecords,2026); const officialSupplier=officialRevenue.bySupplier.get(supplierKey(supplier));
    const months=OFFICIAL_MONTHS.map(([,label],index)=>{const rows=supplierRows.filter(record=>sourceMonthIndex(record)===index);const expected=sum(rows,record=>record.valor_acordado);const localConfirmed=sum(rows.filter(record=>supplierRowConfirmed(record,supplierRowPayment(context.payments,record,2026,index))),record=>supplierConfirmedValue(record,supplierRowPayment(context.payments,record,2026,index)));const confirmed=officialSupplier?Number(officialSupplier.months[index]||0):localConfirmed;return{index,label,rows,expected,confirmed,pct:expected?Math.min(100,confirmed/expected*100):0};});
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

  function PaymentModal({ payment, records, onClose, onSave, saving }) {
    const editing = Boolean(payment.id); const defaultRecord = payment.registro_id || records[0]?.id || '';
    const submit = event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const status = form.get('status'); const value = parseMoney(form.get('valor_previsto'));
      onSave({ parcela:Number(form.get('parcela') || 1), descricao:form.get('descricao'), valor_previsto:value,
        valor_pago:parseMoney(form.get('valor_pago')) || (status === 'pago' ? value : 0), vencimento:form.get('vencimento'), pago_em:form.get('pago_em'),
        status, forma_pagamento:form.get('forma_pagamento'), favorecido:form.get('favorecido'), numero_documento:form.get('numero_documento'), observacoes:form.get('observacoes') }, payment.id, form.get('registro_id'));
    };
    return html`<${ModalShell} title=${editing ? 'Editar pagamento' : 'Nova previsão de pagamento'} eyebrow="Agenda financeira" icon="receipt-text" onClose=${onClose}><form className="ac-form payment-form" onSubmit=${submit}><div className="form-grid">
      <${Field} label="Acompanhamento" wide=${true}><select name="registro_id" defaultValue=${defaultRecord} required disabled=${editing}><option value="">Selecione...</option>${records.map(item => html`<option value=${item.id}>#${item.codigo || '—'} · ${item.fornecedor || item.titulo} — ${item.titulo}</option>`)}</select>${editing && html`<input type="hidden" name="registro_id" value=${defaultRecord}/>`}</${Field}>
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
    const canonicalFile = `Fornecedores ${year}.xlsx`; const items = []; const totals = [];
    workbook.SheetNames.forEach(sheetName => {
      const monthIndex = Math.max(0, OFFICIAL_MONTHS.findIndex(([key]) => key === normalize(sheetName)));
      const monthLabel = OFFICIAL_MONTHS[monthIndex]?.[1] || sheetName;
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header:1, defval:null, raw:true, blankrows:false });
      let sourceTotal = 0; let calculated = 0;
      rows.slice(2).forEach((row, offset) => {
        const line = offset + 3; const supplierRaw = String(row[1] ?? '').trim(); const categoryRaw = String(row[0] ?? '').trim() || 'COTA';
        if (!supplierRaw || normalize(supplierRaw) === 'fornecedor' || normalize(categoryRaw) === 'total') {
          if (normalize(String(row[0] ?? '')) === 'total') sourceTotal = officialMoney(row[2]);
          return;
        }
        const value = officialMoney(row[2]); if (value <= 0) return;
        const supplier = officialSupplierName(supplierRaw); const document = String(row[3] ?? '').trim(); const specific = specificCostValue(row); const highlighted = specific.value;
        const recordFingerprint = fingerprint(['marketing', 'fornecedores', year, sheetName, line, supplier, categoryRaw]);
        calculated += value;
        items.push(officialItem({
          controle:'marketing', ano_referencia:year, fornecedor:supplier, natureza:'receita', impacta_totais:true,
          categoria:inferCategory(categoryRaw), titulo:`${categoryRaw.replace(/\s+/g, ' ').trim()} — ${supplier} — ${monthLabel} ${year}`,
          descricao:`Verba mensal de fornecedor registrada pelo Marketing.${highlighted > 0 ? ` A fonte destaca ${money(highlighted)} para abertura de centro de custo.` : ''}`,
          referencia:categoryRaw, status:'concluido', data_inicio:officialMonthStart(year, monthIndex), data_fim:officialMonthEnd(year, monthIndex),
          valor_acordado:value, numero_documento:document, tags:['marketing', 'fornecedores', String(year), monthLabel.toLocaleLowerCase('pt-BR'), ...officialTags(categoryRaw)],
          observacoes:highlighted > 0 ? `Centro de custo destacado: ${money(highlighted)}.` : '', origem_importacao:canonicalFile, linha_origem:line,
          fingerprint:recordFingerprint, dados_originais:{ arquivo:canonicalFile, aba:sheetName, linha:line, campanha:categoryRaw, fornecedor_original:supplierRaw, verba:value, nf:document, valor_especifico:highlighted || null },
        }, [{
          parcela:1, descricao:`Competência ${monthLabel} ${year}`, valor_previsto:value, valor_pago:value,
          vencimento:officialMonthEnd(year, monthIndex), pago_em:officialMonthEnd(year, monthIndex), status:'pago', forma_pagamento:officialMethod(document),
          favorecido:supplier, numero_documento:document, observacoes:'A fonte informa apenas a competência mensal; a data exata do movimento não foi registrada.',
          fingerprint:fingerprint([recordFingerprint, 'competencia', year, monthIndex + 1]),
        }]));
        if (highlighted > 0) {
          const center = costCenterFromCampaign(categoryRaw); const outsideVerba = /mtrix|emitrix/.test(normalize(categoryRaw));
          const legacyOutsideColumn = specific.legacy;
          const detailFingerprint = fingerprint(['marketing', 'centro-custo', year, sheetName, line, supplier, categoryRaw, center, specific.columnIndex]);
          items.push(officialItem({
            controle:'marketing', ano_referencia:year, fornecedor:supplier, natureza:'despesa',
            impacta_totais:outsideVerba && !legacyOutsideColumn, categoria:inferCategory(categoryRaw),
            titulo:`Centro de custo — ${center} — ${supplier} — ${monthLabel} ${year}`,
            descricao:outsideVerba ? 'Investimento MTRIX / Emitrix adicional, fora da VERBA recebida do fornecedor.' : 'Abertura do centro de custo já contida na VERBA recebida; não deve ser somada novamente à receita.',
            referencia:categoryRaw, status:'concluido', data_inicio:officialMonthStart(year, monthIndex), data_fim:officialMonthEnd(year, monthIndex),
            valor_acordado:highlighted, centro_custo:center, numero_documento:document,
            tags:['marketing','centro-custo',String(year),monthLabel.toLocaleLowerCase('pt-BR'), outsideVerba ? 'adicional-investimento' : 'dentro-verba', ...(legacyOutsideColumn ? ['legado-fora-coluna-valor'] : []), ...officialTags(categoryRaw)],
            observacoes:legacyOutsideColumn ? `Valor legado encontrado na coluna ${XLSX.utils.encode_col(specific.columnIndex)}; preservado para auditoria e excluído dos KPIs automáticos.` : (outsideVerba ? 'MTRIX / Emitrix fica fora da VERBA e entra como investimento adicional.' : 'Valor já incluído na VERBA. O registro serve para de-para e centro de custo.'),
            origem_importacao:canonicalFile, linha_origem:line, fingerprint:detailFingerprint,
            dados_originais:{ arquivo:canonicalFile, aba:sheetName, linha:line, campanha:categoryRaw, fornecedor_original:supplierRaw, verba_recebida:value, valor_centro_custo:highlighted, incluido_na_verba:!outsideVerba, coluna_valor:XLSX.utils.encode_col(specific.columnIndex), legado_fora_coluna_valor:legacyOutsideColumn },
          }, [{ parcela:1, descricao:`Centro de custo — ${monthLabel} ${year}`, valor_previsto:highlighted, valor_pago:highlighted,
            vencimento:officialMonthEnd(year, monthIndex), pago_em:officialMonthEnd(year, monthIndex), status:'pago', forma_pagamento:officialMethod(document),
            favorecido:supplier, numero_documento:document, observacoes:outsideVerba ? 'Investimento adicional fora da verba.' : 'Detalhamento já incluído na verba recebida.',
            fingerprint:fingerprint([detailFingerprint, 'centro-custo', year, monthIndex + 1]) }]));
        }
      });
      rows.slice(2).forEach((row, offset) => {
        const note = String(row[0] ?? '').trim(); if (!note || !/pendent|falta|ainda nao|faltou/.test(normalize(note))) return;
        const line = offset + 3; const noteValue = officialMoney(note.match(/R\$\s*[\d.,]+/i)?.[0]);
        items.push(officialItem({
          controle:'marketing', ano_referencia:year, natureza:'receita', impacta_totais:noteValue > 0, categoria:'pendencia',
          titulo:`Pendência — ${monthLabel} ${year}`, descricao:note, referencia:'Observação da planilha mensal', status:'negociacao', prioridade:'alta',
          data_inicio:officialMonthEnd(year, monthIndex), valor_acordado:noteValue, tags:['marketing', 'pendência', String(year), monthLabel.toLocaleLowerCase('pt-BR')],
          observacoes:note, origem_importacao:canonicalFile, linha_origem:line,
          fingerprint:fingerprint(['marketing', 'fornecedores', year, sheetName, line, note]),
          dados_originais:{ arquivo:canonicalFile, aba:sheetName, linha:line, observacao:note },
        }));
      });
      totals.push({ sheet:sheetName, expected:sourceTotal, calculated:Math.round(calculated * 100) / 100 });
    });
    return { kind:'fornecedores', label:`Modelo oficial Fornecedores ${year}`, modelFile:canonicalFile, control:'marketing', year, items, totals,
      warnings:totals.filter(item => Math.abs(item.expected - item.calculated) > .01).map(item => `${item.sheet}: diferença de ${money(item.calculated - item.expected)}`) };
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

  function parseOfficialWorkbook(fileName, workbook) {
    const supplierMatch = fileName.match(/fornecedores\D*(20\d{2})/i);
    if (supplierMatch) return parseOfficialSupplierWorkbook(fileName, workbook, Number(supplierMatch[1]));
    if (/mktg|marketing/i.test(fileName) && workbook.Sheets.RECEITA && workbook.Sheets.Planejamento) return parseOfficialMarcosWorkbook(fileName, workbook);
    return null;
  }

  function ImportView({ context, defaultControl, defaultYear }) {
    const inputRef = useRef(null); const workbookRef = useRef(null);
    const [file, setFile] = useState(null); const [sheets, setSheets] = useState([]); const [sheet, setSheet] = useState('');
    const [headers, setHeaders] = useState([]); const [rows, setRows] = useState([]); const [mapping, setMapping] = useState({});
    const [official, setOfficial] = useState(null);
    const [control, setControl] = useState(defaultControl === 'marcos' ? 'marcos' : 'marketing');
    const [year, setYear] = useState(defaultYear === 'todos' ? new Date().getFullYear() : Number(defaultYear));
    const [importing, setImporting] = useState(false); const [result, setResult] = useState(null); const [dragging, setDragging] = useState(false);
    useLucide([file?.name, sheet, headers.length, rows.length, importing, result, official?.kind]);

    function scoreHeaderRow(grid) {
      let best = { index:0, score:-1 };
      grid.slice(0, 30).forEach((row, index) => {
        const values = (row || []).map(normalize).filter(Boolean);
        const hits = values.filter(value => Object.values(HEADER_SYNONYMS).flat().some(alias => value === normalize(alias) || value.includes(normalize(alias)))).length;
        const score = values.length + hits * 5;
        if (score > best.score) best = { index, score };
      });
      return best.index;
    }

    function suggestMapping(nextHeaders) {
      const next = {};
      IMPORT_FIELDS.forEach(([field]) => {
        const aliases = (HEADER_SYNONYMS[field] || [field]).map(normalize);
        const exact = nextHeaders.find(item => aliases.includes(normalize(item.label)));
        const partial = nextHeaders.find(item => aliases.some(alias => normalize(item.label).includes(alias) || alias.includes(normalize(item.label))));
        const match = exact || partial; if (match) next[field] = String(match.index);
      });
      return next;
    }

    function readSheet(name, workbook = workbookRef.current) {
      if (!workbook || !name) return;
      const grid = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header:1, defval:'', raw:true, blankrows:false });
      const headerIndex = scoreHeaderRow(grid);
      const nextHeaders = (grid[headerIndex] || []).map((value, index) => ({ index, label:String(value || `Coluna ${XLSX.utils.encode_col(index)}`).trim() || `Coluna ${XLSX.utils.encode_col(index)}` }));
      const nextRows = grid.slice(headerIndex + 1).filter(row => row.some(value => String(value ?? '').trim() !== ''));
      setOfficial(null); setSheet(name); setHeaders(nextHeaders); setRows(nextRows); setMapping(suggestMapping(nextHeaders)); setResult(null);
    }

    async function loadFile(nextFile) {
      if (!nextFile) return;
      if (!/\.(xlsx|xls|xlsm|csv)$/i.test(nextFile.name)) return context.notify('Envie um arquivo Excel ou CSV.', 'error');
      try {
        const buffer = await nextFile.arrayBuffer(); const workbook = XLSX.read(buffer, { type:'array', cellDates:true, cellStyles:true, bookFiles:true });
        workbookRef.current = workbook; setFile(nextFile); setSheets(workbook.SheetNames);
        const detected = parseOfficialWorkbook(nextFile.name, workbook);
        if (detected) {
          setOfficial(detected); setRows(detected.items); setHeaders([]); setMapping({}); setSheet('Todas as abas');
          setControl(detected.control); setYear(detected.year); setResult(null);
          context.notify(`${detected.label} reconhecido: ${detected.items.length} registros prontos para conciliação.`, 'info');
          return;
        }
        const sizes = workbook.SheetNames.map(name => ({ name, rows:XLSX.utils.sheet_to_json(workbook.Sheets[name], { header:1, blankrows:false }).length })).sort((a, b) => b.rows - a.rows);
        readSheet(sizes[0]?.name || workbook.SheetNames[0], workbook);
      } catch (error) { context.notify(error.message || 'Não foi possível ler a planilha.', 'error'); }
    }

    function cell(row, field) { const index = mapping[field]; return index === undefined || index === '' ? '' : row[Number(index)]; }

    function mappedPayload(sourceRows = rows) {
      return sourceRows.map((row, index) => {
        const supplier = String(cell(row, 'fornecedor') || '').trim(); const rawCategory = cell(row, 'categoria');
        const title = String(cell(row, 'titulo') || '').trim() || String(cell(row, 'referencia') || '').trim() || `${rawCategory ? category(inferCategory(rawCategory)).label : 'Acompanhamento'}${supplier ? ` — ${supplier}` : ''}`;
        const value = parseMoney(cell(row, 'valor_acordado')); const paidAt = normalizeDate(cell(row, 'pago_em')); const due = normalizeDate(cell(row, 'vencimento'));
        const recordFingerprint = fingerprint([control, year, supplier, title, cell(row, 'referencia'), cell(row, 'numero_documento')]);
        const registro = {
          controle:control, ano_referencia:year, fornecedor:supplier, fornecedor_codigo:String(cell(row, 'fornecedor_codigo') || '').trim(),
          natureza:normalize(cell(row, 'natureza')).includes('desp') ? 'despesa' : normalize(cell(row, 'natureza')).includes('rece') ? 'receita' : (control === 'marketing' ? 'receita' : 'neutro'), impacta_totais:true,
          categoria:inferCategory(rawCategory), titulo, descricao:String(cell(row, 'descricao') || '').trim(), referencia:String(cell(row, 'referencia') || '').trim(),
          status:inferRecordStatus(cell(row, 'status')), prioridade:'normal', data_inicio:normalizeDate(cell(row, 'data_inicio')), data_fim:normalizeDate(cell(row, 'data_fim')),
          valor_acordado:value, centro_custo:String(cell(row, 'centro_custo') || '').trim(), numero_documento:String(cell(row, 'numero_documento') || '').trim(),
          contato_nome:String(cell(row, 'contato_nome') || '').trim(), contato_email:String(cell(row, 'contato_email') || '').trim(), contato_telefone:String(cell(row, 'contato_telefone') || '').trim(),
          observacoes:String(cell(row, 'observacoes') || '').trim(), tags:['importado', String(year)], fingerprint:recordFingerprint,
          dados_originais:Object.fromEntries(headers.map(header => [header.label, row[header.index] ?? '']))
        };
        const hasPayment = value > 0 || due || paidAt || cell(row, 'forma_pagamento') || cell(row, 'status_pagamento');
        const paymentStatus = inferPaymentStatus(cell(row, 'status_pagamento'), paidAt);
        const pagamentos = hasPayment ? [{ parcela:1, descricao:'Pagamento importado', valor_previsto:value, valor_pago:paymentStatus === 'pago' ? value : 0,
          vencimento:due, pago_em:paidAt, status:paymentStatus, forma_pagamento:String(cell(row, 'forma_pagamento') || '').trim(),
          numero_documento:String(cell(row, 'numero_documento') || '').trim(), observacoes:String(cell(row, 'observacoes') || '').trim(),
          fingerprint:fingerprint([recordFingerprint, 'pagamento-importado']) }] : [];
        return { registro, pagamentos, _line:index + 2 };
      }).filter(item => item.registro.titulo && normalize(item.registro.titulo) !== 'acompanhamento');
    }

    async function runImport() {
      const payload = official?.items || mappedPayload(); if (!payload.length) return context.notify('Nenhuma linha válida para importar.', 'error');
      if (!official && !mapping.fornecedor && !mapping.titulo && !mapping.referencia) return context.notify('Mapeie pelo menos fornecedor, título ou referência.', 'error');
      if (DEMO_MODE) { setResult({ criadas:payload.length, atualizadas:0, ignoradas:0, arquivadas:0, erros:[] }); return context.notify('Prévia de importação concluída.', 'info'); }
      setImporting(true); setResult(null);
      try {
        const chunks = []; for (let index = 0; index < payload.length; index += 300) chunks.push(payload.slice(index, index + 300));
        const total = { criadas:0, atualizadas:0, ignoradas:0, arquivadas:0, erros:[] };
        for (let index = 0; index < chunks.length; index += 1) {
          const { data, error } = await context.client.rpc('importar_acompanhamentos_v1', { p_controle:control, p_ano:Number(year), p_nome_arquivo:file.name, p_linhas:chunks[index] });
          if (error) throw error; total.criadas += data.criadas || 0; total.atualizadas += data.atualizadas || 0; total.ignoradas += data.ignoradas || 0; total.erros.push(...(data.erros || []));
        }
        if (official) {
          const { data:archived, error:reconcileError } = await context.client.rpc('conciliar_origem_acompanhamentos_v1', {
            p_controle:control, p_ano:Number(year), p_modelo:official.modelFile,
            p_fingerprints:payload.map(item => item.registro.fingerprint).filter(Boolean),
          });
          if (reconcileError) throw reconcileError;
          total.arquivadas = Number(archived) || 0;
          if (official.kind === 'mktg') {
            const { error:syncError } = await context.client.rpc('sincronizar_confirmacoes_mktg_2026_v1');
            if (syncError) {
              const details = [syncError.message, syncError.details, syncError.hint, syncError.code].filter(Boolean).join(' · ');
              const missingSync = /sincronizar_confirmacoes_mktg_2026_v1|PGRST202|schema cache|could not find the function/i.test(details);
              if (!missingSync) throw syncError;
            }
          }
        }
        setResult(total); await context.reload(true); context.notify(`${total.criadas + total.atualizadas} registros conciliados.`);
      } catch (error) { context.notify(error.message || 'Falha na importação.', 'error'); }
      finally { setImporting(false); }
    }

    const preview = official ? official.items.slice(0, 5) : mappedPayload(rows.slice(0, 5));
    return html`<section className="import-section"><div className="import-hero"><div><span className="eyebrow light">Importador inteligente</span><h2>Traga anos de planilhas<br/>para uma única história.</h2><p>A Central reconhece colunas, sugere correspondências e preserva a linha original para auditoria.</p></div><div className="import-features"><span><${Icon} name="wand-sparkles"/><b>Mapeamento automático</b><small>Reconhece nomes parecidos</small></span><span><${Icon} name="shield-check"/><b>Sem duplicar</b><small>Identifica reimportações</small></span><span><${Icon} name="history"/><b>Rastreável</b><small>Arquivo e linha de origem</small></span></div></div>
      ${!file ? html`<div className=${`import-drop ${dragging ? 'dragging' : ''}`} onDragOver=${event => { event.preventDefault(); setDragging(true); }} onDragLeave=${() => setDragging(false)} onDrop=${event => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }} onClick=${() => inputRef.current?.click()}><input ref=${inputRef} hidden type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange=${event => loadFile(event.target.files[0])}/><div className="import-drop-art"><span><${Icon} name="file-spreadsheet" size=${40}/></span><i></i><i></i><i></i></div><h3>Solte sua planilha aqui</h3><p>Excel ou CSV · controles de 2024, 2025, 2026 e futuras atualizações</p><button className="button primary"><${Icon} name="folder-open"/>Escolher arquivo</button></div>` : html`<div className="import-workspace"><div className="import-file-bar"><span className="file-badge"><${Icon} name="file-spreadsheet"/></span><div><strong>${file.name}</strong><small>${int(rows.length)} registros reconhecidos · ${sheets.length} aba(s)</small></div><label><span>Leitura</span>${official ? html`<select disabled><option>Todas as abas</option></select>` : html`<select value=${sheet} onChange=${event => readSheet(event.target.value)}>${sheets.map(name => html`<option value=${name}>${name}</option>`)}</select>`}</label><label><span>Destino</span><select value=${control} disabled=${Boolean(official)} onChange=${event => setControl(event.target.value)}><option value="marketing">Marketing / Fornecedores</option><option value="marcos">Marcos / Presidência</option></select></label><label><span>Ano</span><input type="number" value=${year} disabled=${Boolean(official)} min="2000" max="2200" onInput=${event => setYear(Number(event.target.value))}/></label><button className="icon-button" title="Trocar arquivo" onClick=${() => { setFile(null); setRows([]); setOfficial(null); setResult(null); workbookRef.current = null; }}><${Icon} name="x"/></button></div>
        ${official ? html`<div className="mapping-panel official-detection"><div className="official-detection-icon"><${Icon} name="badge-check" size=${25}/></div><div><span className="eyebrow">Modelo oficial reconhecido</span><h3>${official.label}</h3><p>A Central leu todas as abas, preservou os totais oficiais do MKTG 2026 e preparou uma atualização sem duplicidades.</p><div className="official-stats"><span><b>${int(official.items.length)}</b> acompanhamentos</span><span><b>${int(sum(official.items, item => item.pagamentos.length))}</b> movimentos</span><span><b>${int(sheets.length)}</b> abas processadas</span></div>${official.warnings.length ? html`<div className="official-warning"><${Icon} name="triangle-alert"/>${official.warnings.join(' · ')}</div>` : html`<div className="official-ok"><${Icon} name="shield-check"/>Totais das abas conferidos.</div>`}</div></div>` : html`<div className="mapping-panel"><div className="mapping-head"><div><span className="eyebrow">Correspondência das colunas</span><h3>Confirme o que cada coluna significa</h3><p>As sugestões já foram preenchidas. Ajuste somente o que precisar.</p></div><span className="mapping-score"><b>${Object.keys(mapping).length}</b> campos reconhecidos</span></div><div className="mapping-grid">${IMPORT_FIELDS.map(([field, label]) => html`<label><span>${label}</span><div><${Icon} name="arrow-left-right"/><select value=${mapping[field] ?? ''} onChange=${event => setMapping(current => ({ ...current, [field]:event.target.value }))}><option value="">Não importar</option>${headers.map(header => html`<option value=${header.index}>${header.label}</option>`)}</select></div></label>`)}</div></div>`}
        <div className="import-preview"><div className="mapping-head"><div><span className="eyebrow">Prévia normalizada</span><h3>É assim que os primeiros registros entrarão</h3></div></div><div className="preview-table-wrap"><table><thead><tr><th>Fornecedor</th><th>Acompanhamento</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>${preview.map(item => html`<tr><td><strong>${item.registro.fornecedor || '—'}</strong></td><td>${item.registro.titulo}</td><td>${category(item.registro.categoria).label}</td><td>${money(item.registro.valor_acordado)}</td><td>${item.pagamentos[0]?.vencimento ? date(item.pagamentos[0].vencimento) : '—'}</td><td><span className=${`status-pill ${item.registro.status}`}><i></i>${RECORD_STATUS[item.registro.status]?.label}</span></td></tr>`)}</tbody></table></div></div>
        ${result && html`<div className="import-result"><span><${Icon} name="party-popper" size=${30}/></span><div><strong>Importação concluída</strong><p><b>${result.criadas}</b> novos, <b>${result.atualizadas}</b> atualizados, <b>${result.arquivadas || 0}</b> arquivados e <b>${result.ignoradas}</b> ignorados.</p>${result.erros?.length ? html`<small>${result.erros.length} linha(s) precisam de revisão.</small>` : html`<small>Todos os dados válidos foram processados.</small>`}</div><button className="button secondary" onClick=${() => context.setView('registros')}>Ver acompanhamentos <${Icon} name="arrow-right"/></button></div>`}
        <div className="import-footer"><div><${Icon} name="info"/><p>Nos modelos oficiais, itens alterados são atualizados e os que saíram da planilha são arquivados com histórico. Importações livres nunca removem registros.</p></div><button className="button primary large" onClick=${runImport} disabled=${importing || !rows.length}>${importing ? html`<span className="spinner"></span>` : html`<${Icon} name="database-zap"/>`}${importing ? 'Processando planilha...' : `Importar ${int(rows.length)} linhas`}</button></div>
        </div>`}
      <div className="import-history"><div className="panel-heading compact"><div><span className="eyebrow">Rastreabilidade</span><h2>Importações recentes</h2></div></div>${context.imports.length ? context.imports.slice(0, 5).map(item => html`<div className="import-history-row"><span><${Icon} name="file-check-2"/></span><div><strong>${item.nome_arquivo}</strong><small>${item.controle === 'marcos' ? 'Marcos' : 'Marketing'} · ${item.ano_referencia || 'Vários anos'} · ${dateTime(item.criado_em)}</small></div><b>${int(item.linhas_criadas + item.linhas_atualizadas)} processados</b></div>`) : html`<${MiniEmpty} icon="history" title="Nenhuma importação registrada" text="O histórico dos arquivos enviados aparecerá aqui."/>`}</div></section>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${AppErrorBoundary}><${App}/></${AppErrorBoundary}>`);
})();
