const TIMEZONE = 'America/Sao_Paulo';
const DAY_MS = 86400000;

export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:TIMEZONE,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function parseDateOnly(value) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysBetween(from, to) {
  const a = parseDateOnly(typeof from === 'string' ? from : dateKey(from));
  const b = parseDateOnly(typeof to === 'string' ? to : dateKey(to));
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

function taskDueKey(task) {
  return String(task?.prazo_em || task?.prazo || '').slice(0, 10);
}

function taskIsPaused(task) {
  return task?.status === 'revisao';
}

export function isTaskOverdue(task, today = dateKey()) {
  if (!task || task.arquivada_em || task.status === 'concluida' || taskIsPaused(task)) return false;
  const due = taskDueKey(task);
  return Boolean(due && due < today);
}

export function campaignState(campaign, today = dateKey()) {
  const start = String(campaign?.start || campaign?.dataInicio || '').slice(0, 10);
  const end = String(campaign?.end || campaign?.dataFim || '').slice(0, 10);
  if (!start || !end) return { id:'unknown', label:'Sem período' };
  if (today < start) return { id:'scheduled', label:'Agendada' };
  if (today > end) return { id:'closed', label:'Encerrada' };
  return { id:'active', label:'Ativa' };
}

export function snapshotFreshness(snapshot, today = dateKey()) {
  if (!snapshot || snapshot.unavailable) {
    return { level:'warning', label:'Bridge indisponível', detail:'Os dados comerciais locais não puderam ser consultados.' };
  }
  if (!snapshot.ready) {
    if (snapshot.syncing) return { level:'info', label:'Sincronizando', detail:snapshot.message || 'O snapshot comercial está sendo preparado.' };
    return { level:'warning', label:'Snapshot pendente', detail:snapshot.message || 'Ainda não existe snapshot comercial disponível.' };
  }
  if (snapshot.day !== today || snapshot.stale) {
    return { level:'warning', label:'Dados desatualizados', detail:`Último snapshot: ${snapshot.day || 'data desconhecida'}.` };
  }
  return { level:'ok', label:'Dados comerciais atualizados', detail:snapshot.updatedAt || snapshot.day || today };
}

function executorMap(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.tarefa_id)) map.set(row.tarefa_id, new Set());
    if (row.colaborador_id) map.get(row.tarefa_id).add(row.colaborador_id);
  }
  return map;
}

function taskAssignedTo(task, personId, byTask) {
  if (!personId || !task) return false;
  if (task.responsavel_id === personId) return true;
  return byTask.get(task.id)?.has(personId) || false;
}

function pushUnique(list, seen, alert) {
  if (!alert?.id || seen.has(alert.id)) return;
  seen.add(alert.id);
  list.push(alert);
}

export function buildOperationalAlerts(input = {}) {
  const {
    now = new Date(), me = null, tasks = [], executors = [], payments = [], documents = [], suppliers = [], campaigns = [], snapshot = null,
  } = input;
  const today = dateKey(now);
  const byTask = executorMap(executors);
  const list = [];
  const seen = new Set();
  const isManager = me?.role === 'gestor';

  for (const task of tasks) {
    if (!task || task.arquivada_em || task.status === 'concluida') continue;
    const mine = taskAssignedTo(task, me?.id, byTask);
    if (isManager && task.status === 'revisao' && !['confirmacao_autoria'].includes(task.avaliacao_status)) {
      pushUnique(list, seen, {
        id:`task-review:${task.id}`, severity:'important', category:'Demandas', title:'Entrega aguardando validação',
        description:task.titulo || 'Demanda em revisão', href:`/demandas.html?tarefa=${encodeURIComponent(task.id)}`, action:'Revisar', date:task.atualizado_em || task.prazo,
      });
      continue;
    }
    if (!mine) continue;
    if (task.avaliacao_status === 'ajustes') {
      pushUnique(list, seen, {
        id:`task-adjust:${task.id}`, severity:'important', category:'Demandas', title:'Ajustes solicitados',
        description:task.titulo || 'Demanda devolvida para ajustes', href:`/demandas.html?tarefa=${encodeURIComponent(task.id)}`, action:'Abrir', date:task.atualizado_em,
      });
      continue;
    }
    if (task.prioridade === 'imediata') {
      pushUnique(list, seen, {
        id:`task-immediate:${task.id}`, severity:'critical', category:'Demandas', title:'Demanda imediata',
        description:task.titulo || 'Demanda imediata', href:`/demandas.html?tarefa=${encodeURIComponent(task.id)}`, action:'Resolver', date:task.prazo_em || task.prazo,
      });
      continue;
    }
    if (isTaskOverdue(task, today)) {
      pushUnique(list, seen, {
        id:`task-overdue:${task.id}`, severity:'critical', category:'Demandas', title:'Demanda atrasada',
        description:task.titulo || 'Demanda com prazo vencido', href:`/demandas.html?tarefa=${encodeURIComponent(task.id)}`, action:'Abrir', date:task.prazo_em || task.prazo,
      });
      continue;
    }
    if (taskDueKey(task) === today && !taskIsPaused(task)) {
      pushUnique(list, seen, {
        id:`task-today:${task.id}`, severity:'important', category:'Demandas', title:'Prazo hoje',
        description:task.titulo || 'Demanda com prazo hoje', href:`/demandas.html?tarefa=${encodeURIComponent(task.id)}`, action:'Abrir', date:task.prazo_em || task.prazo,
      });
    }
  }

  for (const payment of payments) {
    const due = String(payment?.vencimento || '').slice(0, 10);
    if (!due || ['pago', 'cancelado'].includes(payment.status)) continue;
    const delta = daysBetween(today, due);
    const record = payment.registro || {};
    const label = record.fornecedor || payment.favorecido || record.titulo || payment.descricao || 'Pagamento';
    if (delta !== null && delta < 0) {
      pushUnique(list, seen, {
        id:`payment-overdue:${payment.id}`, severity:'critical', category:'Financeiro', title:'Pagamento vencido',
        description:`${label} · ${due}`, href:`/acompanhamento.html?view=pagamentos&registro=${encodeURIComponent(payment.registro_id || '')}`,
        action:'Ver pagamento', date:due, value:Number(payment.valor_previsto || 0) - Number(payment.valor_pago || 0),
      });
    } else if (delta !== null && delta <= 3) {
      pushUnique(list, seen, {
        id:`payment-soon:${payment.id}`, severity:'important', category:'Financeiro', title:delta === 0 ? 'Pagamento vence hoje' : `Pagamento vence em ${delta} dia${delta === 1 ? '' : 's'}`,
        description:`${label} · ${due}`, href:`/acompanhamento.html?view=pagamentos&registro=${encodeURIComponent(payment.registro_id || '')}`,
        action:'Ver pagamento', date:due, value:Number(payment.valor_previsto || 0) - Number(payment.valor_pago || 0),
      });
    }
  }

  for (const item of documents) {
    if (!item || item.status !== 'aguardando_conferencia') continue;
    const created = item.criado_em || item.entrada?.criado_em;
    const ageHours = created ? (now.getTime() - new Date(created).getTime()) / 3600000 : 0;
    const filename = item.entrada?.nome_arquivo || item.dados_extraidos?.titulo_sugerido || 'Documento aguardando revisão';
    pushUnique(list, seen, {
      id:`document:${item.entrada_id || item.id}`,
      severity:ageHours >= 24 ? 'important' : 'info', category:'Documentos',
      title:ageHours >= 24 ? 'Documento aguardando há mais de 24h' : 'Documento aguardando revisão',
      description:filename,
      href:`/acompanhamento.html?view=documentos&documento=${encodeURIComponent(item.entrada_id || '')}`,
      action:'Revisar', date:created,
    });
  }

  for (const campaign of campaigns) {
    const state = campaignState(campaign, today);
    const name = campaign.name || campaign.nome || 'Campanha';
    if (state.id === 'active') {
      const remaining = daysBetween(today, campaign.end || campaign.dataFim);
      if (remaining !== null && remaining <= 3) {
        pushUnique(list, seen, {
          id:`campaign-end:${campaign.id}`, severity:'important', category:'Campanhas', title:remaining === 0 ? 'Campanha termina hoje' : `Campanha termina em ${remaining} dia${remaining === 1 ? '' : 's'}`,
          description:name, href:`/campanhas.html?campanha=${encodeURIComponent(campaign.id)}`, action:'Abrir campanha', date:campaign.end || campaign.dataFim,
        });
      }
    } else if (state.id === 'scheduled') {
      const untilStart = daysBetween(today, campaign.start || campaign.dataInicio);
      if (untilStart !== null && untilStart <= 2) {
        pushUnique(list, seen, {
          id:`campaign-start:${campaign.id}`, severity:'info', category:'Campanhas', title:untilStart === 0 ? 'Campanha começa hoje' : `Campanha começa em ${untilStart} dia${untilStart === 1 ? '' : 's'}`,
          description:name, href:`/campanhas.html?campanha=${encodeURIComponent(campaign.id)}`, action:'Conferir', date:campaign.start || campaign.dataInicio,
        });
      }
    }
  }

  const noUpload = suppliers.filter(item => item?.status !== 'inativo' && !item?.ultimo_upload);
  if (noUpload.length) {
    pushUnique(list, seen, {
      id:'suppliers-without-upload', severity:'info', category:'Fornecedores', title:'Fornecedores sem carga registrada',
      description:`${noUpload.length} fornecedor${noUpload.length === 1 ? '' : 'es'} ainda não possui${noUpload.length === 1 ? '' : 'em'} upload registrado.`,
      href:'/fornecedores.html?status=sem_dados', action:'Ver fornecedores', date:null,
    });
  }

  const freshness = snapshotFreshness(snapshot, today);
  if (freshness.level !== 'ok') {
    pushUnique(list, seen, {
      id:'commercial-data-health', severity:freshness.level === 'warning' ? 'important' : 'info', category:'Dados', title:freshness.label,
      description:freshness.detail, href:'http://localhost:3001/dashboard-regional.html', action:'Ver contexto', date:snapshot?.updatedAt || snapshot?.lastAttemptAt || null,
    });
  }

  const weight = { critical:0, important:1, info:2 };
  return list.sort((a, b) => {
    const severityDiff = (weight[a.severity] ?? 9) - (weight[b.severity] ?? 9);
    if (severityDiff) return severityDiff;
    const aDate = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
    const bDate = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
    return aDate - bDate;
  });
}

export function buildHomeMetrics(input = {}) {
  const { now = new Date(), me = null, tasks = [], executors = [], payments = [], documents = [], suppliers = [], campaigns = [] } = input;
  const today = dateKey(now);
  const byTask = executorMap(executors);
  const mine = tasks.filter(task => taskAssignedTo(task, me?.id, byTask) && !task?.arquivada_em && task?.status !== 'concluida');
  const overdueTasks = mine.filter(task => isTaskOverdue(task, today)).length;
  const paymentDue = payments.filter(payment => {
    if (!payment?.vencimento || ['pago', 'cancelado'].includes(payment.status)) return false;
    const delta = daysBetween(today, payment.vencimento);
    return delta !== null && delta <= 3;
  }).length;
  const pendingDocuments = documents.filter(item => item?.status === 'aguardando_conferencia').length;
  const suppliersPending = suppliers.filter(item => item?.status !== 'inativo' && !item?.ultimo_upload).length;
  const campaignsEnding = campaigns.filter(campaign => {
    if (campaignState(campaign, today).id !== 'active') return false;
    const delta = daysBetween(today, campaign.end || campaign.dataFim);
    return delta !== null && delta <= 7;
  }).length;
  return { overdueTasks, paymentDue, pendingDocuments, suppliersPending, campaignsEnding };
}

export function searchLocalEntities(query, input = {}) {
  const needle = normalizeText(query);
  if (needle.length < 2) return [];
  const results = [];
  const add = item => { if (item && results.length < 40) results.push(item); };

  for (const task of input.tasks || []) {
    if (normalizeText([task.titulo, task.descricao, task.projeto, ...(task.tags || [])].join(' ')).includes(needle)) {
      add({ type:'Demanda', icon:'D', title:task.titulo || 'Demanda', detail:task.projeto || task.status || '', href:`/demandas.html?tarefa=${encodeURIComponent(task.id)}` });
    }
  }
  for (const supplier of input.suppliers || []) {
    if (normalizeText([supplier.nome, supplier.cnpj, supplier.categoria, supplier.contato, supplier.email].join(' ')).includes(needle)) {
      add({ type:'Fornecedor', icon:'F', title:supplier.nome || 'Fornecedor', detail:[supplier.categoria, supplier.cnpj].filter(Boolean).join(' · '), href:`/fornecedores.html?fornecedor=${encodeURIComponent(supplier.id)}` });
    }
  }
  for (const campaign of input.campaigns || []) {
    const supplierNames = (campaign.suppliers || []).map(item => item.name || item.nome).join(' ');
    if (normalizeText([campaign.name, campaign.nome, campaign.description, supplierNames].join(' ')).includes(needle)) {
      add({ type:'Campanha', icon:'C', title:campaign.name || campaign.nome || 'Campanha', detail:supplierNames || 'Campanha comercial', href:`/campanhas.html?campanha=${encodeURIComponent(campaign.id)}` });
    }
  }
  for (const representative of input.representatives || []) {
    if (normalizeText([representative.name, representative.code, representative.id].join(' ')).includes(needle)) {
      add({ type:'Representante', icon:'R', title:representative.name || 'Representante', detail:representative.code ? `Código ${representative.code}` : 'Base comercial ativa', href:`/campanhas.html?view=representatives&busca=${encodeURIComponent(representative.name || '')}` });
    }
  }
  for (const product of input.products || input.cachedProducts || []) {
    if (normalizeText([product.id, product.name, product.supplierName, product.group, product.subgroup].join(' ')).includes(needle)) {
      add({ type:'Produto', icon:'P', title:product.name || `Produto ${product.id}`, detail:[product.supplierName, product.id].filter(Boolean).join(' · '), href:`/campanhas.html?view=products&busca=${encodeURIComponent(product.name || product.id || '')}` });
    }
  }
  return results;
}

export function summarizeAlerts(alerts = []) {
  return alerts.reduce((acc, alert) => {
    const severity = ['critical', 'important', 'info'].includes(alert?.severity) ? alert.severity : 'info';
    acc[severity] += 1;
    acc.total += 1;
    return acc;
  }, { critical:0, important:0, info:0, total:0 });
}
