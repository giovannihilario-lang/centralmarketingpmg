/* PMG Connect — Central de Acompanhamento V1.6.2 / React + HTM */
(() => {
  'use strict';

  const { useCallback, useEffect, useMemo, useRef, useState } = React;
  const html = htm.bind(React.createElement);
  const DEMO_MODE = new URLSearchParams(location.search).get('demo') === '1';

  const VIEWS = {
    dashboard: { label: 'Visão geral', eyebrow: 'Central de Acompanhamento', icon: 'layout-dashboard' },
    planejamento: { label: 'Planejamento PMG', eyebrow: 'Estratégia e execução 2026', icon: 'target' },
    receita: { label: 'Receita', eyebrow: 'Recebíveis, investimento e saldo', icon: 'landmark' },
    fechamento: { label: 'Fechamento mensal', eyebrow: 'Previsto, recebido e conferido', icon: 'badge-check' },
    registros: { label: 'Acompanhamentos', eyebrow: 'Operação completa', icon: 'rows-3' },
    financeiro: { label: 'Central financeira', eyebrow: 'Receita, pagamentos e conferência', icon: 'wallet-cards' },
    fornecedores: { label: 'Parceiros', eyebrow: 'Mapa de fornecedores', icon: 'building-2' },
    documentos: { label: 'Caixa de documentos', eyebrow: 'Leitura e conferência', icon: 'scan-line' },
    importar: { label: 'Importar planilhas', eyebrow: 'Migração inteligente', icon: 'file-spreadsheet' },
  };
  const SIDEBAR_VIEWS = ['dashboard', 'planejamento', 'financeiro', 'registros', 'documentos', 'importar'];
  const FINANCE_VIEWS = ['receita', 'financeiro', 'fechamento', 'fornecedores'];

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
    receita: { label: 'Receita / verba', icon: 'trending-up', tone: 'positive' },
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

  const PLANNING_ACTIVITY_STATUS = {
    planejada:{ label:'Planejada', icon:'circle-dashed' },
    em_andamento:{ label:'Em andamento', icon:'loader-circle' },
    bloqueada:{ label:'Bloqueada', icon:'octagon-alert' },
    concluida:{ label:'Concluída', icon:'circle-check-big' },
  };

  const FINANCE_STATUS = {
    sem_pagamentos: 'Sem parcelas', pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago', atrasado: 'Atrasado', cancelado: 'Cancelado'
  };

  const DOCUMENT_TYPE_LABELS = Object.freeze({
    desconto_nota:'Desconto em nota', deposito:'Depósito', extrato_bancario:'Extrato bancário', nao_identificado:'Não identificado',
    cadastro_pagamento:'Desconto em nota', pedido_compra:'Desconto em nota', danfe:'Depósito',
  });
  const documentTypeLabel = value => DOCUMENT_TYPE_LABELS[value] || String(value || 'Documento').replaceAll('_', ' ');

  const RECEIPT_METHODS = [
    { key:'desconto', label:'Desconto em boleto', icon:'receipt-text', tone:'discount' },
    { key:'deposito', label:'Depósito', icon:'landmark', tone:'deposit' },
    { key:'bonificacao', label:'Bonificação', icon:'gift', tone:'bonus' },
    { key:'sobra', label:'Sobra Marketing', icon:'piggy-bank', tone:'surplus' },
  ];
  const PAYMENT_METHODS = ['Desconto em boleto', 'Depósito', 'Bonificação', 'Sobra Marketing', 'Depósito + desconto em boleto', 'PIX', 'TED', 'Transferência bancária', 'Boleto', 'Nota fiscal / faturamento', 'Cartão', 'Patrocínio', 'Consolidado anual', 'Permuta', 'Dinheiro', 'Não informado', 'Outro'];
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
  const validDate = value => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const date = value => {
    const parsed = validDate(value ? `${String(value).slice(0, 10)}T12:00:00` : null);
    return parsed ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed) : 'Sem data';
  };
  const dateTime = value => {
    const parsed = validDate(value);
    return parsed ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed) : '';
  };
  const monthLabel = value => new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(value).replace('.', '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const isOverdue = payment => payment.status !== 'pago' && payment.status !== 'cancelado' && payment.vencimento && payment.vencimento < todayKey();
  const category = value => CATEGORIES[value] || { label: value || 'Outro', icon: 'shapes', tone: 'slate' };
  const uniq = values => [...new Set(values.filter(Boolean))];
  const sum = (rows, getter) => rows.reduce((total, item) => total + Number(getter(item) || 0), 0);
  const tagList = record => {
    const value = record?.tags;
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value !== 'string') return [];
    const text = value.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch (_) {}
    }
    return text.replace(/^\{|\}$/g, '').split(',').map(item => item.replace(/^"|"$/g, '').trim()).filter(Boolean);
  };
  const hasTag = (record, tag) => tagList(record).some(item => normalize(item) === normalize(tag));
  const workflow = record => {
    if (record?.categoria === 'pendencia' || hasTag(record, 'haver')) return { key:'pending', label:'Pendência', icon:'triangle-alert' };
    if (hasTag(record, 'planejamento')) return { key:'planning', label:'Planejamento', icon:'target' };
    if (record?.natureza === 'indicador') return { key:'indicator', label:'Indicador', icon:'gauge' };
    if (record?.impacta_totais === false || hasTag(record, 'detalhamento')) return { key:'execution', label:'Detalhamento', icon:'layers-2' };
    if (record?.natureza === 'despesa') return { key:'investment', label:'Investimento', icon:'trending-down' };
    if (record?.natureza === 'receita') return { key:'receipt', label:'Recebimento', icon:'trending-up' };
    return { key:'operation', label:'Operação', icon:'circle-dot' };
  };
  const sourceLabel = record => record?.origem_importacao || record?.dados_originais?.arquivo || 'Lançamento manual';
  const paymentValue = payment => Number(payment?.valor_pago || (payment?.status === 'pago' ? payment?.valor_previsto : 0) || 0);
  const paymentMonthKey = payment => String(payment?.pago_em || payment?.vencimento || '').slice(0, 7);
  const recordPayments = (payments, recordId) => payments.filter(item => item.registro_id === recordId);
  const realizedPayments = (payments, recordId) => recordPayments(payments, recordId).filter(item => item.status === 'pago');
  const recordRealized = (payments, record) => sum(realizedPayments(payments, record.id), paymentValue);
  const monthKeyToDate = key => key ? `${key}-01` : '';
  const monthLong = key => key ? new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric' }).format(new Date(`${key}-01T12:00:00`)) : 'Sem competência';
  const supplierKey = value => normalize(value).replace(/\s+/g, ' ');
  const receiptMethodKey = value => {
    const text = normalize(value);
    if (text.includes('sobra')) return 'sobra';
    if (text.includes('bonific')) return 'bonificacao';
    if (text.includes('deposito') || text.includes('pix') || text.includes('ted') || text.includes('transfer')) return 'deposito';
    if (text.includes('desconto') || text.includes('abatimento') || text.includes('boleto') || text.includes('nota fiscal')) return 'desconto';
    return 'nao_informado';
  };

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
    if (text.includes('pendente') || text.includes('falta') || text.includes('haver')) return 'pendencia';
    if (text.includes('campanha') || text.includes('incentivo') || text.includes('promocao')) return 'campanha_incentivo';
    if (text.includes('feira') || text.includes('fipan') || text.includes('fispal') || text.includes('anuga') || text.includes('expo')) return 'feira';
    if (text.includes('evento') || text.includes('encontro') || text.includes('convencao') || text.includes('30 anos') || text.includes('copa') || text.includes('dia do motorista') || text.includes('treinamento')) return 'evento';
    if (text.includes('podcast') || text.includes('mtrix') || text.includes('midia') || text.includes('video') || text.includes('google') || text.includes('edm') || text.includes('boletim') || text.includes('divulgacao') || text.includes('encarte')) return 'midia';
    if (text.includes('material') || text.includes('brinde') || text.includes('catalogo') || text.includes('fold') || text.includes('folder')) return 'material';
    if (text.includes('bonificacao') || text.includes('premio')) return 'bonificacao';
    if (text.includes('cota') || text.includes('plano anual')) return 'cota_anual';
    if (text.includes('trade') || text.includes('degustacao') || text.includes('acao')) return 'acao_trade';
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
    const planningRecords = [
      ['plan-1','Promoções',360000,'campanha_incentivo'],
      ['plan-2','Feiras / Eventos',220000,'feira'],
      ['plan-3','Catálogo / Fold',95000,'material'],
      ['plan-4','Vídeos PMG',72000,'midia'],
    ].map(([id, reference, value, planningCategory], index) => ({
      id, codigo:1100 + index, controle:'marcos', ano_referencia:2026, fornecedor:'', categoria:planningCategory,
      titulo:`Planejamento 2026 — ${reference}`, referencia:reference, natureza:'despesa', impacta_totais:true,
      status:'em_andamento', valor_acordado:value, total_previsto:value, total_pago:0, saldo_aberto:value,
      situacao_financeira:'pendente', proximo_vencimento:iso(25 + index * 18), quantidade_pagamentos:1,
      pagamentos_pagos:0, pagamentos_atrasados:0, descricao:'Frente oficial do planejamento anual da PMG.',
      prioridade:'normal', responsavel_id:index % 2 ? 'c2' : 'c1', atualizado_em:new Date(Date.now() - index * 9e5).toISOString(),
      data_inicio:'2026-01-01', data_fim:'2026-12-31', centro_custo:'Marketing', tags:['marcos','planejamento','despesa','2026',normalize(reference)],
    }));
    records.push(...planningRecords);
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
    const planningActivities = planningRecords.map((record, index) => ({
      id:`pa-${index}`, registro_id:record.id, titulo:['Definir escopo e responsáveis','Validar orçamento com a diretoria','Contratar fornecedores homologados','Conferir entrega e evidências'][index],
      descricao:'Atividade operacional do planejamento estratégico.', responsavel_id:index % 2 ? 'c2' : 'c1', prazo:iso(14 + index * 9),
      status:['em_andamento','planejada','bloqueada','concluida'][index], percentual:[45,0,20,100][index], evidencia:index === 3 ? 'Entrega conferida pela equipe.' : '',
      criado_em:new Date(Date.now() - index * 864e5).toISOString(), atualizado_em:new Date().toISOString(),
    }));
    return {
      records, payments, collaborators:[{ id:'c1', nome:'Giovanni', cargo:'Marketing' }, { id:'c2', nome:'Edilson', cargo:'Diretoria' }],
      attachments:[], imports:[], conferences:[], conferencesSetupMissing:false, documents, documentItems, documentsSetupMissing:false,
      planningActivities, planningActivitiesSetupMissing:false,
      activities:records.slice(0, 6).map((record, i) => ({ id:i + 1, registro_id:record.id, ator_id:i % 2 ? 'c2' : 'c1', tipo:i % 3 === 0 ? 'pagamento_editado' : 'editado', resumo:i % 3 === 0 ? 'atualizou uma previsão de pagamento' : 'atualizou o acompanhamento', criado_em:record.atualizado_em }))
    };
  }

  async function fetchPages(makeQuery, maxRows = 50000, pageSize = 1000) {
    const data = [];
    for (let from = 0; from < maxRows; from += pageSize) {
      const to = Math.min(from + pageSize - 1, maxRows - 1);
      const result = await makeQuery(from, to);
      if (result.error) return { data, error:result.error };
      const page = Array.isArray(result.data) ? result.data : [];
      data.push(...page);
      if (page.length < pageSize) return { data, error:null };
    }
    return { data, error:new Error(`A consulta ultrapassou o limite de ${maxRows} linhas.`) };
  }

  async function fetchAll(db) {
    const queries = await Promise.all([
      fetchPages((from, to) => db.from('acompanhamento_painel').select('*').order('atualizado_em', { ascending:false }).order('id', { ascending:true }).range(from, to)),
      fetchPages((from, to) => db.from('acompanhamento_pagamentos').select('*').order('vencimento', { ascending:true }).order('id', { ascending:true }).range(from, to)),
      fetchPages((from, to) => db.from('colaboradores').select('id,nome,foto_url,cargo,ativo').eq('ativo', true).order('nome').order('id', { ascending:true }).range(from, to), 5000),
      fetchPages((from, to) => db.from('acompanhamento_anexos').select('*').order('criado_em', { ascending:false }).order('id', { ascending:true }).range(from, to)),
      fetchPages((from, to) => db.from('acompanhamento_atividades').select('*').order('criado_em', { ascending:false }).order('id', { ascending:false }).range(from, to), 10000),
      fetchPages((from, to) => db.from('acompanhamento_importacoes').select('*').order('criado_em', { ascending:false }).order('id', { ascending:true }).range(from, to), 5000),
    ]);
    const failed = queries.find(result => result.error);
    if (failed) throw failed.error;
    const documentQueries = await Promise.all([
      fetchPages((from, to) => db.from('acompanhamento_documentos_entrada').select('*').order('criado_em', { ascending:false }).order('id', { ascending:true }).range(from, to), 10000),
      fetchPages((from, to) => db.from('acompanhamento_documentos_itens').select('*,entrada:acompanhamento_documentos_entrada(id,nome_arquivo,caminho,mime_type,tamanho_bytes,total_paginas,status,criado_em)').order('criado_em', { ascending:false }).order('id', { ascending:true }).range(from, to), 20000),
    ]);
    const documentFailure = documentQueries.find(result => result.error);
    const documentsSetupMissing = Boolean(documentFailure && isMissingDocumentSetupError(documentFailure.error));
    if (documentFailure && !documentsSetupMissing) throw documentFailure.error;
    const conferenceQuery = await fetchPages((from, to) => db.from('acompanhamento_conferencias').select('*').order('competencia', { ascending:false }).order('id', { ascending:true }).range(from, to), 10000);
    const conferencesSetupMissing = Boolean(conferenceQuery.error && isMissingConferenceSetupError(conferenceQuery.error));
    if (conferenceQuery.error && !conferencesSetupMissing) throw conferenceQuery.error;
    const planningActivityQuery = await fetchPages((from, to) => db.from('acompanhamento_planejamento_atividades').select('*').order('prazo', { ascending:true }).order('id', { ascending:true }).range(from, to), 10000);
    const planningActivitiesSetupMissing = Boolean(planningActivityQuery.error && isMissingPlanningActivitySetupError(planningActivityQuery.error));
    if (planningActivityQuery.error && !planningActivitiesSetupMissing) throw planningActivityQuery.error;
    return {
      records:queries[0].data || [], payments:queries[1].data || [], collaborators:queries[2].data || [],
      attachments:queries[3].data || [], activities:queries[4].data || [], imports:queries[5].data || [],
      conferences:conferencesSetupMissing ? [] : (conferenceQuery.data || []), conferencesSetupMissing,
      planningActivities:planningActivitiesSetupMissing ? [] : (planningActivityQuery.data || []), planningActivitiesSetupMissing,
      documents:documentsSetupMissing ? [] : (documentQueries[0].data || []),
      documentItems:documentsSetupMissing ? [] : (documentQueries[1].data || []), documentsSetupMissing
    };
  }

  function isMissingPlanningActivitySetupError(fetchError) {
    const details = [fetchError?.message, fetchError?.details, fetchError?.hint, fetchError?.code, fetchError?.status]
      .filter(Boolean).join(' ');
    return /acompanhamento_planejamento_atividades|schema cache|PGRST205|42P01|404|does not exist|could not find/i.test(details);
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

  class CentralErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error:null };
    }

    static getDerivedStateFromError(error) {
      return { error };
    }

    componentDidCatch(error, info) {
      console.error('[PMG Central] Falha de renderização protegida:', error, info);
    }

    render() {
      if (!this.state.error) return this.props.children;
      const create = React.createElement;
      const message = String(this.state.error?.message || 'Falha inesperada ao montar a interface.');
      return create('div', { className:'fatal-screen recovery-screen', 'data-error-boundary':'central' },
        create('div', { className:'fatal-card recovery-card' },
          create('span', { className:'fatal-icon recovery-mark', 'aria-hidden':'true' }, '!'),
          create('p', { className:'eyebrow' }, 'Recuperação automática'),
          create('h1', null, 'A Central encontrou um dado incompatível'),
          create('p', null, 'Nada foi apagado. Atualize a página para tentar novamente; se continuar, envie o código abaixo para o suporte.'),
          create('code', { className:'recovery-code' }, message.slice(0, 280)),
          create('div', { className:'fatal-actions' },
            create('button', { className:'button primary', onClick:() => location.reload() }, 'Atualizar página'),
            create('a', { className:'button secondary', href:'/central.html' }, 'Voltar ao início')
          )
        )
      );
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
    const [data, setData] = useState({ records:[], payments:[], collaborators:[], attachments:[], activities:[], imports:[], conferences:[], conferencesSetupMissing:false, planningActivities:[], planningActivitiesSetupMissing:false, documents:[], documentItems:[], documentsSetupMissing:false });
    const [year, setYear] = useState(new Date().getFullYear());
    const [search, setSearch] = useState('');
    const [recordModal, setRecordModal] = useState(null);
    const [paymentModal, setPaymentModal] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [toast, setToast] = useState(null);
    const [saving, setSaving] = useState(false);
    const subscriptionRef = useRef(null);

    const notify = useCallback((message, tone = 'success') => {
      setToast({ message, tone, id:Date.now() });
      setTimeout(() => setToast(current => current?.message === message ? null : current), 3600);
    }, []);

    const reload = useCallback(async (quiet = false) => {
      if (!client || DEMO_MODE) return;
      if (!quiet) setLoading(true);
      try {
        setData(await fetchAll(client));
        setError(null); setSetupMissing(false);
      } catch (fetchError) {
        const missing = isMissingSetupError(fetchError);
        if (missing) setData({ records:[], payments:[], collaborators:[], attachments:[], activities:[], imports:[], conferences:[], conferencesSetupMissing:true, planningActivities:[], planningActivitiesSetupMissing:true, documents:[], documentItems:[], documentsSetupMissing:true });
        setSetupMissing(missing);
        setError(fetchError);
      } finally { if (!quiet) setLoading(false); }
    }, [client]);

    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          if (DEMO_MODE) {
            if (alive) { setMe({ nome:'Giovanni' }); setData(demoPayload()); setLoading(false); }
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
      if (!data.planningActivitiesSetupMissing) {
        channel = channel.on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_planejamento_atividades' }, () => void reload(true));
      }
      if (!data.documentsSetupMissing) {
        channel = channel
          .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_documentos_entrada' }, () => void reload(true))
          .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_documentos_itens' }, () => void reload(true));
      }
      subscriptionRef.current = channel.subscribe();
      return () => subscriptionRef.current?.unsubscribe?.();
    }, [client, reload, data.documentsSetupMissing, data.conferencesSetupMissing, data.planningActivitiesSetupMissing]);

    const years = useMemo(() => uniq(data.records.map(item => item.ano_referencia)).sort((a, b) => b - a), [data.records]);
    const filteredRecords = useMemo(() => {
      const needle = normalize(search);
      return data.records.filter(record => {
        if (year !== 'todos' && String(record.ano_referencia) !== String(year)) return false;
        if (!needle) return true;
        return normalize([record.codigo, record.fornecedor, record.titulo, record.referencia, category(record.categoria).label, record.status, ...tagList(record)].join(' ')).includes(needle);
      });
    }, [data.records, year, search]);

    const selected = useMemo(() => data.records.find(item => item.id === selectedId) || null, [data.records, selectedId]);
    const context = { ...data, records:filteredRecords, allRecords:data.records, activeYear:year, setYear, client, me, reload, notify, saving, setSaving,
      openRecord:record => setSelectedId(record.id), editRecord:record => setRecordModal(record), newRecord:() => setRecordModal({ controle:'marketing', ano_referencia:year === 'todos' ? new Date().getFullYear() : year }),
      newPayment:record => setPaymentModal({ registro_id:record?.id || selectedId }), editPayment:payment => setPaymentModal(payment), saveConference, setView };

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

    async function saveConference({ competencia, fornecedor, status = 'conferido', valor = 0, observacoes = '' }) {
      if (DEMO_MODE) { notify(status === 'conferido' ? 'Conferência assinada no modo demonstração.' : 'Divergência registrada no modo demonstração.', 'info'); return true; }
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
      <div className="ac-app">
        <div className="ambient ambient-one"></div><div className="ambient ambient-two"></div>
        <${Sidebar} view=${view} setView=${setView} open=${mobileNav} setOpen=${setMobileNav} me=${me} records=${data.records} documentItems=${data.documentItems}/>
        <div className="ac-main">
          <${Topbar} view=${view} search=${search} setSearch=${setSearch} setMobileNav=${setMobileNav} me=${me} context=${context} openCommand=${() => setCommandOpen(true)}/>
          <main className="ac-content">
            ${!['documentos','planejamento', ...FINANCE_VIEWS].includes(view) && html`<${FilterBand} year=${year} setYear=${setYear} years=${years} count=${filteredRecords.length}/>`}
            ${setupMissing ? html`<${SetupState}/>` : html`
              <div className="view-stage" key=${view}>
                ${view === 'dashboard' && html`<${Dashboard} context=${context}/>`}
                ${view === 'planejamento' && html`<${PlanningView} context=${context}/>`}
                ${FINANCE_VIEWS.includes(view) && html`<${FinanceWorkspace} context=${context} activeView=${view}/>`}
                ${view === 'registros' && html`<${RecordsView} context=${context}/>`}
                ${view === 'documentos' && window.PMGDocumentModule?.DocumentInbox && html`<${window.PMGDocumentModule.DocumentInbox} context=${context}/>`}
                ${view === 'documentos' && !window.PMGDocumentModule?.DocumentInbox && html`<${MiniEmpty} icon="scan-line" title="Módulo de documentos indisponível" text="Atualize a página para carregar a Caixa de Entrada."/>`}
                ${view === 'importar' && html`<${ImportView} context=${context} defaultYear=${year}/>`}
              </div>`}
          </main>
        </div>
        ${recordModal && html`<${RecordModal} record=${recordModal} collaborators=${data.collaborators} onClose=${() => setRecordModal(null)} onSave=${saveRecord} saving=${saving}/>`}
        ${paymentModal && html`<${PaymentModal} payment=${paymentModal} records=${data.records} onClose=${() => setPaymentModal(null)} onSave=${savePayment} saving=${saving}/>`}
        ${selected && html`<${RecordDrawer} record=${selected} context=${context} onClose=${() => setSelectedId(null)}/>`}
        ${commandOpen && html`<${CommandPalette} context=${context} onClose=${() => setCommandOpen(false)}/>`}
        ${toast && html`<${Toast} toast=${toast}/>`}
      </div>`;
  }

  function BootScreen() {
    useLucide([]);
    return html`<div className="boot-screen"><div className="boot-mark"><img src="/imagenssite/pmglogo.png" alt="PMG"/><span></span><span></span><span></span></div><strong>Montando sua visão financeira...</strong><small>Planejamento, recebimentos e execução</small></div>`;
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
            <span className="side-label">Central</span>
            ${SIDEBAR_VIEWS.map(key => { const item=VIEWS[key]; const active=key === 'financeiro' ? FINANCE_VIEWS.includes(view) : view === key; return html`<button key=${key} className=${`side-link ${active ? 'active' : ''}`} onClick=${() => navigate(key)}><span><${Icon} name=${item.icon}/></span><b>${item.label}</b>${key === 'financeiro' && overdue > 0 ? html`<em>${overdue}</em>` : key === 'documentos' && pendingDocuments > 0 ? html`<em>${pendingDocuments}</em>` : null}</button>`; })}
            <span className="side-label">PMG Connect</span>
            <a className="side-link" href="/central.html"><span><${Icon} name="house"/></span><b>Início</b></a>
            <a className="side-link" href="/demandas.html"><span><${Icon} name="clipboard-check"/></span><b>Demandas</b></a>
            <a className="side-link" href="/campanhas.html"><span><${Icon} name="trophy"/></span><b>Campanhas</b></a>
          </nav>
          <div className="side-footer"><div className="side-avatar">${String(me?.nome || 'P').charAt(0)}</div><div><strong>${me?.nome || 'Conta PMG'}</strong><span>Equipe PMG</span></div><button className="icon-button" data-pmg-logout title="Sair"><${Icon} name="log-out"/></button></div>
        </aside>
      </div>`;
  }

  function Topbar({ view, search, setSearch, setMobileNav, me, context, openCommand }) {
    const meta = VIEWS[view];
    useLucide([view]);
    const documentView = view === 'documentos';
    return html`<header className="ac-topbar"><div className="topbar-title"><button className="icon-button mobile-only" onClick=${() => setMobileNav(true)} aria-label="Abrir menu"><${Icon} name="menu"/></button><span className="topbar-view-icon"><${Icon} name=${meta.icon}/></span><div><span>${meta.eyebrow}</span><h1>${meta.label}</h1></div></div><div className="topbar-actions"><button className="command-trigger" onClick=${openCommand}><${Icon} name="sparkles"/><span><small>Busca inteligente</small><b>Fornecedor, ação ou comando</b></span><kbd>Ctrl K</kbd></button><label className="global-search compact-search"><${Icon} name="search"/><input value=${search} onInput=${event => setSearch(event.target.value)} placeholder="Filtrar visão..."/></label><button className="button secondary import-shortcut" onClick=${() => context.setView(documentView ? 'registros' : 'importar')}><${Icon} name=${documentView ? 'rows-3' : 'sheet'}/>${documentView ? 'Acompanhamentos' : 'Importar'}</button><button className="button primary topbar-create" onClick=${documentView ? () => window.dispatchEvent(new CustomEvent('pmg:document-upload')) : context.newRecord}><${Icon} name=${documentView ? 'file-up' : 'plus'}/>${documentView ? 'Enviar PDF' : 'Novo'}</button><div className="topbar-avatar" title=${me?.nome || ''}>${String(me?.nome || 'P').charAt(0)}</div></div></header>`;
  }

  function CommandPalette({ context, onClose }) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const input = useRef(null);
    const needle = normalize(query);
    const results = needle ? context.allRecords.filter(record => normalize([record.codigo, record.fornecedor, record.titulo, record.referencia, ...tagList(record)].join(' ')).includes(needle)).slice(0, 7) : [];
    const commands = [
      { label:'Abrir visão geral', detail:'Resumo executivo', icon:'layout-dashboard', action:() => context.setView('dashboard') },
      { label:'Abrir Planejamento PMG', detail:'Previsto x realizado de 2026', icon:'target', action:() => context.setView('planejamento') },
      { label:'Abrir Receita', detail:'Recebíveis, investimento e saldo', icon:'landmark', action:() => context.setView('receita') },
      { label:'Fechamento mensal', detail:'Conferir previsto e recebido', icon:'badge-check', action:() => context.setView('fechamento') },
      { label:'Novo acompanhamento', detail:'Cadastrar ação ou projeto', icon:'plus-circle', action:context.newRecord },
      { label:'Importar planilha', detail:'Atualizar a base oficial', icon:'file-up', action:() => context.setView('importar') },
      { label:'Conferir documentos', detail:'Abrir a caixa de entrada', icon:'scan-line', action:() => context.setView('documentos') },
      { label:'Ver agenda financeira', detail:'Pagamentos e previsões', icon:'wallet-cards', action:() => context.setView('financeiro') },
    ];
    useEffect(() => { input.current?.focus(); document.body.classList.add('command-open'); return () => document.body.classList.remove('command-open'); }, []);
    useEffect(() => setActiveIndex(0), [query]);
    useLucide([query, results.length]);
    const run = action => { action?.(); onClose(); };
    const totalItems = needle ? results.length : commands.length;
    const activate = index => {
      if (needle) return results[index] && run(() => context.openRecord(results[index]));
      return commands[index] && run(commands[index].action);
    };
    const handleKeys = event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(current => totalItems ? (current + 1) % totalItems : 0); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(current => totalItems ? (current - 1 + totalItems) % totalItems : 0); }
      if (event.key === 'Enter' && totalItems) { event.preventDefault(); activate(activeIndex); }
    };
    return html`<div className="command-overlay" onMouseDown=${event => event.target === event.currentTarget && onClose()}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Busca inteligente"><div className="command-input"><span><${Icon} name="sparkles"/></span><input ref=${input} value=${query} onInput=${event => setQuery(event.target.value)} onKeyDown=${handleKeys} placeholder="Digite um fornecedor, ação ou comando..."/><kbd>ESC</kbd></div><div className="command-body">${needle ? html`<div className="command-group"><span className="command-label">Resultados</span>${results.length ? results.map((record, index) => html`<button className=${index === activeIndex ? 'active' : ''} onMouseEnter=${() => setActiveIndex(index)} onClick=${() => run(() => context.openRecord(record))}><span className=${`command-result-icon ${workflow(record).key}`}><${Icon} name=${workflow(record).icon}/></span><div><strong>${record.fornecedor || record.titulo}</strong><small>${workflow(record).label} · #${record.codigo || '—'} · ${record.titulo}</small></div><em>${money(record.valor_acordado)}</em><${Icon} name="chevron-right"/></button>`) : html`<div className="command-empty"><${Icon} name="search-x"/><span>Nenhum acompanhamento encontrado.</span></div>`}</div>` : html`<div className="command-group"><span className="command-label">Ações rápidas</span>${commands.map((command, index) => html`<button className=${index === activeIndex ? 'active' : ''} onMouseEnter=${() => setActiveIndex(index)} onClick=${() => run(command.action)}><span className="command-result-icon"><${Icon} name=${command.icon}/></span><div><strong>${command.label}</strong><small>${command.detail}</small></div><span></span><${Icon} name="arrow-up-right"/></button>`)}</div>`}</div><footer><span><b>↑↓</b> navegar</span><span><b>Enter</b> abrir</span><span>PMG Command Center</span></footer></section></div>`;
  }

  function FilterBand({ year, setYear, years, count }) {
    useLucide([year]);
    return html`<div className="filter-band"><div className="unified-scope"><span><${Icon} name="combine"/></span><div><small>Visão integrada</small><strong>Planejamento, recebimentos e execução</strong></div></div><div className="filter-right"><span className="result-count"><b>${int(count)}</b> registros na visão</span><label className="year-select"><${Icon} name="calendar-range"/><select value=${year} onChange=${event => setYear(event.target.value)}><option value="todos">Todos os anos</option>${years.map(item => html`<option key=${item} value=${item}>${item}</option>`)}</select></label></div></div>`;
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

  function Dashboard({ context }) {
    const { records, payments, activities, collaborators, openRecord, newRecord } = context;
    const activeRecords = records.filter(item => !['cancelado'].includes(item.status));
    const impactRecords = activeRecords.filter(item => item.impacta_totais !== false && item.natureza !== 'indicador');
    const indicators = activeRecords.filter(item => item.natureza === 'indicador');
    const indicator = tag => indicators.find(item => hasTag(item, tag))?.valor_acordado;
    const annualForecast = sum(impactRecords.filter(item => item.natureza === 'receita' && item.categoria !== 'pendencia' && hasTag(item, 'previsão')), item => item.valor_acordado);
    const annualPlan = sum(impactRecords.filter(item => item.natureza === 'despesa' && hasTag(item, 'planejamento')), item => item.valor_acordado);
    const receivedFromSuppliers = sum(impactRecords.filter(item => item.natureza === 'receita' && hasTag(item, 'fornecedores')), item => item.total_pago || 0);
    const fallbackRevenue = sum(impactRecords.filter(item => item.natureza === 'receita' && item.categoria !== 'pendencia'), item => item.valor_acordado);
    const fallbackExpenses = sum(impactRecords.filter(item => item.natureza === 'despesa'), item => item.valor_acordado);
    const forecastRevenue = Number(indicator('receita')) || annualForecast || fallbackRevenue;
    const forecastExpenses = Number(indicator('investimento')) || annualPlan || fallbackExpenses;
    const forecastBalance = Number(indicator('saldo')) || Math.max(0, forecastRevenue - forecastExpenses);
    const realized = receivedFromSuppliers || sum(impactRecords.filter(item => item.natureza === 'receita'), item => item.total_pago || 0);
    const visibleIds = new Set(records.map(record => record.id));
    const overduePayments = payments.filter(payment => isOverdue(payment) && visibleIds.has(payment.registro_id));
    const upcoming = payments.filter(payment => !isOverdue(payment) && !['pago', 'cancelado'].includes(payment.status) && payment.vencimento)
      .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento))).slice(0, 6);
    const recent = activities.filter(activity => visibleIds.has(activity.registro_id)).slice(0, 7);
    const collaboratorMap = Object.fromEntries(collaborators.map(item => [item.id, item]));
    const recordMap = Object.fromEntries(context.allRecords.map(item => [item.id, item]));
    const openProjects = activeRecords.filter(item => !['concluido', 'cancelado'].includes(item.status));
    const finishedProjects = activeRecords.filter(item => item.status === 'concluido').length;
    const completion = activeRecords.length ? Math.round((finishedProjects / activeRecords.length) * 100) : 0;
    const urgent = activeRecords.filter(item => item.prioridade === 'urgente' || item.categoria === 'pendencia').length;
    const health = Math.max(8, Math.min(100, 100 - overduePayments.length * 5 - urgent * 2));
    const firstName = String(context.me?.nome || 'equipe').split(/\s+/)[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    const today = new Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'2-digit', month:'long' }).format(new Date());
    const focusTitle = overduePayments.length ? `${overduePayments.length} movimento${overduePayments.length === 1 ? '' : 's'} precisa${overduePayments.length === 1 ? '' : 'm'} de atenção` : urgent ? `${urgent} prioridade${urgent === 1 ? '' : 's'} em acompanhamento` : 'Operação financeira sob controle';
    const focusText = overduePayments.length ? 'Os vencimentos críticos já estão organizados no radar ao lado.' : 'Planejamento, recebimentos e execução estão conciliados em uma única leitura.';
    const attention = (overduePayments.length ? overduePayments : upcoming).slice(0, 5);
    useLucide([records.length, payments.length]);
    return html`
      <section className="dashboard-cockpit">
        <article className="cockpit-hero">
          <div className="hero-grid-lines"></div><span className="hero-orb hero-orb-one"></span><span className="hero-orb hero-orb-two"></span>
          <div className="hero-copy"><div className="hero-live"><i></i><span>Central sincronizada</span><b>${today}</b></div><p className="hero-kicker">${greeting}, ${firstName}</p><h2>${focusTitle}</h2><p>${focusText}</p><div className="hero-actions"><button className="button hero-primary" onClick=${newRecord}><${Icon} name="plus"/>Novo acompanhamento</button><button className="button hero-secondary" onClick=${() => context.setView('importar')}><${Icon} name="file-up"/>Atualizar planilhas</button></div></div>
          <div className="hero-health-wrap"><div className="hero-health" style=${{ '--health':`${health * 3.6}deg` }}><div><span>Índice operacional</span><strong>${health}</strong><small>/100</small></div></div><p>${health >= 85 ? 'Fluxo saudável' : health >= 65 ? 'Atenção moderada' : 'Revisão recomendada'}</p></div>
          <div className="hero-controls"><button className="hero-control-card forecast" onClick=${() => context.setView('planejamento')}><span><i></i>Planejamento anual</span><strong>${compactMoney(forecastRevenue)}</strong><small>Receita prevista <${Icon} name="arrow-up-right"/></small></button><button className="hero-control-card execution" onClick=${() => context.setView('financeiro')}><span><i></i>Execução financeira</span><strong>${compactMoney(realized)}</strong><small>Recebido até agora <${Icon} name="arrow-up-right"/></small></button></div>
        </article>

        <div className="signal-grid">
          <${InsightTile} icon="triangle-alert" value=${int(overduePayments.length)} label="Vencimentos críticos" detail=${overduePayments.length ? 'Priorize estes movimentos' : 'Nenhum atraso visível'} tone=${overduePayments.length ? 'danger' : 'forest'} action=${() => context.setView('financeiro')}/>
          <${InsightTile} icon="orbit" value=${int(openProjects.length)} label="Ações em movimento" detail="Projetos ainda não concluídos" tone="violet" action=${() => context.setView('registros')}/>
          <${InsightTile} icon="calendar-clock" value=${int(upcoming.length)} label="Próximos compromissos" detail="Agenda financeira visível" tone="gold" action=${() => context.setView('financeiro')}/>
          <${InsightTile} icon="activity" value=${`${completion}%`} label="Índice de conclusão" detail=${`${finishedProjects} projetos concluídos`} tone="forest" action=${() => context.setView('registros')}/>
        </div>

        <div className="metric-grid financial-metrics">
          <${MetricCard} label="Receita prevista" value=${forecastRevenue} icon="trending-up" tone="emerald" hint="Plano anual"/>
          <${MetricCard} label="Recebido dos fornecedores" value=${realized} icon="badge-check" tone="gold" hint="Execução conciliada"/>
          <${MetricCard} label="Investimento previsto" value=${forecastExpenses} icon="trending-down" tone="investment" hint="Planejamento anual"/>
          <${MetricCard} label="Saldo projetado" value=${forecastBalance} icon="landmark" tone=${overduePayments.length ? 'danger' : 'emerald'} hint=${overduePayments.length ? `${overduePayments.length} pendência(s) vencida(s)` : 'Receita menos investimento'} pulse=${overduePayments.length > 0}/>
        </div>

        <div className="dashboard-bento">
          <article className="panel chart-panel cashflow-panel bento-flow"><div className="panel-heading"><div><span className="eyebrow">Pulso financeiro</span><h2>Previsto x realizado ao longo do ano</h2><p>Uma única leitura mensal do planejamento e da execução.</p></div><span className="live-chip"><i></i>Dados vivos</span></div><${CashflowChart} payments=${payments} records=${records}/></article>

          <article className="attention-radar"><div className="radar-head"><div><span className="eyebrow light">Radar de atenção</span><h2>${overduePayments.length ? 'O que não pode esperar' : 'Próximos movimentos'}</h2></div><div className=${`radar-beacon ${overduePayments.length ? 'alert' : ''}`}><i></i><span></span><b>${attention.length}</b></div></div><div className="radar-list">${attention.length ? attention.map((payment, index) => {
            const record = recordMap[payment.registro_id]; const overdue = isOverdue(payment);
            return html`<button key=${payment.id} onClick=${() => record && openRecord(record)}><span className=${`radar-index ${overdue ? 'late' : ''}`}>${String(index + 1).padStart(2, '0')}</span><div><strong>${record?.fornecedor || record?.titulo || 'Acompanhamento'}</strong><small>${overdue ? 'Vencido' : 'Previsto'} · ${payment.vencimento ? date(payment.vencimento) : 'Sem data'}</small></div><em>${money(payment.valor_previsto)}</em><${Icon} name="chevron-right"/></button>`;
          }) : html`<div className="radar-clear"><${Icon} name="shield-check"/><strong>Nenhum movimento crítico</strong><small>A agenda está limpa nesta visão.</small></div>`}</div><button className="radar-footer" onClick=${() => context.setView('financeiro')}>Abrir agenda completa <${Icon} name="arrow-right"/></button></article>

          <article className="panel chart-panel category-panel bento-category"><div className="panel-heading compact"><div><span className="eyebrow">Mapa de investimento</span><h2>Composição por iniciativa</h2></div></div><${CategoryChart} records=${records}/></article>

          <article className="panel status-panel bento-status"><div className="panel-heading compact"><div><span className="eyebrow">Ritmo operacional</span><h2>Andamento dos projetos</h2></div><span className="completion-chip">${completion}% concluído</span></div><${StatusBreakdown} records=${records}/></article>

          <article className="panel activity-panel bento-activity"><div className="panel-heading compact"><div><span className="eyebrow">Trilha ao vivo</span><h2>Movimentações recentes</h2></div></div><div className="activity-list">${recent.length ? recent.map(activity => {
          const record = recordMap[activity.registro_id]; const actor = collaboratorMap[activity.ator_id];
          const activityType = String(activity.tipo || '');
          return html`<button key=${activity.id} className="activity-row" onClick=${() => record && openRecord(record)}><span className=${`activity-icon ${activityType.includes('pagamento') ? 'money' : ''}`}><${Icon} name=${activityType.includes('pagamento') ? 'receipt-text' : activityType === 'criado' ? 'sparkles' : 'pencil-line'}/></span><span><strong>${actor?.nome || 'Equipe PMG'}</strong><p>${activity.resumo || 'atualizou a Central'} <b>${record?.fornecedor || record?.titulo || ''}</b></p><small>${dateTime(activity.criado_em)}</small></span></button>`;
        }) : html`<${MiniEmpty} icon="history" title="Histórico limpo" text="As alterações feitas na Central aparecerão aqui."/>`}</div></article>
        </div>
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
      const monthKey = month => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const datasets = [
        { label:'Previsto', data:months.map(month => sum(visible.filter(item => key(item.vencimento) === monthKey(month) && item.status !== 'cancelado'), item => item.valor_previsto)), borderColor:'#d79a2b', backgroundColor:'rgba(215,154,43,.06)', borderWidth:2, borderDash:[5,5], pointRadius:0, pointHoverRadius:5, tension:.4, fill:false },
        { label:'Realizado', data:months.map(month => sum(visible.filter(item => key(item.pago_em) === monthKey(month) && item.status === 'pago'), item => item.valor_pago || item.valor_previsto)), borderColor:'#2a7e4e', backgroundColor:null, borderWidth:3, pointRadius:0, pointHoverRadius:5, tension:.4, fill:true },
      ];
      chartRef.current?.destroy();
      const gradient = canvas.current.getContext('2d').createLinearGradient(0, 0, 0, 260); gradient.addColorStop(0, 'rgba(42, 126, 78, .30)'); gradient.addColorStop(1, 'rgba(42, 126, 78, .015)');
      datasets[datasets.length - 1].backgroundColor = gradient;
      chartRef.current = new Chart(canvas.current, { type:'line', data:{ labels:months.map(month => monthLabel(month)), datasets }, options:{ responsive:true, maintainAspectRatio:false, animation:{ duration:900, easing:'easeOutQuart' }, interaction:{ intersect:false, mode:'index' },
        plugins:{ legend:{ position:'top', align:'end', labels:{ usePointStyle:true, pointStyle:'circle', boxWidth:7, boxHeight:7, color:'#607267', font:{ family:'Inter', weight:600 } } }, tooltip:{ backgroundColor:'#102d1d', padding:12, cornerRadius:10, callbacks:{ label:ctx => `${ctx.dataset.label}: ${money(ctx.raw)}` } } },
        scales:{ x:{ grid:{ display:false }, border:{ display:false }, ticks:{ color:'#87988e', font:{ family:'Inter', size:11 } } }, y:{ beginAtZero:true, border:{ display:false }, grid:{ color:'rgba(16,45,29,.07)' }, ticks:{ color:'#87988e', font:{ family:'Inter', size:10 }, callback:value => compactMoney(value) } } } } });
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
      if (hasTag(record, 'legado-fora-coluna-valor') || hasTag(record, 'dentro-verba')) return false;
      if (!hasTag(record, 'planejamento') && record.impacta_totais === false) return false;
      return recordRealized(context.payments, record) > 0;
    }).map(record => ({ record, value:recordRealized(context.payments, record) }));
  }

  function PlanningActivityModal({ activity, planning, context, onClose }) {
    const [status, setStatus] = useState(activity.status || 'planejada');
    const [saving, setSaving] = useState(false);
    const recordMap = Object.fromEntries(context.allRecords.map(item => [item.id, item]));
    const paymentOptions = context.payments.filter(item => item.status === 'pago').slice(-300).reverse();
    const submit = async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const paymentId = form.get('pagamento_id') || null;
      const linkedPayment = context.payments.find(item => item.id === paymentId);
      const payload = {
        registro_id:form.get('registro_id'), titulo:form.get('titulo'), descricao:form.get('descricao'),
        responsavel_id:form.get('responsavel_id') || null, prazo:form.get('prazo') || null,
        status:linkedPayment?.status === 'pago' ? 'concluida' : status,
        percentual:linkedPayment?.status === 'pago' ? 100 : Number(form.get('percentual') || 0),
        evidencia:form.get('evidencia'), pagamento_id:paymentId,
        custo_previsto:parseMoney(form.get('custo_previsto')), custo_realizado:parseMoney(form.get('custo_realizado')),
      };
      if (DEMO_MODE) { context.notify('Modo demonstração: atividade estratégica validada.', 'info'); onClose(); return; }
      setSaving(true);
      try {
        const { error } = await context.client.rpc('salvar_atividade_planejamento_v1', { p_atividade_id:activity.id || null, p_dados:payload });
        if (error) throw error;
        await context.reload(true); context.notify(activity.id ? 'Atividade atualizada.' : 'Atividade adicionada ao planejamento.'); onClose();
      } catch (error) { context.notify(error.message || 'Não foi possível salvar a atividade.', 'error'); }
      finally { setSaving(false); }
    };
    return html`<${ModalShell} title=${activity.id ? 'Editar atividade estratégica' : 'Nova atividade estratégica'} eyebrow="Execução do planejamento" icon="list-checks" onClose=${onClose} wide=${true}><form className="ac-form planning-activity-form" onSubmit=${submit}><div className="form-grid">
      <${Field} label="Frente estratégica" wide=${true}><select name="registro_id" defaultValue=${activity.registro_id || planning[0]?.id || ''} required><option value="">Selecione...</option>${planning.map(record => html`<option value=${record.id}>${record.referencia || record.titulo}</option>`)}</select></${Field}>
      <${Field} label="Atividade" wide=${true}><input name="titulo" defaultValue=${activity.titulo || ''} placeholder="Ex.: aprovar briefing e fornecedores" required/></${Field}>
      <${Field} label="Responsável"><select name="responsavel_id" defaultValue=${activity.responsavel_id || ''}><option value="">Não atribuído</option>${context.collaborators.map(person => html`<option value=${person.id}>${person.nome}</option>`)}</select></${Field}>
      <${Field} label="Prazo"><input name="prazo" type="date" defaultValue=${activity.prazo || ''}/></${Field}>
      <${Field} label="Status"><select name="status" value=${status} onChange=${event => setStatus(event.target.value)}>${Object.entries(PLANNING_ACTIVITY_STATUS).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></${Field}>
      <${Field} label="Execução (%)"><input name="percentual" type="number" min="0" max="100" defaultValue=${activity.percentual ?? (status === 'concluida' ? 100 : 0)}/></${Field}>
      <${Field} label="Custo previsto"><div className="money-input"><span>R$</span><input name="custo_previsto" inputMode="decimal" defaultValue=${activity.custo_previsto || ''}/></div></${Field}>
      <${Field} label="Custo realizado"><div className="money-input"><span>R$</span><input name="custo_realizado" inputMode="decimal" defaultValue=${activity.custo_realizado || ''}/></div></${Field}>
      <${Field} label="Pagamento vinculado" wide=${true}><select name="pagamento_id" defaultValue=${activity.pagamento_id || ''}><option value="">Sem vínculo financeiro</option>${paymentOptions.map(payment => { const record=recordMap[payment.registro_id]; return html`<option value=${payment.id}>${record?.fornecedor || record?.titulo || 'Lançamento'} · ${payment.descricao || `Parcela ${payment.parcela}`} · ${money(paymentValue(payment))}</option>`; })}</select><small className="field-help">Ao vincular um pagamento realizado, a atividade recebe baixa automática e vai para 100%.</small></${Field}>
      <${Field} label="Descrição" wide=${true}><textarea name="descricao" rows="3" defaultValue=${activity.descricao || ''} placeholder="Escopo, entregáveis e dependências."></textarea></${Field}>
      <${Field} label="Evidência / conclusão" wide=${true}><textarea name="evidencia" rows="3" defaultValue=${activity.evidencia || ''} placeholder="Link, protocolo, observação ou comprovação da entrega."></textarea></${Field}>
      </div><footer className="modal-footer"><button type="button" className="button secondary" onClick=${onClose}>Cancelar</button><button type="submit" className="button investment" disabled=${saving}>${saving ? html`<span className="spinner"></span>` : html`<${Icon} name="save"/>`}Salvar atividade</button></footer></form></${ModalShell}>`;
  }

  function PlanningActivityBoard({ context, planning }) {
    const [editor, setEditor] = useState(null);
    const activities = context.planningActivities || [];
    const recordMap = Object.fromEntries(planning.map(item => [item.id, item]));
    const collaboratorMap = Object.fromEntries(context.collaborators.map(item => [item.id, item]));
    const complete = activities.filter(item => item.status === 'concluida').length;
    const overdue = activities.filter(item => item.status !== 'concluida' && item.prazo && item.prazo < todayKey()).length;
    const columns = Object.entries(PLANNING_ACTIVITY_STATUS);
    useLucide([activities.length, editor?.id, overdue, complete]);
    const quickComplete = async activity => {
      if (DEMO_MODE) return context.notify('Atividade concluída no modo demonstração.', 'info');
      try {
        const { error } = await context.client.rpc('salvar_atividade_planejamento_v1', { p_atividade_id:activity.id, p_dados:{ ...activity, status:'concluida', percentual:100 } });
        if (error) throw error; await context.reload(true); context.notify('Atividade concluída.');
      } catch (error) { context.notify(error.message || 'Não foi possível concluir a atividade.', 'error'); }
    };
    if (context.planningActivitiesSetupMissing) return html`<div className="management-setup-warning planning-setup"><${Icon} name="list-checks"/><div><strong>Atividades estratégicas prontas para ativação</strong><p>Execute <code>sql/12-CONTROLES-OPERACIONAIS-V1.4.0.sql</code> para liberar responsáveis, prazos, bloqueios, evidências e baixa automática.</p></div></div>`;
    return html`<article className="strategy-execution"><header><div><span className="eyebrow light">Execução estratégica</span><h2>Do plano à entrega, sem perder a evidência.</h2><p>Responsáveis, prazos, custos e conclusão conectados às 15 frentes do MKTG 2026.</p></div><div className="strategy-summary"><span><b>${activities.length}</b><small>atividades</small></span><span className=${overdue ? 'danger' : ''}><b>${overdue}</b><small>atrasadas</small></span><span><b>${activities.length ? Math.round(complete / activities.length * 100) : 0}%</b><small>concluídas</small></span><button className="button investment" onClick=${() => setEditor({})}><${Icon} name="plus"/>Nova atividade</button></div></header><div className="strategy-kanban">${columns.map(([key, meta]) => { const rows=activities.filter(item => item.status === key); return html`<section className=${`strategy-column ${key}`}><div className="strategy-column-title"><span><${Icon} name=${meta.icon}/>${meta.label}</span><b>${rows.length}</b></div><div>${rows.length ? rows.map(item => { const front=recordMap[item.registro_id]; const person=collaboratorMap[item.responsavel_id]; const late=item.status!=='concluida'&&item.prazo&&item.prazo<todayKey(); return html`<article className=${`strategy-card ${late?'late':''}`} tabIndex="0" role="button" onClick=${() => setEditor(item)} onKeyDown=${event => { if(event.key==='Enter'||event.key===' '){event.preventDefault();setEditor(item);} }}><div className="strategy-card-top"><span>${front?.referencia || front?.titulo || 'Frente estratégica'}</span>${item.pagamento_id && html`<i title="Baixa vinculada ao financeiro"><${Icon} name="link-2"/></i>`}</div><h3>${item.titulo}</h3><p>${item.descricao || 'Sem descrição adicional.'}</p><div className="strategy-progress"><i style=${{width:`${Math.min(100,Number(item.percentual)||0)}%`}}></i><span>${Number(item.percentual)||0}%</span></div><footer><span className=${late?'late':''}><${Icon} name=${late?'alarm-clock':'calendar'}/>${item.prazo?date(item.prazo):'Sem prazo'}</span><span><${Icon} name="user-round"/>${person?.nome || 'Não atribuído'}</span>${item.status!=='concluida'&&html`<button title="Concluir atividade" aria-label="Concluir atividade" onClick=${event => {event.stopPropagation();quickComplete(item);}}><${Icon} name="check"/></button>`}</footer></article>`; }) : html`<div className="strategy-empty"><${Icon} name=${meta.icon}/><span>Nenhuma atividade</span></div>`}</div></section>`; })}</div>${editor && html`<${PlanningActivityModal} activity=${editor} planning=${planning} context=${context} onClose=${() => setEditor(null)}/>`}</article>`;
  }

  function PlanningMatrix({ planning, payments, openRecord }) {
    const paymentMap = new Map();
    const planningIds = new Set(planning.map(record => record.id));
    payments.filter(payment => planningIds.has(payment.registro_id)).forEach(payment => {
      const key = `${payment.registro_id}|${String(payment.vencimento || '').slice(0, 7)}`;
      paymentMap.set(key, payment);
    });
    const rows = [...planning].sort((a, b) => String(a.referencia || a.titulo).localeCompare(String(b.referencia || b.titulo), 'pt-BR'));
    const realized = sum([...paymentMap.values()].filter(payment => payment.status === 'pago'), paymentValue);
    useLucide([rows.length, realized]);
    return html`<article className="management-panel planning-matrix-panel"><div className="panel-heading compact"><div><span className="eyebrow">Espelho vivo da planilha</span><h2>Planejamento por categoria e mês</h2><p>Vermelho na fonte é realizado. Preto continua previsto até haver gasto real.</p></div><div className="planning-legend"><span className="realized"><i></i>Realizado</span><span className="forecast"><i></i>Previsto</span></div></div>
      <div className="planning-matrix-wrap"><table className="planning-matrix"><thead><tr><th>Categoria</th>${OFFICIAL_MONTHS.map(([, label]) => html`<th>${label.slice(0, 3)}</th>`)}<th>Total</th><th>Realizado</th></tr></thead><tbody>${rows.map(record => {
        const cells = OFFICIAL_MONTHS.map((_, monthIndex) => paymentMap.get(`${record.id}|2026-${String(monthIndex + 1).padStart(2, '0')}`));
        const planned = sum(cells, payment => payment?.valor_previsto || 0); const done = sum(cells.filter(payment => payment?.status === 'pago'), paymentValue);
        return html`<tr><th><button onClick=${() => openRecord(record)}>${record.referencia || record.titulo}<small>${category(record.categoria).label}</small></button></th>${cells.map(payment => html`<td className=${payment ? (payment.status === 'pago' ? 'realized' : 'forecast') : 'empty'}>${payment ? html`<button title=${payment.status === 'pago' ? 'Realizado na planilha oficial' : 'Previsto na planilha oficial'} onClick=${() => openRecord(record)}><span>${compactMoney(payment.valor_previsto)}</span><i></i></button>` : '—'}</td>`)}<td className="row-total">${compactMoney(planned)}</td><td className="row-realized">${compactMoney(done)}</td></tr>`;
      })}</tbody></table></div></article>`;
  }

  function PlanningView({ context }) {
    const planning = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.natureza === 'despesa' && hasTag(record, 'planejamento') && record.status !== 'cancelado');
    const actualRows = actualInvestmentRows(context);
    const planningKeys = new Set(planning.map(record => normalize(record.referencia || record.titulo.replace(/^Planejamento 2026\s*—\s*/i, ''))));
    const actualByKey = new Map();
    const matchedIds = new Set();
    actualRows.forEach(({ record, value }) => {
      const key = planningMatchKey([record.centro_custo, record.referencia, record.titulo, category(record.categoria).label].join(' '));
      if (key && planningKeys.has(key)) { actualByKey.set(key, (actualByKey.get(key) || 0) + value); matchedIds.add(record.id); }
    });
    const fronts = planning.map(record => {
      const key = normalize(record.referencia || record.titulo.replace(/^Planejamento 2026\s*—\s*/i, ''));
      const planned = Number(record.valor_acordado || 0); const realized = Number(actualByKey.get(key) || 0);
      return { record, key, planned, realized, balance:planned - realized, progress:planned ? Math.min(999, realized / planned * 100) : 0 };
    }).sort((a, b) => b.planned - a.planned);
    const plannedTotal = sum(fronts, item => item.planned);
    const realizedTotal = sum(actualRows, item => item.value);
    const unlinked = actualRows.filter(item => !matchedIds.has(item.record.id));
    const monthlyPlan = Array.from({ length:12 }, (_, monthIndex) => {
      const key = `2026-${String(monthIndex + 1).padStart(2, '0')}`;
      return sum(context.payments.filter(payment => planning.some(record => record.id === payment.registro_id) && String(payment.vencimento || '').startsWith(key)), payment => payment.valor_previsto);
    });
    const monthlyActual = Array.from({ length:12 }, (_, monthIndex) => {
      const key = `2026-${String(monthIndex + 1).padStart(2, '0')}`;
      return sum(actualRows, item => sum(realizedPayments(context.payments, item.record.id).filter(payment => paymentMonthKey(payment) === key), paymentValue));
    });
    useLucide([fronts.length, actualRows.length]);
    return html`<section className="management-section planning-view">
      <div className="management-hero planning-hero"><div><span className="eyebrow light">Planejamento estratégico PMG · 2026</span><h2>Planejar é uma coisa.<br/>Realizar é outra.</h2><p>O previsto continua previsto até existir gasto real. Virar o mês não baixa parcela, porque calendário não é comprovante.</p></div><div className="management-hero-badge"><${Icon} name="target" size=${34}/><span><b>${fronts.length}</b> frentes estratégicas</span></div></div>
      <div className="management-kpis"><${MetricCard} label="Investimento planejado" value=${plannedTotal} icon="target" tone="investment" hint="Plano 2026"/><${MetricCard} label="Investimento realizado" value=${realizedTotal} icon="badge-dollar-sign" tone="investment" hint="Somente gasto real"/><${MetricCard} label="Saldo do planejamento" value=${plannedTotal - realizedTotal} icon="scale" tone="gold" hint="Previsto menos realizado"/><${MetricCard} label="Execução" value=${plannedTotal ? realizedTotal / plannedTotal * 100 : 0} format="percent" icon="gauge" tone="slate" hint="Inclui gastos sem vínculo"/></div>
      <${PlanningMatrix} planning=${planning} payments=${context.payments} openRecord=${context.openRecord}/>
      <${PlanningActivityBoard} context=${context} planning=${planning}/>
      <div className="management-grid planning-grid"><article className="management-panel wide"><div className="panel-heading compact"><div><span className="eyebrow">Frentes estratégicas</span><h2>Previsto x realizado</h2></div><span className="management-chip">${fronts.length} frentes</span></div>
        <div className="planning-fronts">${fronts.length ? fronts.map(item => html`<button className="planning-front" onClick=${() => context.openRecord(item.record)}><div className="planning-front-head"><div><strong>${item.record.referencia || item.record.titulo}</strong><small>${category(item.record.categoria).label}</small></div><span>${Math.round(item.progress)}%</span></div><div className="planning-front-values"><span><small>Previsto</small><b>${money(item.planned)}</b></span><span><small>Realizado</small><b>${money(item.realized)}</b></span><span><small>Saldo</small><b className=${item.balance < 0 ? 'negative' : ''}>${money(item.balance)}</b></span></div><div className="planning-bar"><i style=${{ width:`${Math.min(100, item.progress)}%` }}></i></div></button>`) : html`<${MiniEmpty} icon="target" title="Planejamento ainda não importado" text="Reimporte MKTG 2026 para carregar as 15 frentes estratégicas."/>`}</div>
      </article><article className="management-panel"><div className="panel-heading compact"><div><span className="eyebrow">Ritmo mensal</span><h2>2026 mês a mês</h2></div></div><div className="monthly-plan-list">${OFFICIAL_MONTHS.map(([, label], index) => { const planned = monthlyPlan[index]; const actual = monthlyActual[index]; const pct = planned ? Math.min(100, actual / planned * 100) : 0; return html`<div className="monthly-plan-row"><span>${label.slice(0,3)}</span><div><i style=${{ width:`${pct}%` }}></i></div><b>${compactMoney(actual)}</b><small>${compactMoney(planned)}</small></div>`; })}</div></article></div>
      <article className="management-panel unlinked-panel"><div className="panel-heading compact"><div><span className="eyebrow">Controle de exceção</span><h2>Gastos realizados sem vínculo direto com o Planejamento</h2><p>Itens reais que ainda não casaram com uma das frentes estratégicas.</p></div><span className=${`management-chip ${unlinked.length ? 'warning' : 'ok'}`}>${unlinked.length ? `${unlinked.length} para revisar` : 'Tudo conciliado'}</span></div>${unlinked.length ? html`<div className="unlinked-list">${unlinked.slice(0, 40).map(item => html`<button onClick=${() => context.openRecord(item.record)}><span><${Icon} name="unlink"/></span><div><strong>${item.record.fornecedor || item.record.titulo}</strong><small>${item.record.centro_custo || item.record.referencia || category(item.record.categoria).label}</small></div><b>${money(item.value)}</b><${Icon} name="chevron-right"/></button>`)}</div>` : html`<${MiniEmpty} icon="circle-check-big" title="Nenhum gasto solto" text="Os gastos realizados estão vinculados às frentes reconhecidas."/>`}</article>
    </section>`;
  }

  function RevenueComparisonChart({ context }) {
    const canvas = useRef(null); const chartRef = useRef(null);
    const series = useMemo(() => {
      const values = { 2025:Array(12).fill(0), 2026:Array(12).fill(0) };
      const records = context.allRecords.filter(record => record.natureza === 'receita' && record.impacta_totais !== false && hasTag(record, 'fornecedores') && [2025, 2026].includes(Number(record.ano_referencia)));
      const map = new Map(records.map(record => [record.id, record]));
      context.payments.forEach(payment => {
        if (payment.status !== 'pago') return; const record = map.get(payment.registro_id); if (!record) return;
        const key = paymentMonthKey(payment); if (!/^20(25|26)-\d{2}$/.test(key)) return;
        const monthIndex = Number(key.slice(5, 7)) - 1; values[Number(record.ano_referencia)][monthIndex] += paymentValue(payment);
      });
      return values;
    }, [context.allRecords, context.payments]);
    useEffect(() => {
      if (!canvas.current || !window.Chart) return undefined;
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvas.current, { type:'line', data:{ labels:OFFICIAL_MONTHS.map(([, label]) => label.slice(0,3)), datasets:[
        { label:'2025', data:series[2025], borderColor:'#9ca9a0', backgroundColor:'rgba(156,169,160,.08)', tension:.32, fill:false, pointRadius:3, borderWidth:2 },
        { label:'2026', data:series[2026], borderColor:'#2a7e4e', backgroundColor:'rgba(42,126,78,.10)', tension:.32, fill:true, pointRadius:3, borderWidth:2.5 },
      ]}, options:{ responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false }, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, boxWidth:7, font:{ family:'Inter', size:10 } } }, tooltip:{ callbacks:{ label:ctx => `${ctx.dataset.label}: ${money(ctx.raw)}` } } }, scales:{ x:{ grid:{ display:false }, border:{ display:false } }, y:{ beginAtZero:true, border:{ display:false }, grid:{ color:'rgba(16,45,29,.06)' }, ticks:{ callback:value => compactMoney(value) } } } } });
      return () => chartRef.current?.destroy();
    }, [series]);
    return html`<div className="revenue-chart"><canvas ref=${canvas}></canvas></div>`;
  }

  function RevenueView({ context }) {
    const records2026 = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.status !== 'cancelado');
    const indicators = records2026.filter(record => record.natureza === 'indicador');
    const indicator = tag => Number(indicators.find(record => hasTag(record, tag))?.valor_acordado || 0);
    const forecastRecords = records2026.filter(record => record.natureza === 'receita' && record.impacta_totais !== false && record.categoria !== 'pendencia' && hasTag(record, 'previsão'));
    const receiptRecords = records2026.filter(record => record.natureza === 'receita' && record.impacta_totais !== false && record.categoria !== 'pendencia' && hasTag(record, 'fornecedores'));
    const planning = records2026.filter(record => record.natureza === 'despesa' && hasTag(record, 'planejamento'));
    const actualExpenses = actualInvestmentRows(context);
    const forecastRevenue = indicator('receita') || sum(forecastRecords, record => record.valor_acordado);
    const received = sum(receiptRecords, record => recordRealized(context.payments, record));
    const forecastInvestment = indicator('investimento') || sum(planning, record => record.valor_acordado);
    const actualInvestment = sum(actualExpenses, item => item.value);
    const projectedBalance = indicator('saldo') || (forecastRevenue - forecastInvestment);
    const realizedBalance = received - actualInvestment;
    const supplierMap = new Map();
    forecastRecords.forEach(record => { if (!record.fornecedor) return; const key=supplierKey(record.fornecedor); const row=supplierMap.get(key)||{name:record.fornecedor,forecast:0,received:0}; row.forecast += Number(record.valor_acordado||0); supplierMap.set(key,row); });
    receiptRecords.forEach(record => { if (!record.fornecedor) return; const key=supplierKey(record.fornecedor); const row=supplierMap.get(key)||{name:record.fornecedor,forecast:0,received:0}; row.received += recordRealized(context.payments, record); supplierMap.set(key,row); });
    const suppliers = [...supplierMap.values()].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
    const pendingRecords = records2026.filter(record => record.categoria === 'pendencia' && !['concluido', 'cancelado'].includes(record.status));
    useLucide([suppliers.length, pendingRecords.length]);
    return html`<section className="management-section revenue-view"><div className="management-hero revenue-hero"><div><span className="eyebrow light">Receita · 2026</span><h2>Receber, investir<br/>e saber o que sobra.</h2><p>Previsão, recebimentos e investimentos agora formam um fluxo único, pronto para conferir e decidir.</p></div><div className="balance-orbit"><span><small>Saldo realizado</small><strong>${money(realizedBalance)}</strong></span><i></i><i></i></div></div>
      <div className="management-kpis six"><${MetricCard} label="Receita prevista" value=${forecastRevenue} icon="chart-no-axes-combined" tone="emerald" hint="Previsão anual"/><${MetricCard} label="Receita recebida" value=${received} icon="circle-dollar-sign" tone="emerald" hint="Execução conciliada"/><${MetricCard} label="A receber" value=${Math.max(0, forecastRevenue - received)} icon="clock-3" tone="gold" hint="Previsão menos recebido"/><${MetricCard} label="Investimento previsto" value=${forecastInvestment} icon="target" tone="investment" hint="Planejamento"/><${MetricCard} label="Investimento realizado" value=${actualInvestment} icon="receipt-text" tone="investment" hint="Gastos reais"/><${MetricCard} label="Saldo projetado" value=${projectedBalance} icon="scale" tone="slate" hint="Receita − investimento"/></div>
      <div className="management-grid revenue-grid"><article className="management-panel wide"><div className="panel-heading compact"><div><span className="eyebrow">Recebimentos mensais</span><h2>2026 x 2025</h2><p>Comparação dos recebimentos efetivamente conciliados em cada competência.</p></div></div><${RevenueComparisonChart} context=${context}/></article><article className="management-panel balance-card"><span className="eyebrow">Leitura do ano</span><div className="balance-equation"><span><small>Recebido</small><b>${money(received)}</b></span><em>−</em><span><small>Investido</small><b>${money(actualInvestment)}</b></span><em>=</em><span className=${realizedBalance < 0 ? 'negative' : 'positive'}><small>Saldo</small><b>${money(realizedBalance)}</b></span></div><div className="balance-progress"><div><span>Receita realizada</span><b>${forecastRevenue ? Math.round(received/forecastRevenue*100) : 0}%</b></div><i><em style=${{width:`${Math.min(100, forecastRevenue ? received/forecastRevenue*100 : 0)}%`}}></em></i></div></article></div>
      <article className="management-panel"><div className="panel-heading compact"><div><span className="eyebrow">De-para por fornecedor</span><h2>Previsão e recebido</h2><p>Ordem alfabética para a conferência bater com as planilhas oficiais.</p></div><span className="management-chip">${suppliers.length} fornecedores</span></div><div className="supplier-revenue-table"><table><thead><tr><th>Fornecedor</th><th>Previsão</th><th>Recebido</th><th>A receber</th><th>Realização</th></tr></thead><tbody>${suppliers.map(row => { const remaining=Math.max(0,row.forecast-row.received); const pct=row.forecast ? row.received/row.forecast*100 : (row.received>0?100:0); return html`<tr><td><strong>${row.name}</strong></td><td>${money(row.forecast)}</td><td><b className="positive-text">${money(row.received)}</b></td><td>${money(remaining)}</td><td><div className="table-progress"><i><em style=${{width:`${Math.min(100,pct)}%`}}></em></i><span>${Math.round(pct)}%</span></div></td></tr>`; })}</tbody></table></div></article>
      <article className="management-panel pending-financial-panel"><div className="panel-heading compact"><div><span className="eyebrow">Pendências e em haver</span><h2>O que ainda precisa de conferência</h2><p>Observações mensais e valores que exigem uma decisão da equipe.</p></div><span className=${`management-chip ${pendingRecords.length ? 'warning' : 'ok'}`}>${pendingRecords.length ? `${pendingRecords.length} aberto(s)` : 'Tudo conferido'}</span></div>${pendingRecords.length ? html`<div className="pending-financial-list">${pendingRecords.map(record => html`<button onClick=${() => context.openRecord(record)}><span><${Icon} name=${hasTag(record,'haver') ? 'piggy-bank' : 'triangle-alert'}/></span><div><strong>${record.fornecedor || record.titulo}</strong><small>${record.descricao || record.observacoes || record.referencia}</small></div><b>${record.valor_acordado ? money(record.valor_acordado) : 'Sem valor informado'}</b><${Icon} name="chevron-right"/></button>`)}</div>` : html`<${MiniEmpty} icon="badge-check" title="Nenhuma pendência aberta" text="Os apontamentos das planilhas estão todos resolvidos."/>`}</article>
    </section>`;
  }

  function ClosingView({ context }) {
    const receiptRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.natureza === 'receita' && record.impacta_totais !== false && hasTag(record, 'fornecedores') && record.status !== 'cancelado');
    const receiptIds = new Set(receiptRecords.map(record => record.id));
    const availableMonths = useMemo(() => uniq(context.payments.filter(payment => payment.status === 'pago' && receiptIds.has(payment.registro_id)).map(paymentMonthKey)).filter(Boolean).sort(), [context.payments, receiptRecords.length]);
    const [chosenMonth, setChosenMonth] = useState('');
    const month = chosenMonth || availableMonths.at(-1) || '2026-01';
    const receivedBySupplier = new Map();
    receiptRecords.forEach(record => {
      const value = sum(realizedPayments(context.payments, record.id).filter(payment => paymentMonthKey(payment) === month), paymentValue);
      if (value <= 0 || !record.fornecedor) return; const key=supplierKey(record.fornecedor); const row=receivedBySupplier.get(key)||{name:record.fornecedor,value:0,records:[]}; row.value += value; row.records.push(record); receivedBySupplier.set(key,row);
    });
    const forecastRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.natureza === 'receita' && record.impacta_totais !== false && hasTag(record, 'previsão') && record.status !== 'cancelado');
    const forecastBySupplier = new Map();
    forecastRecords.forEach(record => { const value=sum(realizedPayments(context.payments, record.id).filter(payment => paymentMonthKey(payment) === month), paymentValue); if (value>0 && record.fornecedor) forecastBySupplier.set(supplierKey(record.fornecedor),(forecastBySupplier.get(supplierKey(record.fornecedor))||0)+value); });
    const detailRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && hasTag(record,'centro-custo') && !hasTag(record,'legado-fora-coluna-valor') && String(record.data_inicio || '').startsWith(month));
    const detailBySupplier = new Map();
    detailRecords.forEach(record => { const key=supplierKey(record.fornecedor); const rows=detailBySupplier.get(key)||[]; rows.push(record); detailBySupplier.set(key,rows); });
    const competence = monthKeyToDate(month);
    const conferenceBySupplier = new Map((context.conferences || []).filter(item => String(item.competencia || '').slice(0,7) === month).map(item => [supplierKey(item.fornecedor), item]));
    const rows = [...receivedBySupplier.entries()].map(([key,row]) => ({ ...row, key, forecast:Number(forecastBySupplier.get(key)||0), conference:conferenceBySupplier.get(key), details:detailBySupplier.get(key)||[] })).sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
    const total = sum(rows,row=>row.value); const referenceTotal=sum(rows,row=>row.forecast); const signed=rows.filter(row=>row.conference?.status==='conferido').length; const divergent=rows.filter(row=>row.conference?.status==='divergente').length;
    useLucide([month, rows.length, signed, divergent]);
    const save = (row,status) => context.saveConference({ competencia:competence, fornecedor:row.name, status, valor:row.value, observacoes:status === 'divergente' ? `Divergência entre recebido (${money(row.value)}) e previsto (${money(row.forecast)}).` : `Competência de ${monthLong(month)} conferida pela equipe.` });
    return html`<section className="management-section closing-view"><div className="management-hero closing-hero"><div><span className="eyebrow light">Fechamento mensal</span><h2>Recebido lançado.<br/>Previsão conferida.</h2><p>Todos trabalham no mesmo fechamento: o recebido é comparado com a previsão, e cada decisão fica assinada no histórico.</p></div><label className="closing-month"><span>Competência</span><select value=${month} onChange=${event=>setChosenMonth(event.target.value)}>${availableMonths.length ? availableMonths.map(key=>html`<option value=${key}>${monthLong(key)}</option>`) : html`<option value=${month}>${monthLong(month)}</option>`}</select></label></div>
      ${context.conferencesSetupMissing && html`<div className="management-setup-warning"><${Icon} name="database-zap"/><div><strong>Conferência ainda não ativada no Supabase</strong><p>Execute <code>sql/11-GESTAO-MKT-V1.3.0.sql</code>. A leitura funciona sem ele; a assinatura fica bloqueada.</p></div></div>`}
      <div className="closing-kpis"><span><small>Recebido no mês</small><strong>${money(total)}</strong></span><span><small>Previsão de referência</small><strong>${money(referenceTotal)}</strong></span><span><small>Conferidos</small><strong>${signed}/${rows.length}</strong></span><span className=${divergent ? 'danger' : ''}><small>Divergências</small><strong>${divergent}</strong></span></div>
      <article className="management-panel"><div className="panel-heading compact"><div><span className="eyebrow">De-para mensal</span><h2>${monthLong(month)}</h2><p>Fornecedor por fornecedor, exatamente na ordem em que a conferência precisa acontecer.</p></div><span className="management-chip">${rows.length} fornecedores</span></div>${rows.length ? html`<div className="closing-table-wrap"><table className="closing-table"><thead><tr><th>Fornecedor</th><th>Centros de custo</th><th>Recebido</th><th>Previsto</th><th>Diferença</th><th>Conferência</th></tr></thead><tbody>${rows.map(row=>{ const diff=row.value-row.forecast; const status=row.conference?.status||'pendente'; return html`<tr className=${status}><td><strong>${row.name}</strong><small>${row.records.length} lançamento(s)</small></td><td><div className="cost-chips">${row.details.length ? row.details.map(detail=>html`<span className=${hasTag(detail,'adicional-investimento')?'extra':''}>${detail.centro_custo || category(detail.categoria).label}<b>${money(detail.valor_acordado)}</b></span>`) : html`<em>Sem abertura</em>`}</div></td><td><strong>${money(row.value)}</strong></td><td>${row.forecast ? money(row.forecast) : html`<span className="muted-value">Sem valor</span>`}</td><td><span className=${Math.abs(diff)>.01?'diff danger':'diff ok'}>${money(diff)}</span></td><td>${status==='conferido' ? html`<span className="signed-pill"><${Icon} name="badge-check"/>Assinado<small>${row.conference?.conferido_em ? dateTime(row.conference.conferido_em) : ''}</small></span>` : html`<div className="conference-actions"><button className="button primary small" disabled=${context.saving || context.conferencesSetupMissing} onClick=${()=>save(row,'conferido')}><${Icon} name="signature"/>Assinar</button><button className=${`icon-button ${status==='divergente'?'divergent':''}`} title="Marcar divergência" disabled=${context.saving || context.conferencesSetupMissing} onClick=${()=>save(row,'divergente')}><${Icon} name="triangle-alert"/></button></div>`}</td></tr>`;})}</tbody></table></div>` : html`<${MiniEmpty} icon="calendar-x" title="Nenhum fechamento nesta competência" text="Importe a planilha de fornecedores ou escolha outro mês."/>`}</article>
    </section>`;
  }

  function RecordsView({ context }) {
    const { records, payments, openRecord, editRecord, newRecord } = context;
    const [status, setStatus] = useState('todos'); const [categoryFilter, setCategoryFilter] = useState('todos'); const [layout, setLayout] = useState('table');
    const [pageSize, setPageSize] = useState(150);
    const filtered = records.filter(record => (status === 'todos' || record.status === status) && (categoryFilter === 'todos' || record.categoria === categoryFilter));
    const visible = filtered.slice(0, pageSize);
    useLucide([status, categoryFilter, layout, filtered.length]);
    return html`<section className="records-section"><div className="view-tools"><div className="view-tools-copy"><span className="eyebrow">Base unificada</span><h2>Todos os acompanhamentos</h2><p>Planejamento, recebimentos, investimentos e pendências na mesma fonte de verdade.</p></div><div className="view-tools-actions"><label className="compact-select"><${Icon} name="list-filter"/><select value=${status} onChange=${e => setStatus(e.target.value)}><option value="todos">Todos os status</option>${Object.entries(RECORD_STATUS).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></label><label className="compact-select"><${Icon} name="shapes"/><select value=${categoryFilter} onChange=${e => setCategoryFilter(e.target.value)}><option value="todos">Todas as categorias</option>${Object.entries(CATEGORIES).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></label><div className="layout-toggle"><button aria-label="Exibir em tabela" className=${layout === 'table' ? 'active' : ''} onClick=${() => setLayout('table')}><${Icon} name="list"/></button><button aria-label="Exibir em cartões" className=${layout === 'cards' ? 'active' : ''} onClick=${() => setLayout('cards')}><${Icon} name="layout-grid"/></button></div></div></div>
      ${filtered.length ? html`${layout === 'table' ? html`<div className="records-table-wrap"><table className="records-table"><thead><tr><th>Acompanhamento</th><th>Fluxo</th><th>Categoria</th><th>Status</th><th>Financeiro</th><th>Próximo vencimento</th><th></th></tr></thead><tbody>${visible.map(record => html`<${RecordRow} key=${record.id} record=${record} payments=${payments.filter(item => item.registro_id === record.id)} onOpen=${() => openRecord(record)} onEdit=${() => editRecord(record)}/>` )}</tbody></table></div>` : html`<div className="record-card-grid">${visible.map(record => html`<${RecordCard} key=${record.id} record=${record} onOpen=${() => openRecord(record)}/>` )}</div>`}${filtered.length > visible.length && html`<div className="load-more"><span>Exibindo ${int(visible.length)} de ${int(filtered.length)}</span><button className="button secondary" onClick=${() => setPageSize(size => size + 150)}><${Icon} name="chevrons-down"/>Carregar mais 150</button></div>`}` : html`<div className="large-empty"><span><${Icon} name="telescope" size=${34}/></span><h3>Nenhum acompanhamento nesta visão</h3><p>Ajuste os filtros ou cadastre o primeiro item.</p><button className="button primary" onClick=${newRecord}><${Icon} name="plus"/>Novo acompanhamento</button></div>`}</section>`;
  }

  function RecordRow({ record, onOpen, onEdit }) {
    const meta = category(record.categoria); const finance = record.situacao_financeira || 'sem_pagamentos'; const nature = NATURES[record.natureza] || NATURES.neutro; const flow = workflow(record);
    return html`<tr onClick=${onOpen} onKeyDown=${event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }} role="button" tabIndex="0"><td><div className="record-title-cell"><span className=${`category-mark ${meta.tone}`}><${Icon} name=${meta.icon}/></span><div><strong>${record.fornecedor || 'Sem fornecedor'}</strong><p>${record.titulo}</p><small>#${record.codigo || '—'} · ${record.ano_referencia}${record.impacta_totais === false ? ' · detalhamento' : ''}</small></div></div></td><td><span className=${`workflow-pill ${flow.key}`}><${Icon} name=${flow.icon}/>${flow.label}</span></td><td><span className="plain-category">${meta.label}</span><span className=${`nature-pill ${nature.tone}`}><${Icon} name=${nature.icon}/>${nature.label}</span></td><td><span className=${`status-pill ${record.status}`}><i></i>${RECORD_STATUS[record.status]?.label || record.status}</span></td><td><div className="finance-cell"><strong>${money(record.valor_acordado)}</strong><span className=${`finance-label ${finance}`}>${FINANCE_STATUS[finance] || finance}</span></div></td><td><span className=${record.pagamentos_atrasados ? 'date-alert' : ''}>${record.proximo_vencimento ? date(record.proximo_vencimento) : '—'}</span></td><td><button className="row-action" aria-label="Editar acompanhamento" onClick=${event => { event.stopPropagation(); onEdit(); }}><${Icon} name="pencil"/></button></td></tr>`;
  }

  function RecordCard({ record, onOpen }) {
    const meta = category(record.categoria); const nature = NATURES[record.natureza] || NATURES.neutro; const flow = workflow(record); const progress = record.valor_acordado ? Math.min(100, (Number(record.total_pago) / Number(record.valor_acordado)) * 100) : 0;
    return html`<button className="record-card" onClick=${onOpen}><div className="record-card-top"><span className=${`category-mark ${meta.tone}`}><${Icon} name=${meta.icon}/></span><span className=${`workflow-pill ${flow.key}`}><${Icon} name=${flow.icon}/>${flow.label}</span></div><span className="record-code">#${record.codigo || '—'} · ${record.ano_referencia}${record.impacta_totais === false ? ' · DETALHE' : ''}</span><h3>${record.fornecedor || record.titulo}</h3><p>${record.fornecedor ? record.titulo : record.referencia || 'Acompanhamento PMG'}</p><div className="record-card-meta"><span className=${`status-pill ${record.status}`}><i></i>${RECORD_STATUS[record.status]?.label || record.status}</span><span className=${`nature-pill ${nature.tone}`}><${Icon} name=${nature.icon}/>${nature.label}</span></div><div className="record-card-value"><span><small>Valor acompanhado</small><strong>${money(record.valor_acordado)}</strong></span><b>${Math.round(progress)}%</b></div><div className="record-progress"><i style=${{ width:`${progress}%` }}></i></div><div className="record-card-foot"><span>${record.proximo_vencimento ? `Próximo: ${date(record.proximo_vencimento)}` : 'Sem parcelas futuras'}</span><${Icon} name="arrow-up-right"/></div><div className="card-glow"></div></button>`;
  }

  function FinanceWorkspace({ context, activeView }) {
    const tabs = [
      ['receita', 'Visão financeira', 'chart-no-axes-combined'],
      ['financeiro', 'Agenda', 'calendar-clock'],
      ['fechamento', 'Fechamento', 'badge-check'],
      ['fornecedores', 'Parceiros', 'building-2'],
    ];
    const supplierRecords = context.allRecords.filter(record => Number(record.ano_referencia) === 2026
      && record.natureza === 'receita' && record.impacta_totais !== false && hasTag(record, 'fornecedores') && record.status !== 'cancelado');
    const supplierIds = new Set(supplierRecords.map(record => record.id));
    const receipts = context.payments.filter(payment => payment.status === 'pago' && supplierIds.has(payment.registro_id));
    const methodTotals = RECEIPT_METHODS.map(meta => {
      const rows = receipts.filter(payment => receiptMethodKey(payment.forma_pagamento) === meta.key);
      return { ...meta, count:rows.length, value:sum(rows, paymentValue) };
    });
    const pending = context.allRecords.filter(record => Number(record.ano_referencia) === 2026 && record.categoria === 'pendencia' && !['concluido', 'cancelado'].includes(record.status));
    const pendingValue = sum(pending, record => record.valor_acordado);
    useLucide([activeView, receipts.length, pending.length]);
    return html`<section className="finance-workspace">
      <div className="finance-hub-nav"><div><span className="eyebrow">Central financeira PMG</span><h2>Uma área, quatro leituras</h2><p>Receita, agenda, conferência e parceiros sem espalhar o controle pelo menu.</p></div><nav>${tabs.map(([key, label, icon]) => html`<button className=${activeView === key ? 'active' : ''} onClick=${() => context.setView(key)}><${Icon} name=${icon}/>${label}</button>`)}</nav></div>
      <div className="receipt-method-grid">${methodTotals.map(item => html`<article className=${`receipt-method ${item.tone}`}><span><${Icon} name=${item.icon}/></span><div><small>${item.label}</small><strong>${money(item.value)}</strong><em>${int(item.count)} lançamento(s)</em></div></article>`)}</div>
      ${pending.length > 0 && html`<button className="financial-pending-signal" onClick=${() => context.setView('receita')}><span><${Icon} name="triangle-alert"/></span><div><small>Pendências e valores em haver</small><strong>${int(pending.length)} item(ns) para conferência</strong></div><b>${money(pendingValue)}</b><${Icon} name="chevron-right"/></button>`}
      ${activeView === 'receita' && html`<${RevenueView} context=${context}/>`}
      ${activeView === 'financeiro' && html`<${FinanceView} context=${context}/>`}
      ${activeView === 'fechamento' && html`<${ClosingView} context=${context}/>`}
      ${activeView === 'fornecedores' && html`<${SuppliersView} context=${context}/>`}
    </section>`;
  }

  function FinanceView({ context }) {
    const { records, payments, openRecord, newPayment } = context; const recordMap = Object.fromEntries(context.allRecords.map(item => [item.id, item]));
    const allowed = new Set(records.map(item => item.id)); const visible = payments.filter(item => allowed.has(item.registro_id));
    const [paymentStatus, setPaymentStatus] = useState('abertos'); const [month, setMonth] = useState('todos'); const [method, setMethod] = useState('todos');
    const months = uniq(visible.map(item => item.vencimento?.slice(0, 7))).sort().reverse();
    const filtered = visible.filter(item => (month === 'todos' || item.vencimento?.startsWith(month))
      && (method === 'todos' || receiptMethodKey(item.forma_pagamento) === method)
      && (paymentStatus === 'todos' || paymentStatus === 'abertos' ? (paymentStatus === 'todos' || !['pago', 'cancelado'].includes(item.status)) : item.status === paymentStatus)).sort((a, b) => String(a.vencimento || '9999').localeCompare(String(b.vencimento || '9999')));
    const due = sum(visible.filter(item => !['pago', 'cancelado'].includes(item.status)), item => item.valor_previsto);
    const paid = sum(visible.filter(item => item.status === 'pago'), item => item.valor_pago || item.valor_previsto);
    const overdue = visible.filter(isOverdue);
    useLucide([paymentStatus, month, method, visible.length]);
    return html`<section className="finance-section"><div className="finance-hero"><div><span className="eyebrow light">Radar financeiro PMG</span><h2>O futuro dos pagamentos,<br/>sem surpresa no vencimento.</h2><p>Acompanhe previsões, aprovações e baixas em uma linha do tempo única.</p></div><div className="finance-hero-numbers"><span><small>Em aberto</small><strong>${money(due)}</strong></span><span><small>Realizado</small><strong>${money(paid)}</strong></span><span className=${overdue.length ? 'danger' : ''}><small>Atrasados</small><strong>${int(overdue.length)}</strong></span></div><div className="finance-orbit"><i></i><i></i><span><${Icon} name="wallet-cards" size=${32}/></span></div></div>
      <div className="view-tools finance-tools"><div><span className="eyebrow">Agenda de parcelas</span><h2>${int(filtered.length)} lançamentos encontrados</h2></div><div className="view-tools-actions"><label className="compact-select"><${Icon} name="calendar"/><select value=${month} onChange=${e => setMonth(e.target.value)}><option value="todos">Todos os meses</option>${months.map(item => html`<option value=${item}>${new Intl.DateTimeFormat('pt-BR', { month:'long', year:'numeric' }).format(new Date(`${item}-01T12:00:00`))}</option>`)}</select></label><label className="compact-select"><${Icon} name="landmark"/><select value=${method} onChange=${e => setMethod(e.target.value)}><option value="todos">Todos os tipos</option>${RECEIPT_METHODS.map(item => html`<option value=${item.key}>${item.label}</option>`)}</select></label><label className="compact-select"><${Icon} name="circle-dollar-sign"/><select value=${paymentStatus} onChange=${e => setPaymentStatus(e.target.value)}><option value="abertos">Somente em aberto</option><option value="todos">Todos os lançamentos</option>${Object.entries(PAYMENT_STATUS).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></label><button className="button primary" onClick=${() => newPayment(null)}><${Icon} name="plus"/>Nova parcela</button></div></div>
      <div className="payment-timeline">${filtered.length ? filtered.map(payment => { const record = recordMap[payment.registro_id]; const overdueItem = isOverdue(payment); const methodKey=receiptMethodKey(payment.forma_pagamento); return html`<article key=${payment.id} className=${`payment-row ${overdueItem ? 'overdue' : ''} ${payment.status}`} onClick=${() => record && openRecord(record)}><div className="payment-date"><b>${payment.vencimento ? payment.vencimento.slice(8, 10) : '—'}</b><span>${payment.vencimento ? monthLabel(new Date(`${payment.vencimento}T12:00:00`)) : 'sem data'}</span></div><span className="payment-line"><i></i></span><div className="payment-main"><div><span className=${`payment-status ${overdueItem ? 'atrasado' : payment.status}`}><${Icon} name=${overdueItem ? 'triangle-alert' : PAYMENT_STATUS[payment.status]?.icon || 'clock'}/>${overdueItem ? 'Atrasado' : PAYMENT_STATUS[payment.status]?.label || payment.status}</span><h3>${record?.fornecedor || record?.titulo || 'Acompanhamento'}</h3><p>${payment.descricao || `Parcela ${payment.parcela}`} · ${record?.titulo || ''}</p></div><div className="payment-amount"><strong>${money(payment.valor_previsto)}</strong><span className=${`method-pill ${methodKey}`}>${payment.forma_pagamento || 'Forma a definir'}</span></div><button className="row-action" onClick=${event => { event.stopPropagation(); context.editPayment(payment); }}><${Icon} name="pencil"/></button></div></article>`; }) : html`<div className="large-empty"><span><${Icon} name="calendar-check-2" size=${34}/></span><h3>Nenhuma parcela nesta seleção</h3><p>Cadastre uma previsão para preencher a agenda.</p></div>`}</div></section>`;
  }

  function SuppliersView({ context }) {
    const { records, openRecord } = context;
    const suppliers = useMemo(() => {
      const map = new Map(); records.forEach(record => { const name = record.fornecedor || 'Sem fornecedor'; const current = map.get(name) || { name, records:[], value:0, paid:0, overdue:0, categories:new Set() }; current.records.push(record); if (record.impacta_totais !== false && record.natureza !== 'indicador') { current.value += Number(record.valor_acordado || 0); current.paid += Number(record.total_pago || 0); } current.overdue += Number(record.pagamentos_atrasados || 0); current.categories.add(record.categoria); map.set(name, current); });
      return [...map.values()].sort((a, b) => b.value - a.value);
    }, [records]);
    useLucide([suppliers.length]);
    return html`<section className="suppliers-section"><div className="view-tools"><div className="view-tools-copy"><span className="eyebrow">Relacionamento comercial</span><h2>Mapa de parceiros</h2><p>Visão consolidada de tudo o que existe com cada fornecedor.</p></div><div className="supplier-summary"><span><b>${int(suppliers.length)}</b> parceiros</span><span><b>${money(sum(suppliers, item => item.value))}</b> acompanhados</span></div></div><div className="supplier-grid">${suppliers.map((supplier, index) => { const progress = supplier.value ? Math.min(100, supplier.paid / supplier.value * 100) : 0; return html`<article key=${supplier.name} className="supplier-card" style=${{ '--delay':`${Math.min(index, 12) * 45}ms` }}><div className="supplier-card-head"><span className="supplier-initial">${supplier.name.charAt(0)}</span><div><h3>${supplier.name}</h3><p>${int(supplier.records.length)} acompanhamentos · ${int(supplier.categories.size)} categorias</p></div>${supplier.overdue ? html`<span className="supplier-alert"><${Icon} name="triangle-alert"/>${supplier.overdue}</span>` : html`<span className="supplier-ok"><${Icon} name="check"/></span>`}</div><div className="supplier-money"><span><small>Valor total</small><strong>${money(supplier.value)}</strong></span><span><small>Realizado</small><strong>${money(supplier.paid)}</strong></span></div><div className="supplier-progress"><i style=${{ width:`${progress}%` }}></i></div><div className="supplier-tags">${[...supplier.categories].slice(0, 3).map(key => html`<span>${category(key).label}</span>`)}</div><button onClick=${() => openRecord(supplier.records[0])}>Abrir histórico <${Icon} name="arrow-right"/></button><div className="card-glow"></div></article>`; })}</div></section>`;
  }

  function ModalShell({ title, eyebrow, icon, onClose, children, wide = false }) {
    const dialogRef = useRef(null);
    useEffect(() => {
      const previous = document.activeElement;
      const close = event => {
        if (event.key === 'Escape') onClose();
        if (event.key !== 'Tab' || !dialogRef.current) return;
        const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown', close); document.body.classList.add('modal-open');
      requestAnimationFrame(() => dialogRef.current?.querySelector('input,select,textarea,button')?.focus());
      return () => { document.removeEventListener('keydown', close); document.body.classList.remove('modal-open'); previous?.focus?.(); };
    }, [onClose]);
    useLucide([title]);
    return html`<div className="modal-backdrop" onMouseDown=${event => event.target === event.currentTarget && onClose()}><section ref=${dialogRef} className=${`ac-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label=${title}><header><span className="modal-title-icon"><${Icon} name=${icon}/></span><div><span className="eyebrow">${eyebrow}</span><h2>${title}</h2></div><button className="icon-button" onClick=${onClose} aria-label="Fechar"><${Icon} name="x"/></button></header>${children}</section></div>`;
  }

  function Field({ label, hint, wide = false, children }) {
    return html`<label className=${`form-field ${wide ? 'wide' : ''}`}><span>${label}${hint && html`<small>${hint}</small>`}</span>${children}</label>`;
  }

  function RecordModal({ record, collaborators, onClose, onSave, saving }) {
    const editing = Boolean(record.id);
    const submit = event => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      const payload = {
        controle:record.controle || 'marketing', ano_referencia:Number(form.get('ano_referencia')),
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
      <${Field} label="Tags" hint="separe por vírgula"><input name="tags" defaultValue=${tagList(record).join(', ')} placeholder="diretoria, cota, 2026"/></${Field}>
      </div></div><div className="form-section"><div className="form-section-title"><span>03</span><div><strong>Contato e observações</strong><small>Informações para ninguém depender de mensagem antiga</small></div></div><div className="form-grid">
      <${Field} label="Nome do contato"><input name="contato_nome" defaultValue=${record.contato_nome || ''}/></${Field}>
      <${Field} label="E-mail"><input name="contato_email" type="email" defaultValue=${record.contato_email || ''}/></${Field}>
      <${Field} label="Telefone"><input name="contato_telefone" defaultValue=${record.contato_telefone || ''}/></${Field}>
      <${Field} label="Observações internas" wide=${true}><textarea name="observacoes" rows="3" defaultValue=${record.observacoes || ''}></textarea></${Field}>
      </div></div><footer className="modal-footer"><button type="button" className="button secondary" onClick=${onClose}>Cancelar</button><button type="submit" className="button primary" disabled=${saving}>${saving ? html`<span className="spinner"></span>` : html`<${Icon} name="save"/>`}${editing ? 'Salvar alterações' : 'Criar acompanhamento'}</button></footer></form></${ModalShell}>`;
  }

  function PaymentModal({ payment, records, onClose, onSave, saving }) {
    const editing = Boolean(payment.id); const defaultRecord = payment.registro_id || records[0]?.id || '';
    const [currentStatus, setCurrentStatus] = useState(payment.status || 'previsto');
    const paid = currentStatus === 'pago';
    const submit = event => {
      event.preventDefault(); const form = new FormData(event.currentTarget); const status = form.get('status'); const value = parseMoney(form.get('valor_previsto'));
      if (status === 'pago' && (!form.get('pago_em') || !form.get('forma_pagamento') || !form.get('numero_documento'))) return;
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
      <${Field} label="Status"><select name="status" value=${currentStatus} onChange=${event => setCurrentStatus(event.target.value)}>${Object.entries(PAYMENT_STATUS).map(([key, item]) => html`<option value=${key}>${item.label}</option>`)}</select></${Field}>
      <${Field} label=${paid ? 'Tipo / método do movimento *' : 'Tipo / método do movimento'}><select name="forma_pagamento" defaultValue=${payment.forma_pagamento || ''} required=${paid}><option value="">${paid ? 'Selecione para concluir' : 'A definir'}</option>${PAYMENT_METHODS.filter(item => item !== 'Não informado').map(item => html`<option value=${item}>${item}</option>`)}</select><small className="field-help">Recebimentos: desconto em boleto, depósito, bonificação ou sobra Marketing.</small></${Field}>
      <${Field} label=${paid ? 'Data realizada *' : 'Data realizada'}><input name="pago_em" type="date" defaultValue=${payment.pago_em || (paid ? todayKey() : '')} required=${paid}/></${Field}>
      <${Field} label="Valor realizado"><div className="money-input"><span>R$</span><input name="valor_pago" inputMode="decimal" defaultValue=${payment.valor_pago || ''}/></div></${Field}>
      <${Field} label="Favorecido"><input name="favorecido" defaultValue=${payment.favorecido || ''}/></${Field}>
      <${Field} label=${paid ? 'Documento / NF *' : 'Documento / NF'}><input name="numero_documento" defaultValue=${payment.numero_documento || ''} required=${paid} placeholder=${paid ? 'Obrigatório para confirmar a baixa' : ''}/></${Field}>
      <${Field} label="Observações" wide=${true}><textarea name="observacoes" rows="3" defaultValue=${payment.observacoes || ''}></textarea></${Field}>
      </div>${paid && html`<div className="payment-proof-note"><${Icon} name="shield-check"/><div><strong>Baixa financeira protegida</strong><p>Data, forma e documento são obrigatórios. PDFs devem ser enviados pela Caixa de Documentos e conferidos antes do vínculo.</p></div></div>`}<footer className="modal-footer"><button type="button" className="button secondary" onClick=${onClose}>Cancelar</button><button type="submit" className="button primary" disabled=${saving}>${saving ? html`<span className="spinner"></span>` : html`<${Icon} name="save"/>`}Salvar pagamento</button></footer></form></${ModalShell}>`;
  }

  function RecordDrawer({ record, context, onClose }) {
    const [tab, setTab] = useState('resumo');
    const payments = context.payments.filter(item => item.registro_id === record.id).sort((a, b) => (a.parcela || 0) - (b.parcela || 0));
    const attachments = context.attachments.filter(item => item.registro_id === record.id);
    const linkedDocuments = (context.documentItems || []).filter(item => item.registro_id === record.id && item.status === 'aprovado');
    const activities = context.activities.filter(item => item.registro_id === record.id);
    const collaboratorMap = Object.fromEntries(context.collaborators.map(item => [item.id, item]));
    const meta = category(record.categoria); const nature = NATURES[record.natureza] || NATURES.neutro; const flow = workflow(record); const progress = record.valor_acordado ? Math.min(100, Number(record.total_pago) / Number(record.valor_acordado) * 100) : 0;
    useEffect(() => { document.body.classList.add('drawer-open'); return () => document.body.classList.remove('drawer-open'); }, []);
    useLucide([tab, payments.length, attachments.length, activities.length]);

    async function archiveRecord() {
      if (!confirm('Arquivar este acompanhamento? Ele sairá das visões ativas, mas o histórico será preservado.')) return;
      if (DEMO_MODE) { context.notify('Modo demonstração: arquivamento validado.', 'info'); onClose(); return; }
      context.setSaving(true);
      try { const { error } = await context.client.rpc('arquivar_acompanhamento_v1', { p_registro_id:record.id }); if (error) throw error; await context.reload(true); context.notify('Acompanhamento arquivado.'); onClose(); }
      catch (error) { context.notify(error.message || 'Não foi possível arquivar.', 'error'); } finally { context.setSaving(false); }
    }

    async function quickPaid(payment) {
      context.editPayment({ ...payment, status:'pago', valor_pago:payment.valor_pago || payment.valor_previsto, pago_em:payment.pago_em || todayKey() });
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

    return html`<div className="drawer-shell"><button className="drawer-backdrop" onClick=${onClose} aria-label="Fechar detalhes"></button><aside className="record-drawer"><header className="drawer-head"><div className="drawer-head-actions"><span className=${`workflow-pill ${flow.key}`}><${Icon} name=${flow.icon}/>${flow.label}</span><button className="icon-button" onClick=${onClose}><${Icon} name="x"/></button></div><div className="drawer-identity"><span className=${`category-mark large ${meta.tone}`}><${Icon} name=${meta.icon} size=${24}/></span><div><small>#${record.codigo || '—'} · ${record.ano_referencia} · ${meta.label}</small><h2>${record.fornecedor || record.titulo}</h2><p>${record.fornecedor ? record.titulo : record.referencia || ''}</p></div></div><div className="drawer-status-row"><span className=${`status-pill ${record.status}`}><i></i>${RECORD_STATUS[record.status]?.label || record.status}</span><span className=${`nature-pill ${nature.tone}`}><${Icon} name=${nature.icon}/>${nature.label}</span><span className=${`finance-label ${record.situacao_financeira}`}>${FINANCE_STATUS[record.situacao_financeira] || record.situacao_financeira}</span>${record.impacta_totais === false && html`<span className="detail-pill"><${Icon} name="layers-2"/>Detalhamento</span>`}${record.prioridade === 'urgente' && html`<span className="priority-urgent"><${Icon} name="siren"/>Urgente</span>`}</div></header>
      <nav className="drawer-tabs">${[['resumo','Visão geral'],['pagamentos','Pagamentos'],['documentos','Documentos'],['historico','Histórico']].map(([key, label]) => html`<button className=${tab === key ? 'active' : ''} onClick=${() => setTab(key)}>${label}${key === 'pagamentos' && html`<b>${payments.length}</b>`}${key === 'documentos' && (attachments.length + linkedDocuments.length) ? html`<b>${attachments.length + linkedDocuments.length}</b>` : null}</button>`)}</nav>
      <div className="drawer-content">
        ${tab === 'resumo' && html`<div className="drawer-section-stack"><section className="drawer-money-card"><div><small>Valor acompanhado</small><strong>${money(record.valor_acordado)}</strong></div><div className="drawer-money-split"><span><small>Realizado</small><b>${money(record.total_pago)}</b></span><span><small>Saldo futuro</small><b>${money(record.saldo_aberto)}</b></span></div><div className="drawer-progress-label"><span>Execução financeira</span><b>${Math.round(progress)}%</b></div><div className="drawer-progress"><i style=${{ width:`${progress}%` }}></i></div></section><section className="drawer-info-grid"><div><span><${Icon} name="calendar-range"/>Período</span><strong>${record.data_inicio ? date(record.data_inicio) : 'Não definido'} → ${record.data_fim ? date(record.data_fim) : 'aberto'}</strong></div><div><span><${Icon} name="user-round"/>Responsável</span><strong>${collaboratorMap[record.responsavel_id]?.nome || 'Não atribuído'}</strong></div><div><span><${Icon} name="crosshair"/>Referência</span><strong>${record.referencia || 'Não informada'}</strong></div><div><span><${Icon} name="database"/>Origem</span><strong>${sourceLabel(record)}</strong></div></section>${record.descricao && html`<section className="drawer-text"><span className="eyebrow">Descrição</span><p>${record.descricao}</p></section>`}${record.observacoes && html`<section className="drawer-note"><${Icon} name="sticky-note"/><div><strong>Observações internas</strong><p>${record.observacoes}</p></div></section>`}<div className="drawer-actions"><button className="button primary" onClick=${() => context.editRecord(record)}><${Icon} name="pencil"/>Editar acompanhamento</button><button className="button secondary" onClick=${() => context.newPayment(record)}><${Icon} name="receipt-text"/>Adicionar parcela</button><button className="button danger-ghost" onClick=${archiveRecord}><${Icon} name="archive"/>Arquivar</button></div></div>`}
        ${tab === 'pagamentos' && html`<div className="drawer-section-stack"><div className="drawer-section-heading"><div><span className="eyebrow">Cronograma financeiro</span><h3>${payments.length ? `${payments.length} lançamento(s)` : 'Sem parcelas'}</h3></div><button className="button primary small" onClick=${() => context.newPayment(record)}><${Icon} name="plus"/>Adicionar</button></div>${payments.length ? payments.map(payment => html`<article className=${`drawer-payment ${isOverdue(payment) ? 'overdue' : ''}`}><span className=${`payment-check ${payment.status}`}><${Icon} name=${payment.status === 'pago' ? 'check' : isOverdue(payment) ? 'triangle-alert' : 'clock-3'}/></span><div><strong>${payment.descricao || `Parcela ${payment.parcela}`}</strong><p>${payment.vencimento ? `Vence ${date(payment.vencimento)}` : 'Sem vencimento'} · ${payment.forma_pagamento || 'Forma a definir'}</p></div><span><strong>${money(payment.valor_previsto)}</strong><small>${isOverdue(payment) ? 'Atrasado' : PAYMENT_STATUS[payment.status]?.label}</small></span><div className="drawer-payment-actions">${payment.status !== 'pago' && html`<button title="Marcar como pago" onClick=${() => quickPaid(payment)}><${Icon} name="check"/></button>`}<button title="Editar" onClick=${() => context.editPayment(payment)}><${Icon} name="pencil"/></button></div></article>`) : html`<${MiniEmpty} icon="receipt-text" title="Nenhum pagamento cadastrado" text="Crie parcelas, datas e formas de pagamento para controlar o fluxo futuro." action=${() => context.newPayment(record)}/>`}</div>`}
        ${tab === 'documentos' && html`<div className="drawer-section-stack"><div className="document-gate"><span><${Icon} name="scan-line" size=${28}/></span><div><h3>Todo PDF passa pela conferência</h3><p>A Caixa de Documentos faz a leitura, exige sua validação e somente depois vincula o arquivo ao acompanhamento.</p></div><button className="button primary small" type="button" onClick=${() => { onClose(); context.setView('documentos'); }}><${Icon} name="file-up"/>Enviar e conferir</button></div>${linkedDocuments.length ? html`<div className="linked-documents"><span className="eyebrow">Conferidos pela Caixa de Entrada</span>${linkedDocuments.map(item => html`<button className="attachment-row reviewed" onClick=${() => openInboxDocument(item)}><span><${Icon} name="scan-line"/></span><div><strong>${item.entrada?.nome_arquivo || 'Documento conferido'}</strong><small>${documentTypeLabel(item.tipo)} · página ${(item.paginas || []).join(', ')}</small></div><${Icon} name="badge-check"/></button>`)}</div>` : null}<div className="attachment-list">${attachments.map(item => html`<button className="attachment-row" onClick=${() => openAttachment(item)}><span><${Icon} name=${item.mime_type?.includes('pdf') ? 'file-text' : item.mime_type?.includes('image') ? 'image' : 'paperclip'}/></span><div><strong>${item.nome}</strong><small>${item.tipo?.replace('_', ' ')} · ${item.tamanho_bytes ? `${Math.round(item.tamanho_bytes / 1024)} KB` : ''}</small></div><${Icon} name="external-link"/></button>`)}</div></div>`}
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
    const text = normalize(value); const deposit = text.includes('deposito') || text.includes('desposito'); const discount = text.includes('desconto') || text.includes('abatimento') || text.includes('boleto');
    if (text.includes('sobra')) return 'Sobra Marketing';
    if (text.includes('bonific')) return 'Bonificação';
    if (deposit && discount) return 'Depósito + desconto em boleto';
    if (deposit || text.includes('pix') || text.includes('ted') || text.includes('transfer')) return 'Depósito';
    if (discount || /\d/.test(text)) return 'Desconto em boleto';
    return 'Não informado';
  }

  function officialMethodTag(value) {
    const method = officialMethod(value);
    if (method === 'Sobra Marketing') return 'recebimento-sobra-marketing';
    if (method === 'Bonificação') return 'recebimento-bonificacao';
    if (method === 'Depósito') return 'recebimento-deposito';
    if (method === 'Depósito + desconto em boleto') return 'recebimento-misto';
    if (method === 'Desconto em boleto') return 'recebimento-desconto-boleto';
    return 'recebimento-nao-informado';
  }

  function workbookFileText(workbook, filePath) {
    const content = workbook?.files?.[filePath]?.content;
    if (typeof content === 'string') return content;
    if (content instanceof Uint8Array || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(content))) {
      if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(content);
      return Array.from(content, byte => String.fromCharCode(byte)).join('');
    }
    return '';
  }

  function worksheetXmlPath(workbook, sheetName) {
    const sheet = workbook?.Workbook?.Sheets?.find(item => item.name === sheetName);
    const relationshipId = sheet?.id;
    const relationships = workbookFileText(workbook, 'xl/_rels/workbook.xml.rels');
    if (relationshipId && relationships) {
      const relation = relationships.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId=["']${relationshipId}["'])[^>]*/>`, 'i'))?.[0];
      const target = relation?.match(/\bTarget=["']([^"']+)["']/i)?.[1];
      if (target) return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    }
    const index = workbook.SheetNames.indexOf(sheetName);
    return index >= 0 ? `xl/worksheets/sheet${index + 1}.xml` : '';
  }

  function planningSourceStatus(workbook, cellReference) {
    const xml = workbookFileText(workbook, worksheetXmlPath(workbook, 'Planejamento'));
    const cellTag = xml.match(new RegExp(`<c\\b(?=[^>]*\\br=["']${cellReference}["'])[^>]*>`, 'i'))?.[0] || '';
    const styleIndex = Number(cellTag.match(/\bs=["'](\d+)["']/i)?.[1]);
    const style = Number.isInteger(styleIndex) ? workbook?.Styles?.CellXf?.[styleIndex] : null;
    const fontIndex = Number(style?.fontId ?? style?.fontid);
    const color = Number.isInteger(fontIndex) ? workbook?.Styles?.Fonts?.[fontIndex]?.color : null;
    return /FF0000$/i.test(String(color?.rgb || '')) ? 'realizado' : 'previsto';
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
    const canonicalFile = `Fornecedores ${year}.xlsx`; const items = []; const totals = []; const knownSuppliers = new Set();
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
        const supplier = officialSupplierName(supplierRaw); const document = String(row[3] ?? '').trim(); const method = officialMethod(document); const specific = specificCostValue(row); const highlighted = specific.value;
        knownSuppliers.add(supplier);
        const recordFingerprint = fingerprint(['marketing', 'fornecedores', year, sheetName, supplier, categoryRaw]);
        calculated += value;
        items.push(officialItem({
          controle:'marketing', ano_referencia:year, fornecedor:supplier, natureza:'receita', impacta_totais:true,
          categoria:inferCategory(categoryRaw), titulo:`${categoryRaw.replace(/\s+/g, ' ').trim()} — ${supplier} — ${monthLabel} ${year}`,
          descricao:`Verba mensal recebida do fornecedor.${highlighted > 0 ? ` A fonte destaca ${money(highlighted)} para abertura de centro de custo.` : ''}`,
          referencia:categoryRaw, status:'concluido', data_inicio:officialMonthStart(year, monthIndex), data_fim:officialMonthEnd(year, monthIndex),
          valor_acordado:value, numero_documento:document, tags:['marketing', 'fornecedores', String(year), monthLabel.toLocaleLowerCase('pt-BR'), officialMethodTag(document), ...officialTags(categoryRaw)],
          observacoes:highlighted > 0 ? `Centro de custo destacado: ${money(highlighted)}.` : '', origem_importacao:canonicalFile, linha_origem:line,
          fingerprint:recordFingerprint, dados_originais:{ arquivo:canonicalFile, aba:sheetName, linha:line, campanha:categoryRaw, fornecedor_original:supplierRaw, verba:value, nf:document, valor_especifico:highlighted || null, tipo_recebimento:method },
        }, [{
          parcela:1, descricao:`Competência ${monthLabel} ${year}`, valor_previsto:value, valor_pago:value,
          vencimento:officialMonthEnd(year, monthIndex), pago_em:officialMonthEnd(year, monthIndex), status:'pago', forma_pagamento:method,
          favorecido:supplier, numero_documento:document, observacoes:'A fonte informa apenas a competência mensal; a data exata do movimento não foi registrada.',
          fingerprint:fingerprint([recordFingerprint, 'competencia', year, monthIndex + 1]),
        }]));
        if (highlighted > 0) {
          const center = costCenterFromCampaign(categoryRaw); const outsideVerba = /mtrix|emitrix/.test(normalize(categoryRaw));
          const legacyOutsideColumn = specific.legacy;
          const detailFingerprint = fingerprint(['marketing', 'centro-custo', year, sheetName, supplier, categoryRaw, center]);
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
            vencimento:officialMonthEnd(year, monthIndex), pago_em:officialMonthEnd(year, monthIndex), status:'pago', forma_pagamento:method,
            favorecido:supplier, numero_documento:document, observacoes:outsideVerba ? 'Investimento adicional fora da verba.' : 'Detalhamento já incluído na verba recebida.',
            fingerprint:fingerprint([detailFingerprint, 'centro-custo', year, monthIndex + 1]) }]));
        }
      });
      rows.slice(2).forEach((row, offset) => {
        const note = String(row[0] ?? '').trim(); if (!note || !/pendent|falta|ainda nao|faltou/.test(normalize(note))) return;
        const line = offset + 3; const noteValue = officialMoney(note.match(/R\$\s*[\d.,]+/i)?.[0]);
        const noteKey = normalize(note); const supplierMatches = [...knownSuppliers].filter(name => noteKey.includes(normalize(name)));
        const supplier = supplierMatches.length === 1 ? supplierMatches[0] : '';
        items.push(officialItem({
          controle:'marketing', ano_referencia:year, fornecedor:supplier, natureza:'receita', impacta_totais:noteValue > 0, categoria:'pendencia',
          titulo:`Pendência — ${monthLabel} ${year}`, descricao:note, referencia:'Observação da planilha mensal', status:'negociacao', prioridade:'alta',
          data_inicio:officialMonthEnd(year, monthIndex), valor_acordado:noteValue, tags:['marketing', 'pendência', String(year), monthLabel.toLocaleLowerCase('pt-BR')],
          observacoes:note, origem_importacao:canonicalFile, linha_origem:line,
          fingerprint:fingerprint(['marketing', 'fornecedores', year, sheetName, note]),
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
    const recordFingerprint = fingerprint(['marcos', 'detalhamento', 2026, sheetName, title]);
    const identityCounts = new Map();
    const payments = lines.filter(line => line.value > 0).map((line, index) => {
      const identity = normalize([line.description, line.due, line.favored].join('|'));
      const occurrence = (identityCounts.get(identity) || 0) + 1;
      identityCounts.set(identity, occurrence);
      return {
        parcela:index + 1, descricao:line.description || `Item ${index + 1}`, valor_previsto:line.value,
        valor_pago:line.status === 'pago' ? line.value : 0, vencimento:line.due || '',
        pago_em:line.status === 'pago' ? (line.paidAt || line.due || '') : '', status:line.status || 'previsto',
        forma_pagamento:line.method || 'Não informado', favorecido:line.favored || '', observacoes:line.observations || '',
        fingerprint:fingerprint([recordFingerprint, line.description, line.due, line.favored, occurrence]),
      };
    });
    items.push(officialItem({
      controle:'marcos', ano_referencia:2026, natureza:nature, impacta_totais:false, categoria:detailCategory, titulo:title,
      descricao:'Detalhamento operacional preservado da respectiva aba da planilha MKTG 2026.', referencia:reference || sheetName,
      status, data_inicio:startDate, valor_acordado:value, centro_custo:'Marketing',
      tags:['marcos', 'detalhamento', '2026', normalize(sheetName)], observacoes:observations, origem_importacao:canonicalFile,
      fingerprint:recordFingerprint, dados_originais:{ arquivo:canonicalFile, aba:sheetName, linhas:lines },
    }, payments));
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
        descricao:'Valor anual indicado como FECHADO na planilha oficial.', referencia:'Previsão de Verbas 2025 — FECHADO', status:'concluido',
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
        titulo:`Previsão anual de verba 2026 — ${supplier}`, descricao:'Previsão anual com os movimentos mensais informados na planilha oficial.',
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
    const planningRows = XLSX.utils.sheet_to_json(workbook.Sheets.Planejamento, { header:1, defval:null, raw:true, blankrows:false });
    for (let columnIndex = 1; columnIndex <= 15; columnIndex += 1) {
      const header = String(planningRows[1]?.[columnIndex] ?? '').trim(); if (!header) continue;
      const monthly = Array.from({ length:12 }, (_, index) => officialMoney(planningRows[2 + index]?.[columnIndex]));
      const sourceStatuses = monthly.map((value, monthIndex) => value > 0
        ? planningSourceStatus(workbook, XLSX.utils.encode_cell({ r:monthIndex + 2, c:columnIndex })) : 'vazio');
      const total = sum(monthly, value => value); if (total <= 0) continue;
      const realizedCount = sourceStatuses.filter(status => status === 'realizado').length;
      const plannedCount = sourceStatuses.filter(status => status === 'previsto').length;
      const recordFingerprint = fingerprint(['marcos', 'planejamento', 2026, header]);
      items.push(officialItem({
        controle:'marcos', ano_referencia:2026, natureza:'despesa', impacta_totais:true, categoria:planningCategory(header), titulo:`Planejamento 2026 — ${header}`,
        descricao:'Planejamento anual de investimento da PMG conforme a planilha oficial.', referencia:header, status:plannedCount ? 'em_andamento' : 'concluido',
        data_inicio:'2026-01-01', data_fim:'2026-12-31', valor_acordado:total, centro_custo:'Marketing', tags:['marcos', 'planejamento', 'despesa', '2026', normalize(header)],
        observacoes:`${realizedCount} competência(s) já realizada(s) em vermelho e ${plannedCount} ainda prevista(s) em preto na fonte.`,
        origem_importacao:canonicalFile, linha_origem:2, fingerprint:recordFingerprint,
        dados_originais:{ arquivo:canonicalFile, aba:'Planejamento', coluna:XLSX.utils.encode_col(columnIndex), categoria_original:header, valores_mensais:monthly, status_mensais:sourceStatuses },
      }, monthly.map((value, monthIndex) => ({ value, monthIndex, sourceStatus:sourceStatuses[monthIndex] })).filter(item => item.value > 0).map(({ value, monthIndex, sourceStatus }, index) => ({
        parcela:index + 1, descricao:`${header} — ${OFFICIAL_MONTHS[monthIndex][1]} 2026`, valor_previsto:value, valor_pago:sourceStatus === 'realizado' ? value : 0,
        vencimento:officialMonthEnd(2026, monthIndex), pago_em:sourceStatus === 'realizado' ? officialMonthEnd(2026, monthIndex) : '', status:sourceStatus === 'realizado' ? 'pago' : 'previsto', forma_pagamento:'Não informado',
        observacoes:sourceStatus === 'realizado' ? 'Valor realizado: a célula está vermelha na planilha oficial.' : 'Valor previsto: a célula está preta na planilha oficial. A passagem do mês não realiza a despesa.',
        fingerprint:fingerprint([recordFingerprint, 'planejamento', monthIndex + 1])
      }))));
    }
    [['receita', workbook.Sheets.RECEITA.E58?.v], ['investimento', workbook.Sheets.RECEITA.E56?.v], ['saldo', workbook.Sheets.RECEITA.E60?.v]].forEach(([key, rawValue]) => {
      const value = officialMoney(rawValue); if (value <= 0) return; const titles = { receita:'Previsão de receita 2026', investimento:'Previsão de investimento 2026', saldo:'Previsão de saldo 2026' };
      items.push(officialItem({ controle:'marcos', ano_referencia:2026, natureza:'indicador', impacta_totais:false, categoria:'meta_financeira', titulo:titles[key],
        descricao:'Indicador executivo preservado exatamente como informado na planilha MKTG 2026.', referencia:'PREVISÃO ORÇAMENTÁRIA', status:'aprovado',
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

  function ImportView({ context, defaultYear }) {
    const inputRef = useRef(null); const workbookRef = useRef(null);
    const [file, setFile] = useState(null); const [sheets, setSheets] = useState([]); const [sheet, setSheet] = useState('');
    const [headers, setHeaders] = useState([]); const [rows, setRows] = useState([]); const [mapping, setMapping] = useState({});
    const [official, setOfficial] = useState(null);
    const [control, setControl] = useState('marketing');
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
        }
        setResult(total); await context.reload(true); context.notify(`${total.criadas + total.atualizadas} registros conciliados.`);
      } catch (error) { context.notify(error.message || 'Falha na importação.', 'error'); }
      finally { setImporting(false); }
    }

    const preview = official ? official.items.slice(0, 5) : mappedPayload(rows.slice(0, 5));
    return html`<section className="import-section"><div className="import-hero"><div><span className="eyebrow light">Importador inteligente</span><h2>Traga anos de planilhas<br/>para uma única história.</h2><p>A Central reconhece colunas, sugere correspondências e preserva a linha original para auditoria.</p></div><div className="import-features"><span><${Icon} name="wand-sparkles"/><b>Mapeamento automático</b><small>Reconhece nomes parecidos</small></span><span><${Icon} name="shield-check"/><b>Sem duplicar</b><small>Identifica reimportações</small></span><span><${Icon} name="history"/><b>Rastreável</b><small>Arquivo e linha de origem</small></span></div></div>
      ${!file ? html`<div className=${`import-drop ${dragging ? 'dragging' : ''}`} onDragOver=${event => { event.preventDefault(); setDragging(true); }} onDragLeave=${() => setDragging(false)} onDrop=${event => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }} onClick=${() => inputRef.current?.click()}><input ref=${inputRef} hidden type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange=${event => loadFile(event.target.files[0])}/><div className="import-drop-art"><span><${Icon} name="file-spreadsheet" size=${40}/></span><i></i><i></i><i></i></div><h3>Solte sua planilha aqui</h3><p>Excel ou CSV · dados de 2024, 2025, 2026 e futuras atualizações</p><button className="button primary"><${Icon} name="folder-open"/>Escolher arquivo</button></div>` : html`<div className="import-workspace"><div className="import-file-bar"><span className="file-badge"><${Icon} name="file-spreadsheet"/></span><div><strong>${file.name}</strong><small>${int(rows.length)} registros reconhecidos · ${sheets.length} aba(s)</small></div><label><span>Leitura</span>${official ? html`<select disabled><option>Todas as abas</option></select>` : html`<select value=${sheet} onChange=${event => readSheet(event.target.value)}>${sheets.map(name => html`<option value=${name}>${name}</option>`)}</select>`}</label><label><span>Fluxo da informação</span><select value=${control} disabled=${Boolean(official)} onChange=${event => setControl(event.target.value)}><option value="marketing">Recebimentos e fornecedores</option><option value="marcos">Planejamento e metas</option></select></label><label><span>Ano</span><input type="number" value=${year} disabled=${Boolean(official)} min="2000" max="2200" onInput=${event => setYear(Number(event.target.value))}/></label><button className="icon-button" title="Trocar arquivo" onClick=${() => { setFile(null); setRows([]); setOfficial(null); setResult(null); workbookRef.current = null; }}><${Icon} name="x"/></button></div>
        ${official ? html`<div className="mapping-panel official-detection"><div className="official-detection-icon"><${Icon} name="badge-check" size=${25}/></div><div><span className="eyebrow">Modelo oficial reconhecido</span><h3>${official.label}</h3><p>A Central leu todas as abas, retirou cabeçalhos e totais, ignorou marcadores de R$ 1,00 e preparou uma atualização sem duplicidades.</p><div className="official-stats"><span><b>${int(official.items.length)}</b> acompanhamentos</span><span><b>${int(sum(official.items, item => item.pagamentos.length))}</b> movimentos</span><span><b>${int(sheets.length)}</b> abas processadas</span></div>${official.warnings.length ? html`<div className="official-warning"><${Icon} name="triangle-alert"/>${official.warnings.join(' · ')}</div>` : html`<div className="official-ok"><${Icon} name="shield-check"/>Totais das abas conferidos.</div>`}</div></div>` : html`<div className="mapping-panel"><div className="mapping-head"><div><span className="eyebrow">Correspondência das colunas</span><h3>Confirme o que cada coluna significa</h3><p>As sugestões já foram preenchidas. Ajuste somente o que precisar.</p></div><span className="mapping-score"><b>${Object.keys(mapping).length}</b> campos reconhecidos</span></div><div className="mapping-grid">${IMPORT_FIELDS.map(([field, label]) => html`<label><span>${label}</span><div><${Icon} name="arrow-left-right"/><select value=${mapping[field] ?? ''} onChange=${event => setMapping(current => ({ ...current, [field]:event.target.value }))}><option value="">Não importar</option>${headers.map(header => html`<option value=${header.index}>${header.label}</option>`)}</select></div></label>`)}</div></div>`}
        <div className="import-preview"><div className="mapping-head"><div><span className="eyebrow">Prévia normalizada</span><h3>É assim que os primeiros registros entrarão</h3></div></div><div className="preview-table-wrap"><table><thead><tr><th>Fornecedor</th><th>Acompanhamento</th><th>Categoria</th><th>Valor</th><th>Tipo / método</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>${preview.map(item => html`<tr><td><strong>${item.registro.fornecedor || '—'}</strong></td><td>${item.registro.titulo}</td><td>${category(item.registro.categoria).label}</td><td>${money(item.registro.valor_acordado)}</td><td><span className=${`method-pill ${receiptMethodKey(item.pagamentos[0]?.forma_pagamento)}`}>${item.pagamentos[0]?.forma_pagamento || 'Não informado'}</span></td><td>${item.pagamentos[0]?.vencimento ? date(item.pagamentos[0].vencimento) : '—'}</td><td><span className=${`status-pill ${item.registro.status}`}><i></i>${RECORD_STATUS[item.registro.status]?.label}</span></td></tr>`)}</tbody></table></div></div>
        ${result && html`<div className="import-result"><span><${Icon} name="party-popper" size=${30}/></span><div><strong>Importação concluída</strong><p><b>${result.criadas}</b> novos, <b>${result.atualizadas}</b> atualizados, <b>${result.arquivadas || 0}</b> arquivados e <b>${result.ignoradas}</b> ignorados.</p>${result.erros?.length ? html`<small>${result.erros.length} linha(s) precisam de revisão.</small>` : html`<small>Todos os dados válidos foram processados.</small>`}</div><button className="button secondary" onClick=${() => context.setView('registros')}>Ver acompanhamentos <${Icon} name="arrow-right"/></button></div>`}
        <div className="import-footer"><div><${Icon} name="info"/><p>Nos modelos oficiais, itens alterados são atualizados e os que saíram da planilha são arquivados com histórico. Importações livres nunca removem registros.</p></div><button className="button primary large" onClick=${runImport} disabled=${importing || !rows.length}>${importing ? html`<span className="spinner"></span>` : html`<${Icon} name="database-zap"/>`}${importing ? 'Processando planilha...' : `Importar ${int(rows.length)} linhas`}</button></div>
        </div>`}
      <div className="import-history"><div className="panel-heading compact"><div><span className="eyebrow">Rastreabilidade</span><h2>Importações recentes</h2></div></div>${context.imports.length ? context.imports.slice(0, 5).map(item => html`<div className="import-history-row"><span><${Icon} name="file-check-2"/></span><div><strong>${item.nome_arquivo}</strong><small>${item.controle === 'marcos' ? 'Planejamento e metas' : 'Recebimentos e fornecedores'} · ${item.ano_referencia || 'Vários anos'} · ${dateTime(item.criado_em)}</small></div><b>${int(item.linhas_criadas + item.linhas_atualizadas)} processados</b></div>`) : html`<${MiniEmpty} icon="history" title="Nenhuma importação registrada" text="O histórico dos arquivos enviados aparecerá aqui."/>`}</div></section>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    React.createElement(CentralErrorBoundary, null, React.createElement(App))
  );
})();
