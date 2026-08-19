/* PMG Connect — Central de Acompanhamento V1 / React + HTM */
(() => {
  'use strict';

  const { useCallback, useEffect, useMemo, useRef, useState } = React;
  const html = htm.bind(React.createElement);
  const DEMO_MODE = new URLSearchParams(location.search).get('demo') === '1';

  const VIEWS = {
    dashboard: { label: 'Visão geral', eyebrow: 'Central de Acompanhamento', icon: 'layout-dashboard' },
    registros: { label: 'Acompanhamentos', eyebrow: 'Operação completa', icon: 'rows-3' },
    financeiro: { label: 'Financeiro', eyebrow: 'Previsão e pagamentos', icon: 'wallet-cards' },
    fornecedores: { label: 'Parceiros', eyebrow: 'Mapa de fornecedores', icon: 'building-2' },
    importar: { label: 'Importar planilhas', eyebrow: 'Migração inteligente', icon: 'file-spreadsheet' },
  };

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

  const FINANCE_STATUS = {
    sem_pagamentos: 'Sem parcelas', pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago', atrasado: 'Atrasado', cancelado: 'Cancelado'
  };

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
  const safeFileName = value => normalize(value).replace(/\s+/g, '-').slice(0, 80) || 'arquivo';
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const isOverdue = payment => payment.status !== 'pago' && payment.status !== 'cancelado' && payment.vencimento && payment.vencimento < todayKey();
  const category = value => CATEGORIES[value] || { label: value || 'Outro', icon: 'shapes', tone: 'slate' };
  const uniq = values => [...new Set(values.filter(Boolean))];
  const sum = (rows, getter) => rows.reduce((total, item) => total + Number(getter(item) || 0), 0);

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
    return {
      records, payments, collaborators:[{ id:'c1', nome:'Giovanni', role:'colaborador' }, { id:'c2', nome:'Edilson', role:'gestor' }],
      attachments:[], imports:[], activities:records.slice(0, 6).map((record, i) => ({ id:i + 1, registro_id:record.id, ator_id:i % 2 ? 'c2' : 'c1', tipo:i % 3 === 0 ? 'pagamento_editado' : 'editado', resumo:i % 3 === 0 ? 'atualizou uma previsão de pagamento' : 'atualizou o acompanhamento', criado_em:record.atualizado_em }))
    };
  }

  async function fetchAll(db) {
    const queries = await Promise.all([
      db.from('acompanhamento_painel').select('*').order('atualizado_em', { ascending:false }).limit(5000),
      db.from('acompanhamento_pagamentos').select('*').order('vencimento', { ascending:true }).limit(10000),
      db.from('colaboradores').select('id,nome,foto_url,cargo,role,ativo').eq('ativo', true).order('nome'),
      db.from('acompanhamento_anexos').select('*').order('criado_em', { ascending:false }).limit(5000),
      db.from('acompanhamento_atividades').select('*').order('criado_em', { ascending:false }).limit(300),
      db.from('acompanhamento_importacoes').select('*').order('criado_em', { ascending:false }).limit(30),
    ]);
    const failed = queries.find(result => result.error);
    if (failed) throw failed.error;
    return {
      records:queries[0].data || [], payments:queries[1].data || [], collaborators:queries[2].data || [],
      attachments:queries[3].data || [], activities:queries[4].data || [], imports:queries[5].data || []
    };
  }

  function isMissingSetupError(fetchError) {
    const details = [fetchError?.message, fetchError?.details, fetchError?.hint, fetchError?.code, fetchError?.status]
      .filter(Boolean).join(' ');
    return /acompanhamento_|does not exist|schema cache|could not find|not found|PGRST205|42P01|404/i.test(details);
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
    const [data, setData] = useState({ records:[], payments:[], collaborators:[], attachments:[], activities:[], imports:[] });
    const [control, setControl] = useState('todos');
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
        if (missing) setData({ records:[], payments:[], collaborators:[], attachments:[], activities:[], imports:[] });
        setSetupMissing(missing);
        setError(fetchError);
      } finally { if (!quiet) setLoading(false); }
    }, [client]);

    useEffect(() => {
      let alive = true;
      (async () => {
        try {
          if (DEMO_MODE) {
            if (alive) { setMe({ nome:'Giovanni', role:'colaborador' }); setData(demoPayload()); setLoading(false); }
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
      subscriptionRef.current = client.channel('central-acompanhamento-live')
        .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_registros' }, () => void reload(true))
        .on('postgres_changes', { event:'*', schema:'public', table:'acompanhamento_pagamentos' }, () => void reload(true))
        .subscribe();
      return () => subscriptionRef.current?.unsubscribe?.();
    }, [client, reload]);

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
    const context = { ...data, records:filteredRecords, allRecords:data.records, activeControl:control, activeYear:year, setControl, setYear, client, me, reload, notify, saving, setSaving,
      openRecord:record => setSelectedId(record.id), editRecord:record => setRecordModal(record), newRecord:() => setRecordModal({ controle:control === 'todos' ? 'marketing' : control, ano_referencia:year === 'todos' ? new Date().getFullYear() : year }),
      newPayment:record => setPaymentModal({ registro_id:record?.id || selectedId }), editPayment:payment => setPaymentModal(payment), setView };

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

    if (loading) return html`<${BootScreen}/>`;
    if (setupMissing && !DEMO_MODE) return html`<div className="setup-screen"><${SetupState}/></div>`;
    if (error && !setupMissing && !DEMO_MODE) return html`<${FatalState} error=${error}/>`;

    return html`
      <div className="ac-app">
        <div className="ambient ambient-one"></div><div className="ambient ambient-two"></div>
        <${Sidebar} view=${view} setView=${setView} open=${mobileNav} setOpen=${setMobileNav} me=${me} records=${data.records}/>
        <div className="ac-main">
          <${Topbar} view=${view} search=${search} setSearch=${setSearch} setMobileNav=${setMobileNav} me=${me} context=${context} openCommand=${() => setCommandOpen(true)}/>
          <main className="ac-content">
            <${FilterBand} control=${control} setControl=${setControl} year=${year} setYear=${setYear} years=${years} count=${filteredRecords.length}/>
            ${setupMissing ? html`<${SetupState}/>` : html`
              <div className="view-stage" key=${view}>
                ${view === 'dashboard' && html`<${Dashboard} context=${context}/>`}
                ${view === 'registros' && html`<${RecordsView} context=${context}/>`}
                ${view === 'financeiro' && html`<${FinanceView} context=${context}/>`}
                ${view === 'fornecedores' && html`<${SuppliersView} context=${context}/>`}
                ${view === 'importar' && html`<${ImportView} context=${context} defaultControl=${control} defaultYear=${year}/>`}
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
    return html`<div className="boot-screen"><div className="boot-mark"><img src="/imagenssite/pmglogo.png" alt="PMG"/><span></span><span></span><span></span></div><strong>Montando sua visão financeira...</strong><small>Controle Marcos + Marketing</small></div>`;
  }

  function FatalState({ error }) {
    useLucide([]);
    return html`<div className="fatal-screen"><div className="fatal-card"><span className="fatal-icon"><${Icon} name="shield-alert" size=${34}/></span><p className="eyebrow">PMG Connect</p><h1>Não foi possível abrir a Central</h1><p>${error?.message || 'Falha de autenticação.'}</p><div className="fatal-actions"><a className="button primary" href="/central.html"><${Icon} name="arrow-left"/>Voltar ao início</a><button className="button secondary" onClick=${() => location.reload()}><${Icon} name="refresh-cw"/>Tentar novamente</button></div></div></div>`;
  }

  function SetupState() {
    useLucide([]);
    return html`<section className="setup-state"><div className="setup-orbit"><span></span><span></span><i><${Icon} name="database-zap" size=${32}/></i></div><div><p className="eyebrow">Uma etapa para ativar</p><h2>A interface está pronta. Falta criar a estrutura no banco.</h2><p>Execute <code>sql/06-CENTRAL-ACOMPANHAMENTO.sql</code> no SQL Editor do Supabase. Depois, carregue os dados pelos arquivos numerados da pasta <code>sql/carga-acompanhamento-sql-editor</code> ou pela tela Importar planilhas. A carga integral foi dividida para respeitar o limite do editor.</p><div className="setup-steps"><span><b>1</b>Executar o SQL 06</span><span><b>2</b>Carregar os lotes 07</span><span><b>3</b>Atualizar esta página</span></div><button className="button primary" onClick=${() => location.reload()}><${Icon} name="refresh-cw"/>Já executei, verificar agora</button></div></section>`;
  }

  function Sidebar({ view, setView, open, setOpen, me, records }) {
    const overdue = records.filter(record => record.situacao_financeira === 'atrasado').length;
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
            ${Object.entries(VIEWS).map(([key, item]) => html`<button key=${key} className=${`side-link ${view === key ? 'active' : ''}`} onClick=${() => navigate(key)}><span><${Icon} name=${item.icon}/></span><b>${item.label}</b>${key === 'financeiro' && overdue > 0 ? html`<em>${overdue}</em>` : null}</button>`)}
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
    return html`<header className="ac-topbar"><div className="topbar-title"><button className="icon-button mobile-only" onClick=${() => setMobileNav(true)}><${Icon} name="menu"/></button><span className="topbar-view-icon"><${Icon} name=${meta.icon}/></span><div><span>${meta.eyebrow}</span><h1>${meta.label}</h1></div></div><div className="topbar-actions"><button className="command-trigger" onClick=${openCommand}><${Icon} name="sparkles"/><span><small>Busca inteligente</small><b>Fornecedor, ação ou comando</b></span><kbd>Ctrl K</kbd></button><label className="global-search compact-search"><${Icon} name="search"/><input value=${search} onInput=${event => setSearch(event.target.value)} placeholder="Filtrar visão..."/></label><button className="button secondary import-shortcut" onClick=${() => context.setView('importar')}><${Icon} name="sheet"/>Importar</button><button className="button primary topbar-create" onClick=${context.newRecord}><${Icon} name="plus"/>Novo</button><div className="topbar-avatar" title=${me?.nome || ''}>${String(me?.nome || 'P').charAt(0)}</div></div></header>`;
  }

  function CommandPalette({ context, onClose }) {
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const input = useRef(null);
    const needle = normalize(query);
    const results = needle ? context.allRecords.filter(record => normalize([record.codigo, record.fornecedor, record.titulo, record.referencia, ...(record.tags || [])].join(' ')).includes(needle)).slice(0, 7) : [];
    const commands = [
      { label:'Abrir visão geral', detail:'Resumo executivo', icon:'layout-dashboard', action:() => context.setView('dashboard') },
      { label:'Novo acompanhamento', detail:'Cadastrar ação ou projeto', icon:'plus-circle', action:context.newRecord },
      { label:'Importar planilha', detail:'Atualizar os controles oficiais', icon:'file-up', action:() => context.setView('importar') },
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
    return html`<div className="command-overlay" onMouseDown=${event => event.target === event.currentTarget && onClose()}><section className="command-palette" role="dialog" aria-modal="true" aria-label="Busca inteligente"><div className="command-input"><span><${Icon} name="sparkles"/></span><input ref=${input} value=${query} onInput=${event => setQuery(event.target.value)} onKeyDown=${handleKeys} placeholder="Digite um fornecedor, ação ou comando..."/><kbd>ESC</kbd></div><div className="command-body">${needle ? html`<div className="command-group"><span className="command-label">Resultados</span>${results.length ? results.map((record, index) => html`<button className=${index === activeIndex ? 'active' : ''} onMouseEnter=${() => setActiveIndex(index)} onClick=${() => run(() => context.openRecord(record))}><span className=${`command-result-icon ${record.controle}`}><${Icon} name=${category(record.categoria).icon}/></span><div><strong>${record.fornecedor || record.titulo}</strong><small>#${record.codigo || '—'} · ${record.titulo}</small></div><em>${money(record.valor_acordado)}</em><${Icon} name="chevron-right"/></button>`) : html`<div className="command-empty"><${Icon} name="search-x"/><span>Nenhum acompanhamento encontrado.</span></div>`}</div>` : html`<div className="command-group"><span className="command-label">Ações rápidas</span>${commands.map((command, index) => html`<button className=${index === activeIndex ? 'active' : ''} onMouseEnter=${() => setActiveIndex(index)} onClick=${() => run(command.action)}><span className="command-result-icon"><${Icon} name=${command.icon}/></span><div><strong>${command.label}</strong><small>${command.detail}</small></div><span></span><${Icon} name="arrow-up-right"/></button>`)}</div>`}</div><footer><span><b>↑↓</b> navegar</span><span><b>Enter</b> abrir</span><span>PMG Command Center</span></footer></section></div>`;
  }

  function FilterBand({ control, setControl, year, setYear, years, count }) {
    useLucide([control, year]);
    return html`<div className="filter-band"><div className="segmented" role="group" aria-label="Controle"><button className=${control === 'todos' ? 'active' : ''} onClick=${() => setControl('todos')}>Consolidado</button><button className=${control === 'marcos' ? 'active' : ''} onClick=${() => setControl('marcos')}><span className="control-dot marcos"></span>Marcos</button><button className=${control === 'marketing' ? 'active' : ''} onClick=${() => setControl('marketing')}><span className="control-dot marketing"></span>Marketing</button></div><div className="filter-right"><span className="result-count"><b>${int(count)}</b> registros na visão</span><label className="year-select"><${Icon} name="calendar-range"/><select value=${year} onChange=${event => setYear(event.target.value)}><option value="todos">Todos os anos</option>${years.map(item => html`<option key=${item} value=${item}>${item}</option>`)}</select></label></div></div>`;
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
    const indicator = tag => indicators.find(item => (item.tags || []).includes(tag))?.valor_acordado;
    const marcosRevenue = sum(impactRecords.filter(item => item.controle === 'marcos' && item.natureza === 'receita' && item.categoria !== 'pendencia'), item => item.valor_acordado);
    const marcosExpenses = sum(impactRecords.filter(item => item.controle === 'marcos' && item.natureza === 'despesa'), item => item.valor_acordado);
    const marketingRealized = sum(impactRecords.filter(item => item.controle === 'marketing' && item.natureza === 'receita'), item => item.total_pago || 0);
    const fallbackRevenue = sum(impactRecords.filter(item => item.natureza === 'receita' && item.categoria !== 'pendencia'), item => item.valor_acordado);
    const fallbackExpenses = sum(impactRecords.filter(item => item.natureza === 'despesa'), item => item.valor_acordado);
    const forecastRevenue = Number(indicator('receita')) || marcosRevenue || fallbackRevenue;
    const forecastExpenses = Number(indicator('investimento')) || marcosExpenses || fallbackExpenses;
    const forecastBalance = Number(indicator('saldo')) || Math.max(0, forecastRevenue - forecastExpenses);
    const realized = marketingRealized || sum(impactRecords.filter(item => item.natureza === 'receita'), item => item.total_pago || 0);
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
    const focusText = overduePayments.length ? 'Os vencimentos críticos já estão organizados no radar ao lado.' : 'Os controles Marcos e Marketing estão conciliados e sem atraso visível.';
    const attention = (overduePayments.length ? overduePayments : upcoming).slice(0, 5);
    useLucide([records.length, payments.length]);
    return html`
      <section className="dashboard-cockpit">
        <article className="cockpit-hero">
          <div className="hero-grid-lines"></div><span className="hero-orb hero-orb-one"></span><span className="hero-orb hero-orb-two"></span>
          <div className="hero-copy"><div className="hero-live"><i></i><span>Central sincronizada</span><b>${today}</b></div><p className="hero-kicker">${greeting}, ${firstName}</p><h2>${focusTitle}</h2><p>${focusText}</p><div className="hero-actions"><button className="button hero-primary" onClick=${newRecord}><${Icon} name="plus"/>Novo acompanhamento</button><button className="button hero-secondary" onClick=${() => context.setView('importar')}><${Icon} name="file-up"/>Atualizar planilhas</button></div></div>
          <div className="hero-health-wrap"><div className="hero-health" style=${{ '--health':`${health * 3.6}deg` }}><div><span>Índice operacional</span><strong>${health}</strong><small>/100</small></div></div><p>${health >= 85 ? 'Fluxo saudável' : health >= 65 ? 'Atenção moderada' : 'Revisão recomendada'}</p></div>
          <div className="hero-controls"><button className="hero-control-card marcos" onClick=${() => context.setControl('marcos')}><span><i></i>Controle Marcos</span><strong>${compactMoney(forecastRevenue)}</strong><small>Receita prevista <${Icon} name="arrow-up-right"/></small></button><button className="hero-control-card marketing" onClick=${() => context.setControl('marketing')}><span><i></i>Controle Marketing</span><strong>${compactMoney(realized)}</strong><small>Realizado com fornecedores <${Icon} name="arrow-up-right"/></small></button></div>
        </article>

        <div className="signal-grid">
          <${InsightTile} icon="triangle-alert" value=${int(overduePayments.length)} label="Vencimentos críticos" detail=${overduePayments.length ? 'Priorize estes movimentos' : 'Nenhum atraso visível'} tone=${overduePayments.length ? 'danger' : 'forest'} action=${() => context.setView('financeiro')}/>
          <${InsightTile} icon="orbit" value=${int(openProjects.length)} label="Ações em movimento" detail="Projetos ainda não concluídos" tone="violet" action=${() => context.setView('registros')}/>
          <${InsightTile} icon="calendar-clock" value=${int(upcoming.length)} label="Próximos compromissos" detail="Agenda financeira visível" tone="gold" action=${() => context.setView('financeiro')}/>
          <${InsightTile} icon="activity" value=${`${completion}%`} label="Índice de conclusão" detail=${`${finishedProjects} projetos concluídos`} tone="forest" action=${() => context.setView('registros')}/>
        </div>

        <div className="metric-grid financial-metrics">
          <${MetricCard} label="Receita prevista" value=${forecastRevenue} icon="trending-up" tone="emerald" hint="Controle Marcos"/>
          <${MetricCard} label="Realizado com fornecedores" value=${realized} icon="badge-check" tone="gold" hint="Controle Marketing"/>
          <${MetricCard} label="Investimento previsto" value=${forecastExpenses} icon="trending-down" tone="violet" hint="Planejamento anual"/>
          <${MetricCard} label="Saldo projetado" value=${forecastBalance} icon="landmark" tone=${overduePayments.length ? 'danger' : 'emerald'} hint=${overduePayments.length ? `${overduePayments.length} pendência(s) vencida(s)` : 'Receita menos investimento'} pulse=${overduePayments.length > 0}/>
        </div>

        <div className="dashboard-bento">
          <article className="panel chart-panel cashflow-panel bento-flow"><div className="panel-heading"><div><span className="eyebrow">Pulso financeiro</span><h2>Marcos x Marketing ao longo do ano</h2><p>Movimento mensal dos controles dentro da visão atual.</p></div><span className="live-chip"><i></i>Dados vivos</span></div><${CashflowChart} payments=${payments} records=${records}/></article>

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

  function SuppliersView({ context }) {
    const { records, openRecord } = context;
    const suppliers = useMemo(() => {
      const map = new Map(); records.forEach(record => { const name = record.fornecedor || 'Sem fornecedor'; const current = map.get(name) || { name, records:[], value:0, paid:0, overdue:0, controls:new Set(), categories:new Set() }; current.records.push(record); if (record.impacta_totais !== false && record.natureza !== 'indicador') { current.value += Number(record.valor_acordado || 0); current.paid += Number(record.total_pago || 0); } current.overdue += Number(record.pagamentos_atrasados || 0); current.controls.add(record.controle); current.categories.add(record.categoria); map.set(name, current); });
      return [...map.values()].sort((a, b) => b.value - a.value);
    }, [records]);
    useLucide([suppliers.length]);
    return html`<section className="suppliers-section"><div className="view-tools"><div className="view-tools-copy"><span className="eyebrow">Relacionamento comercial</span><h2>Mapa de parceiros</h2><p>Visão consolidada de tudo o que existe com cada fornecedor.</p></div><div className="supplier-summary"><span><b>${int(suppliers.length)}</b> parceiros</span><span><b>${money(sum(suppliers, item => item.value))}</b> acompanhados</span></div></div><div className="supplier-grid">${suppliers.map((supplier, index) => { const progress = supplier.value ? Math.min(100, supplier.paid / supplier.value * 100) : 0; return html`<article key=${supplier.name} className="supplier-card" style=${{ '--delay':`${Math.min(index, 12) * 45}ms` }}><div className="supplier-card-head"><span className="supplier-initial">${supplier.name.charAt(0)}</span><div><h3>${supplier.name}</h3><p>${int(supplier.records.length)} acompanhamentos · ${int(supplier.categories.size)} categorias</p></div>${supplier.overdue ? html`<span className="supplier-alert"><${Icon} name="triangle-alert"/>${supplier.overdue}</span>` : html`<span className="supplier-ok"><${Icon} name="check"/></span>`}</div><div className="supplier-money"><span><small>Valor total</small><strong>${money(supplier.value)}</strong></span><span><small>Realizado</small><strong>${money(supplier.paid)}</strong></span></div><div className="supplier-progress"><i style=${{ width:`${progress}%` }}></i></div><div className="supplier-tags">${[...supplier.categories].slice(0, 3).map(key => html`<span>${category(key).label}</span>`)}</div><button onClick=${() => openRecord(supplier.records[0])}>Abrir histórico <${Icon} name="arrow-right"/></button><div className="card-glow"></div></article>`; })}</div></section>`;
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
      <${Field} label="Centro de custo"><input name="centro_custo" defaultValue=${record.centro_custo || ''} placeholder="Opcional"/></${Field}>
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

    return html`<div className="drawer-shell"><button className="drawer-backdrop" onClick=${onClose} aria-label="Fechar detalhes"></button><aside className="record-drawer"><header className="drawer-head"><div className="drawer-head-actions"><span className=${`control-pill ${record.controle}`}><i></i>${record.controle === 'marcos' ? 'Controle Marcos' : 'Controle Marketing'}</span><button className="icon-button" onClick=${onClose}><${Icon} name="x"/></button></div><div className="drawer-identity"><span className=${`category-mark large ${meta.tone}`}><${Icon} name=${meta.icon} size=${24}/></span><div><small>#${record.codigo || '—'} · ${record.ano_referencia} · ${meta.label}</small><h2>${record.fornecedor || record.titulo}</h2><p>${record.fornecedor ? record.titulo : record.referencia || ''}</p></div></div><div className="drawer-status-row"><span className=${`status-pill ${record.status}`}><i></i>${RECORD_STATUS[record.status]?.label || record.status}</span><span className=${`nature-pill ${nature.tone}`}><${Icon} name=${nature.icon}/>${nature.label}</span><span className=${`finance-label ${record.situacao_financeira}`}>${FINANCE_STATUS[record.situacao_financeira] || record.situacao_financeira}</span>${record.impacta_totais === false && html`<span className="detail-pill"><${Icon} name="layers-2"/>Detalhamento</span>`}${record.prioridade === 'urgente' && html`<span className="priority-urgent"><${Icon} name="siren"/>Urgente</span>`}</div></header>
      <nav className="drawer-tabs">${[['resumo','Visão geral'],['pagamentos','Pagamentos'],['documentos','Documentos'],['historico','Histórico']].map(([key, label]) => html`<button className=${tab === key ? 'active' : ''} onClick=${() => setTab(key)}>${label}${key === 'pagamentos' && html`<b>${payments.length}</b>`}${key === 'documentos' && attachments.length ? html`<b>${attachments.length}</b>` : null}</button>`)}</nav>
      <div className="drawer-content">
        ${tab === 'resumo' && html`<div className="drawer-section-stack"><section className="drawer-money-card"><div><small>Valor acompanhado</small><strong>${money(record.valor_acordado)}</strong></div><div className="drawer-money-split"><span><small>Realizado</small><b>${money(record.total_pago)}</b></span><span><small>Saldo futuro</small><b>${money(record.saldo_aberto)}</b></span></div><div className="drawer-progress-label"><span>Execução financeira</span><b>${Math.round(progress)}%</b></div><div className="drawer-progress"><i style=${{ width:`${progress}%` }}></i></div></section><section className="drawer-info-grid"><div><span><${Icon} name="calendar-range"/>Período</span><strong>${record.data_inicio ? date(record.data_inicio) : 'Não definido'} → ${record.data_fim ? date(record.data_fim) : 'aberto'}</strong></div><div><span><${Icon} name="user-round"/>Responsável</span><strong>${collaboratorMap[record.responsavel_id]?.nome || 'Não atribuído'}</strong></div><div><span><${Icon} name="crosshair"/>Referência</span><strong>${record.referencia || 'Não informada'}</strong></div><div><span><${Icon} name="file-text"/>Documento</span><strong>${record.numero_documento || 'Não informado'}</strong></div></section>${record.descricao && html`<section className="drawer-text"><span className="eyebrow">Descrição</span><p>${record.descricao}</p></section>`}${record.observacoes && html`<section className="drawer-note"><${Icon} name="sticky-note"/><div><strong>Observações internas</strong><p>${record.observacoes}</p></div></section>`}<div className="drawer-actions"><button className="button primary" onClick=${() => context.editRecord(record)}><${Icon} name="pencil"/>Editar acompanhamento</button><button className="button secondary" onClick=${() => context.newPayment(record)}><${Icon} name="receipt-text"/>Adicionar parcela</button><button className="button danger-ghost" onClick=${archiveRecord}><${Icon} name="archive"/>Arquivar</button></div></div>`}
        ${tab === 'pagamentos' && html`<div className="drawer-section-stack"><div className="drawer-section-heading"><div><span className="eyebrow">Cronograma financeiro</span><h3>${payments.length ? `${payments.length} lançamento(s)` : 'Sem parcelas'}</h3></div><button className="button primary small" onClick=${() => context.newPayment(record)}><${Icon} name="plus"/>Adicionar</button></div>${payments.length ? payments.map(payment => html`<article className=${`drawer-payment ${isOverdue(payment) ? 'overdue' : ''}`}><span className=${`payment-check ${payment.status}`}><${Icon} name=${payment.status === 'pago' ? 'check' : isOverdue(payment) ? 'triangle-alert' : 'clock-3'}/></span><div><strong>${payment.descricao || `Parcela ${payment.parcela}`}</strong><p>${payment.vencimento ? `Vence ${date(payment.vencimento)}` : 'Sem vencimento'} · ${payment.forma_pagamento || 'Forma a definir'}</p></div><span><strong>${money(payment.valor_previsto)}</strong><small>${isOverdue(payment) ? 'Atrasado' : PAYMENT_STATUS[payment.status]?.label}</small></span><div className="drawer-payment-actions">${payment.status !== 'pago' && html`<button title="Marcar como pago" onClick=${() => quickPaid(payment)}><${Icon} name="check"/></button>`}<button title="Editar" onClick=${() => context.editPayment(payment)}><${Icon} name="pencil"/></button></div></article>`) : html`<${MiniEmpty} icon="receipt-text" title="Nenhum pagamento cadastrado" text="Crie parcelas, datas e formas de pagamento para controlar o fluxo futuro." action=${() => context.newPayment(record)}/>`}</div>`}
        ${tab === 'documentos' && html`<div className="drawer-section-stack"><div className="dropzone" onClick=${() => fileRef.current?.click()}><input ref=${fileRef} type="file" multiple hidden onChange=${uploadFiles}/><span><${Icon} name=${uploading ? 'loader-circle' : 'cloud-upload'} size=${28}/></span><h3>${uploading ? 'Enviando arquivos...' : 'Anexar documentos'}</h3><p>Contratos, notas fiscais, boletos, propostas ou comprovantes · até 15 MB</p><button className="button secondary small" type="button">Selecionar arquivos</button></div><div className="attachment-list">${attachments.map(item => html`<button className="attachment-row" onClick=${() => openAttachment(item)}><span><${Icon} name=${item.mime_type?.includes('pdf') ? 'file-text' : item.mime_type?.includes('image') ? 'image' : 'paperclip'}/></span><div><strong>${item.nome}</strong><small>${item.tipo?.replace('_', ' ')} · ${item.tamanho_bytes ? `${Math.round(item.tamanho_bytes / 1024)} KB` : ''}</small></div><${Icon} name="external-link"/></button>`)}</div></div>`}
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
        const supplier = officialSupplierName(supplierRaw); const document = String(row[3] ?? '').trim(); const highlighted = officialMoney(row[4]);
        const recordFingerprint = fingerprint(['marketing', 'fornecedores', year, sheetName, line, supplier, categoryRaw]);
        calculated += value;
        items.push(officialItem({
          controle:'marketing', ano_referencia:year, fornecedor:supplier, natureza:'receita', impacta_totais:true,
          categoria:inferCategory(categoryRaw), titulo:`${categoryRaw.replace(/\s+/g, ' ').trim()} — ${supplier} — ${monthLabel} ${year}`,
          descricao:`Verba mensal de fornecedor registrada pelo Marketing.${highlighted > 0 ? ` A fonte destaca ${money(highlighted)} para a ação específica indicada na coluna VALOR.` : ''}`,
          referencia:categoryRaw, status:'concluido', data_inicio:officialMonthStart(year, monthIndex), data_fim:officialMonthEnd(year, monthIndex),
          valor_acordado:value, numero_documento:document, tags:['marketing', 'fornecedores', String(year), monthLabel.toLocaleLowerCase('pt-BR'), ...officialTags(categoryRaw)],
          observacoes:highlighted > 0 ? `Valor específico destacado na planilha: ${money(highlighted)}.` : '', origem_importacao:canonicalFile, linha_origem:line,
          fingerprint:recordFingerprint, dados_originais:{ arquivo:canonicalFile, aba:sheetName, linha:line, campanha:categoryRaw, fornecedor_original:supplierRaw, verba:value, nf:document, valor_especifico:highlighted || null },
        }, [{
          parcela:1, descricao:`Competência ${monthLabel} ${year}`, valor_previsto:value, valor_pago:value,
          vencimento:officialMonthEnd(year, monthIndex), pago_em:officialMonthEnd(year, monthIndex), status:'pago', forma_pagamento:officialMethod(document),
          favorecido:supplier, numero_documento:document, observacoes:'A fonte informa apenas a competência mensal; a data exata do movimento não foi registrada.',
          fingerprint:fingerprint([recordFingerprint, 'competencia', year, monthIndex + 1]),
        }]));
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
    const planningRows = XLSX.utils.sheet_to_json(workbook.Sheets.Planejamento, { header:1, defval:null, raw:true, blankrows:false });
    for (let columnIndex = 1; columnIndex <= 15; columnIndex += 1) {
      const header = String(planningRows[1]?.[columnIndex] ?? '').trim(); if (!header) continue;
      const monthly = Array.from({ length:12 }, (_, index) => officialMoney(planningRows[2 + index]?.[columnIndex]));
      const total = sum(monthly, value => value); if (total <= 0) continue;
      const recordFingerprint = fingerprint(['marcos', 'planejamento', 2026, header]);
      items.push(officialItem({
        controle:'marcos', ano_referencia:2026, natureza:'despesa', impacta_totais:true, categoria:planningCategory(header), titulo:`Planejamento 2026 — ${header}`,
        descricao:'Planejamento anual de investimento do Marketing acompanhado pela Presidência.', referencia:header, status:'em_andamento',
        data_inicio:'2026-01-01', data_fim:'2026-12-31', valor_acordado:total, centro_custo:'Marketing', tags:['marcos', 'planejamento', 'despesa', '2026', normalize(header)],
        origem_importacao:canonicalFile, linha_origem:2, fingerprint:recordFingerprint,
        dados_originais:{ arquivo:canonicalFile, aba:'Planejamento', coluna:XLSX.utils.encode_col(columnIndex), categoria_original:header, valores_mensais:monthly },
      }, monthly.map((value, monthIndex) => ({ value, monthIndex })).filter(item => item.value > 0).map(({ value, monthIndex }, index) => {
        const past = new Date(2026, monthIndex + 1, 0) < new Date();
        return { parcela:index + 1, descricao:`${header} — ${OFFICIAL_MONTHS[monthIndex][1]} 2026`, valor_previsto:value, valor_pago:past ? value : 0,
          vencimento:officialMonthEnd(2026, monthIndex), pago_em:past ? officialMonthEnd(2026, monthIndex) : '', status:past ? 'pago' : 'previsto',
          forma_pagamento:'Não informado', observacoes:past ? 'Competência anterior à carga; tratada como realizada para composição do planejamento.' : 'Competência futura prevista no planejamento.',
          fingerprint:fingerprint([recordFingerprint, 'planejamento', monthIndex + 1]) };
      })));
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
        const buffer = await nextFile.arrayBuffer(); const workbook = XLSX.read(buffer, { type:'array', cellDates:true });
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
      ${!file ? html`<div className=${`import-drop ${dragging ? 'dragging' : ''}`} onDragOver=${event => { event.preventDefault(); setDragging(true); }} onDragLeave=${() => setDragging(false)} onDrop=${event => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files[0]); }} onClick=${() => inputRef.current?.click()}><input ref=${inputRef} hidden type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange=${event => loadFile(event.target.files[0])}/><div className="import-drop-art"><span><${Icon} name="file-spreadsheet" size=${40}/></span><i></i><i></i><i></i></div><h3>Solte sua planilha aqui</h3><p>Excel ou CSV · controles de 2024, 2025, 2026 e futuras atualizações</p><button className="button primary"><${Icon} name="folder-open"/>Escolher arquivo</button></div>` : html`<div className="import-workspace"><div className="import-file-bar"><span className="file-badge"><${Icon} name="file-spreadsheet"/></span><div><strong>${file.name}</strong><small>${int(rows.length)} registros reconhecidos · ${sheets.length} aba(s)</small></div><label><span>Leitura</span>${official ? html`<select disabled><option>Todas as abas</option></select>` : html`<select value=${sheet} onChange=${event => readSheet(event.target.value)}>${sheets.map(name => html`<option value=${name}>${name}</option>`)}</select>`}</label><label><span>Destino</span><select value=${control} disabled=${Boolean(official)} onChange=${event => setControl(event.target.value)}><option value="marketing">Marketing / Fornecedores</option><option value="marcos">Marcos / Presidência</option></select></label><label><span>Ano</span><input type="number" value=${year} disabled=${Boolean(official)} min="2000" max="2200" onInput=${event => setYear(Number(event.target.value))}/></label><button className="icon-button" title="Trocar arquivo" onClick=${() => { setFile(null); setRows([]); setOfficial(null); setResult(null); workbookRef.current = null; }}><${Icon} name="x"/></button></div>
        ${official ? html`<div className="mapping-panel official-detection"><div className="official-detection-icon"><${Icon} name="badge-check" size=${25}/></div><div><span className="eyebrow">Modelo oficial reconhecido</span><h3>${official.label}</h3><p>A Central leu todas as abas, retirou cabeçalhos e totais, ignorou marcadores de R$ 1,00 e preparou uma atualização sem duplicidades.</p><div className="official-stats"><span><b>${int(official.items.length)}</b> acompanhamentos</span><span><b>${int(sum(official.items, item => item.pagamentos.length))}</b> movimentos</span><span><b>${int(sheets.length)}</b> abas processadas</span></div>${official.warnings.length ? html`<div className="official-warning"><${Icon} name="triangle-alert"/>${official.warnings.join(' · ')}</div>` : html`<div className="official-ok"><${Icon} name="shield-check"/>Totais das abas conferidos.</div>`}</div></div>` : html`<div className="mapping-panel"><div className="mapping-head"><div><span className="eyebrow">Correspondência das colunas</span><h3>Confirme o que cada coluna significa</h3><p>As sugestões já foram preenchidas. Ajuste somente o que precisar.</p></div><span className="mapping-score"><b>${Object.keys(mapping).length}</b> campos reconhecidos</span></div><div className="mapping-grid">${IMPORT_FIELDS.map(([field, label]) => html`<label><span>${label}</span><div><${Icon} name="arrow-left-right"/><select value=${mapping[field] ?? ''} onChange=${event => setMapping(current => ({ ...current, [field]:event.target.value }))}><option value="">Não importar</option>${headers.map(header => html`<option value=${header.index}>${header.label}</option>`)}</select></div></label>`)}</div></div>`}
        <div className="import-preview"><div className="mapping-head"><div><span className="eyebrow">Prévia normalizada</span><h3>É assim que os primeiros registros entrarão</h3></div></div><div className="preview-table-wrap"><table><thead><tr><th>Fornecedor</th><th>Acompanhamento</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>${preview.map(item => html`<tr><td><strong>${item.registro.fornecedor || '—'}</strong></td><td>${item.registro.titulo}</td><td>${category(item.registro.categoria).label}</td><td>${money(item.registro.valor_acordado)}</td><td>${item.pagamentos[0]?.vencimento ? date(item.pagamentos[0].vencimento) : '—'}</td><td><span className=${`status-pill ${item.registro.status}`}><i></i>${RECORD_STATUS[item.registro.status]?.label}</span></td></tr>`)}</tbody></table></div></div>
        ${result && html`<div className="import-result"><span><${Icon} name="party-popper" size=${30}/></span><div><strong>Importação concluída</strong><p><b>${result.criadas}</b> novos, <b>${result.atualizadas}</b> atualizados, <b>${result.arquivadas || 0}</b> arquivados e <b>${result.ignoradas}</b> ignorados.</p>${result.erros?.length ? html`<small>${result.erros.length} linha(s) precisam de revisão.</small>` : html`<small>Todos os dados válidos foram processados.</small>`}</div><button className="button secondary" onClick=${() => context.setView('registros')}>Ver acompanhamentos <${Icon} name="arrow-right"/></button></div>`}
        <div className="import-footer"><div><${Icon} name="info"/><p>Nos modelos oficiais, itens alterados são atualizados e os que saíram da planilha são arquivados com histórico. Importações livres nunca removem registros.</p></div><button className="button primary large" onClick=${runImport} disabled=${importing || !rows.length}>${importing ? html`<span className="spinner"></span>` : html`<${Icon} name="database-zap"/>`}${importing ? 'Processando planilha...' : `Importar ${int(rows.length)} linhas`}</button></div>
        </div>`}
      <div className="import-history"><div className="panel-heading compact"><div><span className="eyebrow">Rastreabilidade</span><h2>Importações recentes</h2></div></div>${context.imports.length ? context.imports.slice(0, 5).map(item => html`<div className="import-history-row"><span><${Icon} name="file-check-2"/></span><div><strong>${item.nome_arquivo}</strong><small>${item.controle === 'marcos' ? 'Marcos' : 'Marketing'} · ${item.ano_referencia || 'Vários anos'} · ${dateTime(item.criado_em)}</small></div><b>${int(item.linhas_criadas + item.linhas_atualizadas)} processados</b></div>`) : html`<${MiniEmpty} icon="history" title="Nenhuma importação registrada" text="O histórico dos arquivos enviados aparecerá aqui."/>`}</div></section>`;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(html`<${App}/>`);
})();
