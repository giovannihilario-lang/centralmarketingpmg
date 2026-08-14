/* PMG Connect — Central de Demandas V3.5 / Gestão Inteligente */
let db = null;
let VAPID_PUBLIC_KEY = '';
let publicConfigPromise = null;

async function initializeSupabaseClient() {
  if (db) return db;
  if (!publicConfigPromise) {
    publicConfigPromise = fetch('/api/notificar-demandas?config=1', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    }).then(async response => {
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json')
        ? await response.json()
        : { erro: await response.text() };
      if (!response.ok) throw new Error(payload.erro || 'Não foi possível carregar a configuração do Supabase.');
      if (!payload.supabaseUrl || !payload.supabaseAnonKey) {
        throw new Error('SUPABASE_URL ou SUPABASE_ANON_KEY não configurada no servidor.');
      }
      VAPID_PUBLIC_KEY = payload.vapidPublicKey || '';
      db = supabase.createClient(payload.supabaseUrl, payload.supabaseAnonKey, {
        realtime: { params: { eventsPerSecond: 8 } }
      });

      // O cliente só existe depois que a configuração pública é carregada.
      // Registrar o listener antes disso fazia a página parar eternamente
      // na tela "Organizando o dia..." com `db` ainda igual a null.
      db.auth.onAuthStateChange((event, session) => {
        state.session = session;
        if (event === 'SIGNED_OUT') location.reload();
      });

      return db;
    });
  }
  return publicConfigPromise;
}

const STATUS = {
  nova: { label: 'Nova', icon: 'circle-dot-dashed' },
  andamento: { label: 'Em andamento', icon: 'loader-circle' },
  revisao: { label: 'Em revisão', icon: 'scan-eye' },
  concluida: { label: 'Concluída', icon: 'circle-check-big' }
};
const PRIORITY = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente', imediata: 'IMEDIATA' };
const SIZE = { rapida: 'Rápida', media: 'Média', grande: 'Grande' };
const RECURRENCE = { nenhuma: 'Não repete', diaria: 'Diariamente', semanal: 'Semanalmente', mensal: 'Mensalmente', anual: 'Anualmente' };
const NOTIFICATION_TEXT = {
  nova_tarefa: 'Você recebeu uma nova demanda',
  prazo_proximo: 'Uma demanda está perto do prazo',
  prazo_atrasado: 'Uma demanda está atrasada',
  prazo_alterado: 'O prazo de uma demanda mudou',
  comentario: 'Há um novo comentário',
  status_mudou: 'O status de uma demanda mudou',
  lembrete: 'Está na hora do seu lembrete',
  demanda_imediata: 'DEMANDA IMEDIATA: verifique agora',
  avaliacao_pendente: 'Uma demanda aguarda avaliação de conclusão',
  avaliacao_aprovada: 'Sua conclusão foi aprovada',
  avaliacao_ajustes: 'A demanda voltou para ajustes',
  transferencia: 'Uma demanda foi transferida para você'
};
const ACTIVITY_TEXT = {
  criada: 'criou a demanda', editada: 'editou a demanda', status: 'alterou o status de',
  atribuida: 'alterou o responsável de', comentario: 'comentou em', arquivada: 'arquivou', restaurada: 'restaurou',
  transferida: 'transferiu a demanda', avaliacao: 'avaliou a conclusão de', tempo: 'registrou tempo em',
  checklist: 'atualizou o checklist de', dependencia: 'alterou as dependências de'
};
const ACTIVITY_ICON = {
  criada: 'clipboard-plus', editada: 'pencil', status: 'refresh-cw', atribuida: 'user-round-cog',
  comentario: 'message-circle', arquivada: 'archive', restaurada: 'archive-restore',
  transferida: 'arrow-right-left', avaliacao: 'badge-check', tempo: 'timer', checklist: 'list-checks', dependencia: 'git-branch'
};
const PRIORITY_ORDER = { imediata: -1, urgente: 0, alta: 1, media: 2, baixa: 3 };
const VIEW_META = {
  hoje: ['Sua rotina', 'Hoje'], agenda: ['Planejamento unificado', 'Agenda'],
  academia: ['Espaço compartilhado', 'Academia PMG'],
  demandas: ['Fluxo de trabalho', 'Demandas'], projetos: ['Planejamento conectado', 'Projetos'], automacoes: ['Rotinas automáticas', 'Automações'], equipe: ['Capacidade do setor', 'Equipe']
};

const state = {
  session: null, me: null, collaborators: [], tasks: [], reminders: [], notifications: [], activities: [],
  view: 'hoje', taskView: 'board', smartFilter: '', selectedTask: null, selectedReminder: null,
  comments: [], taskActivities: [], realtime: null, loading: 0, quickType: 'demanda',
  quickCaptureType: 'lembrete', editingReminderId: null, calendarCursor: startOfMonth(new Date()),
  selectedDate: dateKey(new Date()), pushSubscription: null,
  teamSearch: '', teamSort: 'risk', teamRiskOnly: false, selectedPersonId: null, personActivities: [],
  assigneePicker: { selectId: null, previewId: null, taskId: null, search: '' }, onboardingStep: 0,
  intrusiveQueue: [], intrusiveActive: null, intrusiveShownIds: new Set(), intrusiveBootstrapped: false,
  transfers: [], academyReservations: [], academyConfig: null, v3Ready: true,
  agendaScope: 'mine', agendaPersonFilter: '',
  academyCursor: startOfMonth(new Date()), academySelectedDate: dateKey(new Date()), academyTab: 'calendar', academyImportRows: [], academyImportHeaders: [], academyImportMap: {},
  templates: [], dependencies: [], timeEntries: [], monthlyClosures: [], v4Ready: true, activeTimerTick: null,
  monthlyReportData: null, projects: [], automations: [], intelligenceReady: false, selectedProjectId: null, projectSearch: '', projectStatusFilter: '', accessibility: { scale: 'large', theme: 'light', contrast: false, reduceMotion: false }
};

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const debounce = (fn, wait = 250) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; };

function refreshIcons() {
  try { window.lucide?.createIcons({ attrs: { 'stroke-width': 2 } }); } catch (error) { console.warn('[lucide]', error); }
}
function setLoading(on) {
  state.loading += on ? 1 : -1;
  state.loading = Math.max(0, state.loading);
  $('loadingScreen').classList.toggle('hidden', state.loading === 0);
}
function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i data-lucide="${type === 'error' ? 'circle-alert' : 'circle-check'}"></i><span>${escapeHtml(message)}</span>`;
  $('toastStack').appendChild(el); refreshIcons();
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 3400);
  setTimeout(() => el.remove(), 3750);
}
function errorMessage(error) {
  const message = error?.message || error?.details || String(error || 'Erro inesperado');
  if (/academia_reservas|transferencias_tarefa|criar_tarefa_v3|editar_tarefa_v3|avaliar_conclusao|transferir_tarefa/i.test(message)) {
    return 'A migração Demandas V3 ainda não foi executada no Supabase. Rode sql/demandas_v3_operacao.sql.';
  }
  if (/lembretes|atividades_tarefa|criar_tarefa_v2|relation .* does not exist/i.test(message)) {
    return 'A migração Demandas V2 ainda não foi executada no Supabase.';
  }
  return message;
}
function isManager() { return state.me?.role === 'gestor'; }
function canManageAcademy() { return isManager() || state.me?.pode_gerenciar_academia === true; }
function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase(); }
function firstName(name) { return String(name || 'equipe').trim().split(/\s+/)[0]; }
function collaborator(id) { return state.collaborators.find(item => item.id === id); }
function avatarHTML(person, size = '') {
  const cls = `avatar ${size}`.trim();
  const name = person?.nome || 'Sem responsável';
  if (!person) return `<div class="${cls} avatar-empty" title="Sem responsável" aria-label="Sem responsável"><i data-lucide="user-round-x"></i></div>`;
  if (person.foto_url) return `<div class="${cls}" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}"><img src="${escapeHtml(person.foto_url)}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.parentElement.textContent='${initials(name)}'"></div>`;
  return `<div class="${cls}" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}">${initials(name)}</div>`;
}
function avatarStatusHTML(person, stats, size = 'md') {
  const risk = stats?.risk || 'balanced';
  const meta = teamRiskLabel(stats || { risk });
  const title = `${person?.nome || 'Sem responsável'} · ${meta.label}`;
  return `<span class="avatar-status-wrap risk-${risk}" title="${escapeHtml(title)}">${avatarHTML(person, size)}<span class="avatar-status-badge" aria-hidden="true"><i data-lucide="${meta.icon}"></i></span></span>`;
}
function taskAvatarHTML(person, task, size = 'sm') {
  const late = isOverdue(task);
  const today = taskDueKey(task) === todayKey();
  const tone = late ? 'late' : today ? 'today' : task?.status || 'nova';
  const icon = late ? 'triangle-alert' : today ? 'clock-3' : (STATUS[task?.status]?.icon || 'circle-user-round');
  const description = `${person?.nome || 'Sem responsável'} · ${late ? 'Demanda atrasada' : today ? 'Prazo hoje' : STATUS[task?.status]?.label || 'Demanda'}`;
  return `<span class="task-avatar-wrap ${tone}" title="${escapeHtml(description)}">${avatarHTML(person, size)}<span class="task-avatar-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span></span>`;
}
function activityAvatarHTML(person, type, size = 'sm') {
  return `<span class="activity-avatar-wrap">${avatarHTML(person, size)}<span class="activity-avatar-icon" aria-hidden="true"><i data-lucide="${ACTIVITY_ICON[type] || 'activity'}"></i></span></span>`;
}

const STATUS_ORDER = ['nova', 'andamento', 'revisao', 'concluida'];
const STATUS_HELP = {
  nova: 'Aguardando alguém começar',
  andamento: 'Sendo executada agora',
  revisao: 'Aguardando avaliação de um gestor',
  concluida: 'Conclusão aprovada e encerrada'
};
const STATUS_ACTION = {
  nova: { next: 'andamento', label: 'Iniciar demanda', icon: 'play' },
  andamento: { next: 'revisao', label: 'Enviar para avaliação', icon: 'scan-eye' },
  revisao: { next: '__avaliar__', label: 'Avaliar conclusão', icon: 'badge-check' },
  concluida: { next: 'andamento', label: 'Reabrir demanda', icon: 'rotate-ccw' }
};

function statusActionForTask(task) {
  if (!task) return STATUS_ACTION.nova;
  if (task.status === 'revisao' && !isManager()) return null;
  if (task.status === 'concluida' && !isManager()) return null;
  return STATUS_ACTION[task.status] || STATUS_ACTION.nova;
}

function syncChoiceCards(selectId) {
  const select = $(selectId);
  if (!select) return;
  $$(`[data-choice-target="${selectId}"]`).forEach(button => {
    const active = button.dataset.choiceValue === select.value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function assigneeStats(person) {
  if (!person) return null;
  try { return teamPersonStats(person); }
  catch (error) {
    const active = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida' && task.responsavel_id === person.id);
    return { active, overdue: active.filter(isOverdue), dueToday: active.filter(task => taskDueKey(task) === todayKey()), hours: active.reduce((sum, task) => sum + sizeWeight(task), 0), utilization: 0, risk: 'balanced' };
  }
}

function assigneeLoadText(stats) {
  if (!stats) return 'Sem demandas atribuídas';
  const parts = [`${stats.active.length} aberta${stats.active.length === 1 ? '' : 's'}`];
  if (stats.overdue.length) parts.push(`${stats.overdue.length} atrasada${stats.overdue.length === 1 ? '' : 's'}`);
  if (stats.dueToday.length) parts.push(`${stats.dueToday.length} para hoje`);
  parts.push(`${Math.round(stats.hours)}h estimadas`);
  return parts.join(' · ');
}

function assigneePreviewHTML(person) {
  if (!person) {
    return `<span class="assignee-preview-avatar">${avatarHTML(null, 'md')}</span><span class="assignee-preview-copy"><strong>Sem responsável</strong><small>A demanda ficará disponível para atribuição.</small></span>`;
  }
  const stats = assigneeStats(person);
  return `<span class="assignee-preview-avatar">${avatarStatusHTML(person, stats, 'md')}</span><span class="assignee-preview-copy"><strong>${escapeHtml(person.nome)}</strong><small>${escapeHtml(person.cargo || 'Marketing')} · ${escapeHtml(assigneeLoadText(stats))}</small></span>`;
}

function renderAssigneePreview(selectId, previewId) {
  const select = $(selectId); const preview = $(previewId);
  if (!select || !preview) return;
  preview.innerHTML = assigneePreviewHTML(collaborator(select.value));
  refreshIcons();
}

function syncTaskFormVisuals(prefix) {
  const isEdit = prefix === 'editTask';
  const assigneeId = isEdit ? 'editTaskAssignee' : 'itemAssignee';
  const previewId = isEdit ? 'editTaskAssigneePreview' : 'itemAssigneePreview';
  const priorityId = isEdit ? 'editTaskPriority' : 'itemPriority';
  const sizeId = isEdit ? 'editTaskSize' : 'itemSize';
  renderAssigneePreview(assigneeId, previewId);
  syncChoiceCards(priorityId);
  syncChoiceCards(sizeId);
  syncImmediateAudience(prefix);
}

function syncImmediateAudience(prefix = 'item') {
  const isEdit = prefix === 'editTask';
  const priority = $(isEdit ? 'editTaskPriority' : 'itemPriority')?.value || 'media';
  const hiddenInput = $(isEdit ? 'editTaskAlertAll' : 'itemAlertAll');
  const section = $(isEdit ? 'editImmediateAudienceSection' : 'immediateAudienceSection');
  const selector = isEdit ? '[data-edit-immediate-audience]' : '[data-immediate-audience]';
  const isImmediate = priority === 'imediata';
  if (section) section.classList.toggle('hidden', !isImmediate);
  if (!isImmediate && hiddenInput) hiddenInput.value = 'false';
  const all = hiddenInput?.value === 'true';
  $$(selector).forEach(button => {
    const target = isEdit ? button.dataset.editImmediateAudience : button.dataset.immediateAudience;
    const active = (target === 'todos') === all;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setImmediateAudience(all, isEdit = false) {
  const input = $(isEdit ? 'editTaskAlertAll' : 'itemAlertAll');
  if (input) input.value = String(Boolean(all));
  syncImmediateAudience(isEdit ? 'editTask' : 'item');
}

function openAssigneePicker({ selectId = null, previewId = null, taskId = null, title = 'Selecionar responsável' } = {}) {
  state.assigneePicker = { selectId, previewId, taskId, search: '' };
  $('assigneePickerTitle').textContent = title;
  $('assigneePickerSearch').value = '';
  renderAssigneePicker();
  $('assigneePickerModal').classList.remove('hidden');
  setTimeout(() => $('assigneePickerSearch').focus(), 60);
  refreshIcons();
}

function renderAssigneePicker() {
  const query = (state.assigneePicker.search || '').trim().toLowerCase();
  const currentId = state.assigneePicker.taskId
    ? state.tasks.find(task => task.id === state.assigneePicker.taskId)?.responsavel_id || ''
    : $(state.assigneePicker.selectId)?.value || '';
  const transferTask = state.assigneePicker.taskId ? state.tasks.find(task => task.id === state.assigneePicker.taskId) : null;
  const people = state.collaborators
    .filter(person => !query || [person.nome, person.cargo, person.role].join(' ').toLowerCase().includes(query))
    .map(person => {
      const stats = assigneeStats(person);
      const extra = transferTask && person.id !== currentId ? sizeWeight(transferTask) : 0;
      const projectedHours = Math.max(0, stats.hours + extra);
      const projectedUtilization = Math.round(projectedHours / TEAM_CAPACITY_HOURS * 100);
      return { person, stats, projectedHours, projectedUtilization, extra };
    })
    .sort((a, b) => {
      const selectedDiff = Number(b.person.id === currentId) - Number(a.person.id === currentId);
      const riskDiff = (TEAM_RISK[a.stats.risk]?.score || 0) - (TEAM_RISK[b.stats.risk]?.score || 0);
      return selectedDiff || riskDiff || a.stats.hours - b.stats.hours || String(a.person.nome || '').localeCompare(String(b.person.nome || ''), 'pt-BR');
    });

  $('assigneePickerContext').innerHTML = `<i data-lucide="info"></i><span>${people.length} pessoa${people.length === 1 ? '' : 's'} encontrada${people.length === 1 ? '' : 's'}. ${transferTask ? `A projeção já inclui as ${formatHours(sizeWeight(transferTask))} desta demanda caso ela seja transferida.` : 'Carga calculada pelas demandas abertas e estimativas registradas.'}</span>`;
  const noneOption = !query || 'sem responsável'.includes(query)
    ? `<button type="button" class="assignee-option none ${currentId === '' ? 'selected' : ''}" data-assignee-choice=""><span class="assignee-option-avatar">${avatarHTML(null, 'md')}</span><span class="assignee-option-copy"><strong>Sem responsável</strong><small>Deixar na fila para atribuir depois</small></span><span class="assignee-option-state"><i data-lucide="${currentId === '' ? 'check' : 'chevron-right'}"></i></span></button>`
    : '';
  $('assigneePickerList').innerHTML = noneOption + (people.length ? people.map(({ person, stats, projectedHours, projectedUtilization, extra }) => {
    const risk = teamRiskLabel(stats);
    return `<button type="button" class="assignee-option risk-${stats.risk} ${currentId === person.id ? 'selected' : ''}" data-assignee-choice="${person.id}">
      <span class="assignee-option-avatar">${avatarStatusHTML(person, stats, 'md')}</span>
      <span class="assignee-option-copy"><strong>${escapeHtml(person.nome)}</strong><small>${escapeHtml(person.cargo || 'Marketing')}</small><em>${escapeHtml(assigneeLoadText(stats))}${extra ? ` · após transferência: ${formatHours(projectedHours)}` : ''}</em></span>
      <span class="assignee-option-load"><b>${extra ? `${Math.round(stats.hours)}h → ${Math.round(projectedHours)}h` : `${Math.round(stats.hours)}h`}</b><small>${extra ? `${projectedUtilization}% projetado` : risk.label}</small><i class="assignee-load-track"><span style="width:${Math.min(100, extra ? projectedUtilization : (stats.utilization || 0))}%"></span></i></span>
      <span class="assignee-option-state"><i data-lucide="${currentId === person.id ? 'check' : 'chevron-right'}"></i></span>
    </button>`;
  }).join('') : `<div class="assignee-picker-empty"><i data-lucide="user-search"></i><strong>Ninguém encontrado</strong><span>Tente outro nome ou cargo.</span></div>`);
  refreshIcons();
}

async function chooseAssignee(personId) {
  const picker = { ...state.assigneePicker };
  closeModal('assigneePickerModal');
  if (picker.taskId) {
    await updateTaskAssignee(picker.taskId, personId || null);
    return;
  }
  const select = $(picker.selectId);
  if (!select) return;
  select.value = personId || '';
  renderAssigneePreview(picker.selectId, picker.previewId);
}

function statusFlowHTML(task, canChangeStatus) {
  const currentIndex = STATUS_ORDER.indexOf(task.status);
  return STATUS_ORDER.map((status, index) => {
    const meta = STATUS[status];
    const current = status === task.status;
    const passed = currentIndex >= 0 && index < currentIndex;
    let disabled = !canChangeStatus || Boolean(task.arquivada_em) || current;
    const claimMode = !isManager() && !task.responsavel_id && task.prioridade === 'imediata' && task.alerta_para_todos;
    if (claimMode && status !== 'andamento') disabled = true;
    if (status === 'concluida') disabled = disabled || !isManager() || task.status !== 'revisao';
    if (!isManager() && status === 'nova' && task.status !== 'nova') disabled = true;
    return `<button type="button" class="status-step ${status} ${current ? 'current' : ''} ${passed ? 'passed' : ''}" data-task-status="${status}" ${disabled ? 'disabled' : ''}>
      <span class="status-step-icon"><i data-lucide="${current || passed ? 'check' : meta.icon}"></i></span>
      <span class="status-step-copy"><strong>${meta.label}</strong><small>${STATUS_HELP[status]}</small></span>
    </button>`;
  }).join('');
}

function parseDate(value) { return value ? new Date(value) : null; }
function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function todayKey() { return dateKey(new Date()); }
function localDateTime(date, time = '09:00') { return new Date(`${date}T${time || '09:00'}:00-03:00`).toISOString(); }
function splitDateTime(value) {
  if (!value) return { date: '', time: '' };
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, time: `${map.hour}:${map.minute}` };
}
function formatDate(value, options = {}) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', ...(options.year ? { year: 'numeric' } : {}) }).format(date).replace('.', '');
}
function formatTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace('.', '');
}
function relativeTime(value) {
  if (!value) return '';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'agora'; if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24); return days === 1 ? 'ontem' : `há ${days} dias`;
}
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function addDays(date, amount) { const copy = new Date(date); copy.setDate(copy.getDate() + amount); return copy; }
function addMonths(date, amount) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
function endOfDayISO(date) { return localDateTime(date, '23:59'); }
function taskDue(task) {
  if (task.prazo_em) return task.prazo_em;
  if (task.prazo) return localDateTime(task.prazo, '17:00');
  return null;
}
function taskDueKey(task) { return taskDue(task) ? dateKey(taskDue(task)) : ''; }
function isOverdue(task) { const due = taskDue(task); return due && new Date(due) < new Date() && task.status !== 'concluida'; }
function dueLabel(task) {
  const due = taskDue(task); if (!due) return 'Sem prazo';
  const key = dateKey(due), today = todayKey();
  if (isOverdue(task)) return `Atrasada · ${formatDate(due)}`;
  if (key === today) return `Hoje, ${formatTime(due)}`;
  if (key === dateKey(addDays(new Date(), 1))) return `Amanhã, ${formatTime(due)}`;
  return `${formatDate(due)} · ${formatTime(due)}`;
}
function dueClass(task) { return isOverdue(task) ? 'late' : taskDueKey(task) === todayKey() ? 'today' : ''; }
function reminderEffectiveTime(reminder) { return reminder.adiado_ate || reminder.inicio_em; }
function itemTitle(item) { return item.titulo || 'Sem título'; }
function priorityWeight(task) { return ({ imediata: 6, urgente: 4, alta: 3, media: 2, baixa: 1 })[task.prioridade] || 2; }
function sizeWeight(task) { return Number(task.estimativa_horas) || ({ rapida: 1, media: 2.5, grande: 5 })[task.tamanho] || 2.5; }

async function bootstrap() {
  loadAccessibilityPreferences();
  setLoading(true); refreshIcons();
  try {
    await initializeSupabaseClient();
    const { data: { session } } = await db.auth.getSession();
    state.session = session;
    if (!session) {
      $('loadingScreen').classList.add('hidden'); $('authScreen').classList.remove('hidden'); refreshIcons(); return;
    }
    await initializeUser();
  } catch (error) {
    console.error(error); toast(errorMessage(error), 'error');
    $('authScreen').classList.remove('hidden');
  } finally { setLoading(false); }
}

async function initializeUser() {
  const { data: profile, error } = await db.rpc('garantir_meu_perfil');
  if (error) throw error;
  state.me = profile;
  $('authScreen').classList.add('hidden'); $('app').classList.remove('hidden');
  await loadAll();
  renderAll(); setupRealtime(); await updatePushStatus();
  const needsProfile = !state.me.perfil_configurado;
  if (needsProfile) openProfile(true);
  await handleUrlActions();
  if (!needsProfile) setTimeout(() => maybeOpenOnboarding(), 420);
  setTimeout(() => queueUnreadIntrusiveNotifications(), 900);
}
async function loadAll() {
  await Promise.all([loadCollaborators(), loadTasks(), loadReminders(), loadNotifications(), loadActivities(), loadOperationalV3(), loadProductivityV4(), loadIntelligenceV5()]);
}
async function loadCollaborators() {
  const baseFields = 'id,nome,foto_url,cargo,role,ativo,perfil_configurado,criado_em,atualizado_em';
  let result = await db.from('colaboradores').select(`${baseFields},pode_gerenciar_academia`).eq('ativo', true).order('nome');
  if (result.error && /pode_gerenciar_academia|column/i.test(String(result.error.message || result.error))) {
    // Compatibilidade caso o SQL V3.5.8 ainda não tenha sido executado.
    result = await db.from('colaboradores').select(baseFields).eq('ativo', true).order('nome');
  }
  if (result.error) throw result.error;
  state.collaborators = result.data || [];
  const current = state.collaborators.find(person => person.id === state.me?.id);
  if (current) state.me = current;
}
async function loadTasks() {
  const { data, error } = await db.from('tarefas').select('*').order('atualizado_em', { ascending: false }).limit(800);
  if (error) throw error; state.tasks = data || [];
}
async function loadReminders() {
  const { data, error } = await db.from('lembretes').select('*').order('inicio_em', { ascending: true }).limit(800);
  if (error) throw error; state.reminders = data || [];
}
async function loadNotifications() {
  if (!state.me) return;
  const { data, error } = await db.from('notificacoes')
    .select('*, tarefa:tarefas(id,titulo), lembrete:lembretes(id,titulo,tipo)')
    .eq('colaborador_id', state.me.id).order('criado_em', { ascending: false }).limit(80);
  if (error) throw error; state.notifications = data || [];
}
async function loadActivities() {
  const { data, error } = await db.from('atividades_tarefa')
    .select('*, ator:colaboradores!atividades_tarefa_ator_id_fkey(id,nome,foto_url), tarefa:tarefas!atividades_tarefa_tarefa_id_fkey(id,titulo)')
    .order('criado_em', { ascending: false }).limit(80);
  if (error) throw error; state.activities = data || [];
}

function renderAll() {
  renderShell(); renderToday(); renderAgenda(); renderDemandas(); renderProjects(); renderAutomations(); renderEquipe(); renderAcademy(); renderNotifications(); refreshIcons();
}
function renderShell() {
  $('sideUserAvatar').innerHTML = avatarHTML(state.me, 'sm');
  $('sideUserName').textContent = state.me?.nome || 'Colaborador'; $('sideUserRole').textContent = state.me?.role || 'colaborador';
  renderUserMenu();
  $$('.manager-only').forEach(el => el.classList.toggle('hidden', !isManager()));
  $$('.academy-manager-only').forEach(el => el.classList.toggle('hidden', !canManageAcademy()));
  const activeTasks = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida');
  const mine = activeTasks.filter(task => task.responsavel_id === state.me?.id);
  $('navTaskCount').textContent = activeTasks.length;
  $('navTodayCount').textContent = mine.filter(task => taskDueKey(task) === todayKey() || isOverdue(task)).length;
  $('navTodayCount').classList.toggle('hidden', Number($('navTodayCount').textContent) === 0);
  const academyPending = state.academyReservations.filter(item => item.status === 'solicitada').length;
  if ($('navAcademyPending')) { $('navAcademyPending').textContent = academyPending; $('navAcademyPending').classList.toggle('hidden', academyPending === 0); }
  const projectCount = projectCatalog().filter(item => item.status !== 'concluido').length; if ($('navProjectCount')) { $('navProjectCount').textContent = projectCount; $('navProjectCount').classList.toggle('hidden', projectCount === 0); }
  const automationCount = state.automations.filter(item => item.ativo).length; if ($('navAutomationCount')) { $('navAutomationCount').textContent = automationCount; $('navAutomationCount').classList.toggle('hidden', !isManager() || automationCount === 0); }
  const [eyebrow, title] = VIEW_META[state.view] || VIEW_META.hoje; $('pageEyebrow').textContent = eyebrow; $('pageTitle').textContent = title;
  $$('.nav-item[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === state.view));
  $$('.view').forEach(view => view.classList.toggle('active', view.dataset.page === state.view));
  updateTypeSelectorPermissions();
}
function updateTypeSelectorPermissions() {
  const demandButton = document.querySelector('[data-item-type="demanda"]');
  if (demandButton) {
    demandButton.disabled = !isManager();
    demandButton.title = isManager() ? '' : 'Somente gestores podem criar demandas';
    demandButton.style.opacity = isManager() ? '1' : '.48';
  }
}

function renderToday() {
  const now = new Date();
  const fullDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' }).format(now);
  $('todayDateLabel').textContent = fullDate;
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(now));
  $('greetingTitle').textContent = `${hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}, ${firstName(state.me?.nome)}.`;
  $('heroWeekday').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(now).replace('.', '').toUpperCase();
  $('heroDay').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit' }).format(now);
  $('heroMonth').textContent = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'short' }).format(now).replace('.', '').toUpperCase();

  const active = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida');
  const mine = active.filter(task => task.responsavel_id === state.me?.id);
  const overdue = mine.filter(isOverdue);
  const todayTasks = mine.filter(task => taskDueKey(task) === todayKey());
  const weekEnd = addDays(new Date(), 7);
  const week = mine.filter(task => { const due = taskDue(task); return due && new Date(due) >= new Date() && new Date(due) <= weekEnd; });
  const todayReminders = state.reminders.filter(reminder => !reminder.concluido_em && dateKey(reminderEffectiveTime(reminder)) === todayKey());
  $('metricOverdue').textContent = overdue.length; $('metricToday').textContent = todayTasks.length + todayReminders.length;
  $('metricWeek').textContent = week.length; $('metricMine').textContent = mine.length;
  const totalNow = overdue.length + todayTasks.length + todayReminders.length;
  $('dailySummary').textContent = totalNow
    ? `Você tem ${totalNow} ${totalNow === 1 ? 'item importante' : 'itens importantes'} pedindo atenção hoje. Vamos tirar isso da frente sem transformar o WhatsApp em sistema de gestão.`
    : 'Sua agenda está limpa por enquanto. Um raro momento de paz administrativa. Aproveite com responsabilidade.';

  renderSmartDay(mine);
  renderTodayTimeline(todayTasks, todayReminders);
  renderFocusList(mine);
  renderActivityFeed();
}
function renderTodayTimeline(tasks, reminders) {
  const items = [
    ...tasks.map(task => ({ kind: 'task', time: taskDue(task), item: task })),
    ...reminders.map(reminder => ({ kind: reminder.tipo === 'compromisso' ? 'meeting' : 'reminder', time: reminderEffectiveTime(reminder), item: reminder }))
  ].sort((a, b) => new Date(a.time) - new Date(b.time));
  if (!items.length) {
    $('todayTimeline').innerHTML = `<div class="timeline-empty"><i data-lucide="coffee"></i>Nada marcado para hoje. O calendário decidiu colaborar.</div>`; return;
  }
  $('todayTimeline').innerHTML = items.map(({ kind, time, item }) => {
    const late = new Date(time) < new Date() && !(kind === 'task' && item.status === 'concluida');
    const meta = kind === 'task' ? `${STATUS[item.status]?.label || item.status} · ${collaborator(item.responsavel_id)?.nome || 'Sem responsável'}` : `${item.tipo === 'compromisso' ? 'Compromisso' : 'Lembrete'}${item.recorrencia !== 'nenhuma' ? ` · ${RECURRENCE[item.recorrencia]}` : ''}`;
    return `<div class="timeline-item" data-open-${kind === 'task' ? 'task' : 'reminder'}="${item.id}">
      <span class="timeline-time">${formatTime(time)}</span><i class="timeline-dot ${kind} ${late ? 'late' : ''}"></i>
      <div class="timeline-content"><strong>${escapeHtml(item.titulo)}</strong><span>${escapeHtml(meta)}</span></div></div>`;
  }).join('');
}
function renderFocusList(mine) {
  const items = [...mine].sort((a, b) => {
    const aLate = isOverdue(a), bLate = isOverdue(b); if (aLate !== bLate) return aLate ? -1 : 1;
    const aDue = new Date(taskDue(a) || '9999-12-31T23:59:59Z').getTime();
    const bDue = new Date(taskDue(b) || '9999-12-31T23:59:59Z').getTime();
    return aDue - bDue || PRIORITY_ORDER[a.prioridade] - PRIORITY_ORDER[b.prioridade];
  }).slice(0, 6);
  $('focusCount').textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
  $('focusList').innerHTML = items.length ? items.map(task => `<div class="focus-item" data-open-task="${task.id}">
    <span class="focus-check"><i data-lucide="check"></i></span><div class="focus-copy"><strong>${escapeHtml(task.titulo)}</strong><span>${escapeHtml(dueLabel(task))}</span></div><i class="focus-priority ${task.prioridade}"></i></div>`).join('')
    : `<div class="empty-state"><i data-lucide="party-popper"></i>Nenhuma demanda pendente atribuída a você.</div>`;
}
function renderActivityFeed() {
  const items = state.activities.slice(0, 6);
  $('activityFeed').innerHTML = items.length ? items.map(activity => `<div class="activity-item">${activityAvatarHTML(activity.ator, activity.tipo, 'sm')}<div class="activity-copy"><strong>${escapeHtml(activity.ator?.nome || 'Sistema')}</strong> ${escapeHtml(ACTIVITY_TEXT[activity.tipo] || 'atualizou')} <strong>${escapeHtml(activity.tarefa?.titulo || 'uma demanda')}</strong><span>${relativeTime(activity.criado_em)}</span></div></div>`).join('')
    : `<div class="empty-state"><i data-lucide="activity"></i>As movimentações da equipe aparecerão aqui.</div>`;
}

function agendaPersonMatches(taskOrReminder, type = 'task') {
  const filter = state.agendaPersonFilter || '';
  if (!filter) return true;
  if (type === 'task') return taskOrReminder.responsavel_id === filter;
  return taskOrReminder.colaborador_id === filter || taskOrReminder.criado_por === filter;
}

function populateAgendaPersonFilter() {
  const select = $('agendaPersonFilter');
  if (!select) return;
  const value = state.agendaPersonFilter || '';
  select.innerHTML = `<option value="">Toda a equipe</option>${state.collaborators.map(person => `<option value="${person.id}">${escapeHtml(person.nome)}</option>`).join('')}`;
  select.value = value;
  select.classList.toggle('hidden', state.agendaScope !== 'team');
}

function calendarItemsForDate(key) {
  const teamMode = state.agendaScope === 'team';
  const tasks = state.tasks.filter(task => {
    if (task.arquivada_em || taskDueKey(task) !== key) return false;
    if (teamMode) return agendaPersonMatches(task, 'task');
    return task.responsavel_id === state.me?.id;
  }).map(task => ({ kind: 'task', id: task.id, title: task.titulo, time: taskDue(task), item: task }));

  const reminders = state.reminders.filter(reminder => {
    if (reminder.concluido_em || dateKey(reminderEffectiveTime(reminder)) !== key) return false;
    if (teamMode) return reminder.visibilidade === 'equipe' && agendaPersonMatches(reminder, 'reminder');
    return reminder.colaborador_id === state.me?.id || reminder.criado_por === state.me?.id;
  }).map(reminder => ({ kind: reminder.tipo === 'compromisso' ? 'meeting' : 'reminder', id: reminder.id, title: reminder.titulo, time: reminderEffectiveTime(reminder), item: reminder }));

  return [...tasks, ...reminders].sort((a, b) => new Date(a.time) - new Date(b.time));
}

function renderAgendaScopeSummary() {
  const container = $('agendaScopeSummary');
  if (!container) return;
  const cursor = state.calendarCursor;
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const teamMode = state.agendaScope === 'team';
  const tasks = state.tasks.filter(task => {
    if (task.arquivada_em || !taskDueKey(task).startsWith(monthKey)) return false;
    return teamMode ? agendaPersonMatches(task, 'task') : task.responsavel_id === state.me?.id;
  });
  const reminders = state.reminders.filter(reminder => {
    if (reminder.concluido_em || !dateKey(reminderEffectiveTime(reminder)).startsWith(monthKey)) return false;
    if (teamMode) return reminder.visibilidade === 'equipe' && agendaPersonMatches(reminder, 'reminder');
    return reminder.colaborador_id === state.me?.id || reminder.criado_por === state.me?.id;
  });
  const immediate = tasks.filter(task => task.prioridade === 'imediata' && task.status !== 'concluida').length;
  const evaluation = tasks.filter(task => task.status === 'revisao').length;
  container.innerHTML = [
    ['clipboard-list', tasks.length, teamMode ? 'Demandas do setor no mês' : 'Minhas demandas no mês'],
    ['calendar-clock', reminders.length, teamMode ? 'Compromissos do setor' : 'Lembretes e compromissos'],
    ['siren', immediate, 'Imediatas abertas'],
    ['scan-eye', evaluation, 'Aguardando avaliação']
  ].map(([icon, value, label]) => `<div class="sector-summary-card"><i data-lucide="${icon}"></i><div><strong>${value}</strong><span>${label}</span></div></div>`).join('');
}

function renderAgenda() {
  const cursor = state.calendarCursor;
  $('calendarMonthLabel').textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(cursor);
  populateAgendaPersonFilter();
  $$('[data-agenda-scope]').forEach(button => {
    const active = button.dataset.agendaScope === state.agendaScope;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderAgendaScopeSummary();
  renderSelectedDayHeader();
  const first = startOfMonth(cursor); const start = addDays(first, -first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i); const key = dateKey(date);
    const events = calendarItemsForDate(key); const outside = date.getMonth() !== cursor.getMonth();
    const immediate = events.some(entry => entry.kind === 'task' && entry.item?.prioridade === 'imediata');
    cells.push(`<button class="calendar-day ${outside ? 'outside' : ''} ${key === todayKey() ? 'today' : ''} ${key === state.selectedDate ? 'selected' : ''} ${immediate ? 'has-immediate' : ''}" data-calendar-date="${key}">
      <span class="day-number">${date.getDate()}</span><div class="calendar-events">${events.slice(0, 3).map(item => `<span class="calendar-event ${item.kind === 'task' && item.item?.prioridade === 'imediata' ? 'immediate' : item.kind}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>`).join('')}${events.length > 3 ? `<span class="more-events">+${events.length - 3}</span>` : ''}</div></button>`);
  }
  $('calendarGrid').innerHTML = cells.join(''); renderSelectedDayItems(); refreshIcons();
}

function renderSelectedDayHeader() {
  const date = new Date(`${state.selectedDate}T12:00:00`);
  $('selectedDayWeekday').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date);
  $('selectedDayNumber').textContent = String(date.getDate()).padStart(2, '0');
  $('selectedDayMonth').textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
}
function renderSelectedDayItems() {
  const items = calendarItemsForDate(state.selectedDate);
  $('selectedDayItems').innerHTML = items.length ? items.map(entry => {
    const taskPerson = entry.kind === 'task' ? collaborator(entry.item.responsavel_id) : null;
    const visual = entry.kind === 'task'
      ? `<span class="day-item-avatar">${taskAvatarHTML(taskPerson, entry.item, 'sm')}</span>`
      : `<span class="day-item-symbol ${entry.kind}"><i data-lucide="${entry.kind === 'meeting' ? 'calendar-clock' : 'bell'}"></i></span>`;
    const project = entry.kind === 'task' && entry.item.projeto ? `<span class="day-item-project"><i data-lucide="folder-kanban"></i>${escapeHtml(entry.item.projeto)}</span>` : '';
    return `<div class="day-item enriched ${entry.kind === 'task' && entry.item.prioridade === 'imediata' ? 'immediate' : ''}" data-open-${entry.kind === 'task' ? 'task' : 'reminder'}="${entry.id}">${visual}<div class="day-item-main"><div class="day-item-head"><i class="day-item-type ${entry.kind}"></i><small>${formatTime(entry.time)} · ${entry.kind === 'task' ? 'Demanda' : entry.kind === 'meeting' ? 'Compromisso' : 'Lembrete'}</small></div><strong>${escapeHtml(entry.title)}</strong>${entry.kind === 'task' ? `<span>${escapeHtml(taskPerson?.nome || 'Sem responsável')}</span>${project}` : ''}</div></div>`;
  }).join('') : `<div class="empty-state"><i data-lucide="calendar-x-2"></i>Nenhum item neste dia.</div>`;
}

function filteredTasks() {
  const search = $('taskSearch')?.value.trim().toLowerCase() || '';
  const assignee = $('taskAssigneeFilter')?.value || ''; const project = $('taskProjectFilter')?.value || ''; const priority = $('taskPriorityFilter')?.value || '';
  const archive = $('taskArchiveFilter')?.value || 'ativas'; const now = new Date(); const weekEnd = addDays(now, 7);
  return state.tasks.filter(task => {
    const blob = [task.titulo, task.descricao, ...(task.tags || [])].join(' ').toLowerCase();
    if (search && !blob.includes(search)) return false;
    if (assignee && (assignee === 'none' ? Boolean(task.responsavel_id) : task.responsavel_id !== assignee)) return false;
    if (project && String(task.projeto || '') !== project) return false;
    if (priority && task.prioridade !== priority) return false;
    if (archive === 'ativas' && task.arquivada_em) return false;
    if (archive === 'arquivadas' && !task.arquivada_em) return false;
    if (state.smartFilter === 'atrasadas' && !isOverdue(task)) return false;
    if (state.smartFilter === 'hoje' && taskDueKey(task) !== todayKey()) return false;
    if (state.smartFilter === 'semana') { const due = taskDue(task); if (!due || new Date(due) < now || new Date(due) > weekEnd) return false; }
    if (state.smartFilter === 'minhas' && task.responsavel_id !== state.me?.id) return false;
    return true;
  });
}
function projectNames() {
  return [...new Set(state.tasks.map(task => String(task.projeto || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
function populateProjectOptions() {
  const projects = projectNames();
  const filter = $('taskProjectFilter');
  if (filter) {
    const value = filter.value;
    filter.innerHTML = `<option value="">Todos os projetos</option>${projects.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
    filter.value = projects.includes(value) ? value : '';
  }
  const datalist = $('projectSuggestions');
  if (datalist) datalist.innerHTML = projects.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

function renderDemandas() {
  populateAssigneeSelects(); populateProjectOptions();
  $('taskBoard').classList.toggle('hidden', state.taskView !== 'board'); $('taskListView').classList.toggle('hidden', state.taskView !== 'list');
  $$('[data-task-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.taskView === state.taskView));
  const labels = { atrasadas: 'Mostrando demandas atrasadas', hoje: 'Mostrando demandas para hoje', semana: 'Mostrando os próximos 7 dias', minhas: 'Mostrando minhas demandas' };
  $('taskSmartFilterBar').classList.toggle('hidden', !state.smartFilter); $('smartFilterLabel').textContent = labels[state.smartFilter] || '';
  renderTaskAvatarFilters(); renderBoard(); renderTaskList();
}
function populateAssigneeSelects() {
  const options = `<option value="">Todos os responsáveis</option><option value="none">Sem responsável</option>${state.collaborators.map(person => `<option value="${person.id}">${escapeHtml(person.nome)}</option>`).join('')}`;
  const select = $('taskAssigneeFilter'); if (select) { const value = select.value; select.innerHTML = options; select.value = value; }
  ['itemAssignee', 'editTaskAssignee', 'transferAssignee'].forEach(id => { const el = $(id); if (!el) return; const value = el.value; el.innerHTML = `<option value="">Sem responsável</option>${state.collaborators.map(person => `<option value="${person.id}">${escapeHtml(person.nome)}</option>`).join('')}`; el.value = value; });
}
function renderTaskAvatarFilters() {
  const container = $('taskAvatarFilters'); if (!container) return;
  const selected = $('taskAssigneeFilter')?.value || '';
  const active = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida');
  const countFor = personId => active.filter(task => task.responsavel_id === personId).length;
  const unassigned = active.filter(task => !task.responsavel_id).length;
  const buttons = [
    `<button type="button" class="task-avatar-filter ${selected === '' ? 'active' : ''}" data-avatar-filter="" title="Mostrar todos"><span class="task-avatar-filter-all"><i data-lucide="users-round"></i></span><span><strong>Todos</strong><small>${active.length} abertas</small></span></button>`,
    ...state.collaborators.map(person => `<button type="button" class="task-avatar-filter ${selected === person.id ? 'active' : ''}" data-avatar-filter="${person.id}" title="Filtrar demandas de ${escapeHtml(person.nome)}">${avatarHTML(person, 'sm')}<span><strong>${escapeHtml(firstName(person.nome))}</strong><small>${countFor(person.id)} aberta(s)</small></span></button>`),
    `<button type="button" class="task-avatar-filter unassigned ${selected === 'none' ? 'active' : ''}" data-avatar-filter="none" title="Mostrar demandas sem responsável"><span class="task-avatar-filter-all"><i data-lucide="user-round-x"></i></span><span><strong>Sem dono</strong><small>${unassigned} aberta(s)</small></span></button>`
  ];
  container.innerHTML = buttons.join('');
  refreshIcons();
}
function renderBoard() {
  const tasks = filteredTasks();
  $$('.kanban-column').forEach(column => {
    const status = column.dataset.status; const items = tasks.filter(task => task.status === status);
    column.querySelector('.kanban-head b').textContent = items.length;
    column.querySelector('.kanban-list').innerHTML = items.length ? items.map(taskCardHTML).join('') : `<div class="empty-state">Nenhuma demanda aqui.</div>`;
  });
  bindTaskDrag();
}
function taskCardHTML(task) {
  const person = collaborator(task.responsavel_id);
  const canMove = !task.arquivada_em && (isManager() || task.responsavel_id === state.me?.id || task.criado_por === state.me?.id);
  return `<article class="task-card" data-open-task="${task.id}" data-task-id="${task.id}" data-priority="${task.prioridade}" draggable="${canMove}">
    <div class="task-card-top"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span><span class="size-pill">${SIZE[task.tamanho] || 'Média'}</span>${task.projeto ? `<span class="project-pill"><i data-lucide="folder-kanban"></i>${escapeHtml(task.projeto)}</span>` : ''}${task.arquivada_em ? '<span class="archived-pill">Arquivada</span>' : ''}<span class="task-card-id">#${task.id.slice(0, 5).toUpperCase()}</span></div>
    <h3>${escapeHtml(task.titulo)}</h3>${task.descricao ? `<p>${escapeHtml(task.descricao)}</p>` : ''}
    ${(task.tags || []).length ? `<div class="task-tags">${task.tags.slice(0, 4).map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <div class="task-progress-meta"><span>${task.estimativa_horas ? `${Number(task.estimativa_horas)}h estimadas` : 'Sem estimativa'}</span><span>${STATUS[task.status]?.label}</span></div>
    <div class="task-card-footer"><span class="task-due ${dueClass(task)}"><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span><div class="task-card-person">${taskAvatarHTML(person, task, 'sm')}<span>${escapeHtml(person?.nome || 'Sem responsável')}</span></div></div>
  </article>`;
}
function renderTaskList() {
  const tasks = filteredTasks();
  $('taskRows').innerHTML = tasks.length ? tasks.map(task => { const person = collaborator(task.responsavel_id); return `<div class="task-row" data-open-task="${task.id}">
    <div class="task-row-title"><i class="priority-line" style="background:${task.prioridade === 'urgente' ? 'var(--red)' : task.prioridade === 'alta' ? 'var(--amber)' : task.prioridade === 'baixa' ? 'var(--blue)' : 'var(--green-300)'}"></i><div><strong>${escapeHtml(task.titulo)}</strong><small>${escapeHtml([task.projeto ? `Projeto: ${task.projeto}` : '', (task.tags || []).join(' · ')].filter(Boolean).join(' · ') || 'Sem projeto ou tags')}</small></div></div>
    <div class="task-row-person">${taskAvatarHTML(person, task, 'sm')}<span>${escapeHtml(person?.nome || 'Sem responsável')}</span></div><span class="table-pill ${dueClass(task)}">${escapeHtml(dueLabel(task))}</span><span class="table-pill">${STATUS[task.status]?.label}</span><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span></div>`; }).join('')
    : `<div class="empty-state" style="margin:15px"><i data-lucide="search-x"></i>Nenhuma demanda encontrada.</div>`;
}
function bindTaskDrag() {
  $$('.task-card[draggable="true"]').forEach(card => {
    card.ondragstart = event => { event.dataTransfer.setData('text/plain', card.dataset.taskId); card.classList.add('dragging'); };
    card.ondragend = () => card.classList.remove('dragging');
  });
}

const TEAM_CAPACITY_HOURS = 24;
const TEAM_RISK = {
  critical: { label: 'Crítico', icon: 'siren', score: 4 },
  attention: { label: 'Atenção', icon: 'triangle-alert', score: 3 },
  busy: { label: 'Carga alta', icon: 'gauge', score: 2 },
  balanced: { label: 'Equilibrado', icon: 'circle-check', score: 1 },
  available: { label: 'Disponível', icon: 'sparkles', score: 0 }
};

function isWithinDays(value, days) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= Date.now() - days * 86400000;
}
function taskSortByAttention(a, b) {
  const overdueDiff = Number(isOverdue(b)) - Number(isOverdue(a));
  if (overdueDiff) return overdueDiff;
  const priorityDiff = (PRIORITY_ORDER[a.prioridade] ?? 9) - (PRIORITY_ORDER[b.prioridade] ?? 9);
  if (priorityDiff) return priorityDiff;
  return new Date(taskDue(a) || '9999-12-31').getTime() - new Date(taskDue(b) || '9999-12-31').getTime();
}
function teamPersonStats(person) {
  const assigned = state.tasks.filter(task => !task.arquivada_em && task.responsavel_id === person.id);
  const active = assigned.filter(task => task.status !== 'concluida');
  const completed30 = assigned.filter(task => task.status === 'concluida' && isWithinDays(task.concluida_em || task.atualizado_em, 30));
  const completed7 = completed30.filter(task => isWithinDays(task.concluida_em || task.atualizado_em, 7));
  const overdue = active.filter(isOverdue);
  const dueToday = active.filter(task => taskDueKey(task) === todayKey());
  const weekEnd = addDays(new Date(), 7);
  const dueWeek = active.filter(task => {
    const due = taskDue(task);
    return due && new Date(due) >= new Date() && new Date(due) <= weekEnd;
  });
  const urgent = active.filter(task => ['imediata', 'urgente'].includes(task.prioridade));
  const hours = active.reduce((sum, task) => sum + sizeWeight(task), 0);
  const utilization = Math.min(140, Math.round((hours / TEAM_CAPACITY_HOURS) * 100));
  const deadlineCompleted = completed30.filter(task => taskDue(task) && task.concluida_em);
  const onTime = deadlineCompleted.filter(task => new Date(task.concluida_em) <= new Date(taskDue(task))).length;
  const onTimeRate = deadlineCompleted.length ? Math.round((onTime / deadlineCompleted.length) * 100) : null;
  const cycles = completed30.filter(task => task.criado_em && task.concluida_em).map(task => Math.max(0, (new Date(task.concluida_em) - new Date(task.criado_em)) / 86400000));
  const avgCycle = cycles.length ? cycles.reduce((sum, value) => sum + value, 0) / cycles.length : null;
  const activities = state.activities.filter(activity => activity.ator_id === person.id);
  const activities7 = activities.filter(activity => isWithinDays(activity.criado_em, 7));
  const lastActivity = activities[0]?.criado_em || person.criado_em;
  const nextTasks = [...active].sort(taskSortByAttention);
  const statusCounts = Object.fromEntries(Object.keys(STATUS).map(status => [status, assigned.filter(task => task.status === status).length]));

  let risk = 'available';
  if (overdue.length >= 2 || hours >= 28 || (overdue.length && urgent.length)) risk = 'critical';
  else if (overdue.length || hours >= 20 || dueToday.length >= 3) risk = 'attention';
  else if (hours >= 14 || dueWeek.length >= 5) risk = 'busy';
  else if (hours >= 5 || active.length >= 2) risk = 'balanced';

  return { person, assigned, active, completed30, completed7, overdue, dueToday, dueWeek, urgent, hours, utilization, onTimeRate, avgCycle, activities, activities7, lastActivity, nextTasks, statusCounts, risk };
}
function teamRiskLabel(stats) { return TEAM_RISK[stats.risk] || TEAM_RISK.balanced; }
function teamSummaryCard(icon, value, label, tone = '') {
  return `<div class="team-summary-card ${tone}"><span class="team-summary-icon"><i data-lucide="${icon}"></i></span><div><strong>${value}</strong><span>${label}</span></div></div>`;
}
function renderEquipe() {
  const manager = isManager();
  const active = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida');
  const completed30 = state.tasks.filter(task => !task.arquivada_em && task.status === 'concluida' && isWithinDays(task.concluida_em || task.atualizado_em, 30));
  const totalHours = active.reduce((sum, task) => sum + sizeWeight(task), 0);
  const overdue = active.filter(isOverdue);
  const weekEnd = addDays(new Date(), 7);
  const dueWeek = active.filter(task => { const due = taskDue(task); return due && new Date(due) >= new Date() && new Date(due) <= weekEnd; });
  const unassigned = active.filter(task => !task.responsavel_id);
  let stats = state.collaborators.map(teamPersonStats);
  renderTeamAvatarStrip(stats, manager);

  $('teamPageEyebrow').textContent = manager ? 'Painel gerencial' : 'Colaboração do setor';
  $('teamPageDescription').textContent = manager
    ? 'Acompanhe carga, prioridades, entregas e movimentações de cada pessoa.'
    : 'Veja a disponibilidade estimada do setor e quem está cuidando de cada frente.';
  $('teamUpdatedAt').textContent = `Atualizado ${relativeTime(new Date().toISOString())}`;

  const operationalPeople = state.collaborators.filter(person => person.role !== 'gestor');
  const busyPeople = operationalPeople.filter(person => active.some(task => task.responsavel_id === person.id)).length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const peopleCompletedMonth = operationalPeople.filter(person => state.tasks.some(task => task.responsavel_id === person.id && task.status === 'concluida' && new Date(task.concluida_em || task.atualizado_em) >= monthStart)).length;
  const pendingEvaluation = active.filter(task => task.status === 'revisao').length;
  $('teamSummary').innerHTML = manager
    ? [
        teamSummaryCard('users-round', operationalPeople.length, 'Colaboradores ativos'),
        teamSummaryCard('briefcase-business', busyPeople, 'Pessoas atarefadas'),
        teamSummaryCard('clipboard-list', active.length, 'Demandas em aberto'),
        teamSummaryCard('scan-eye', pendingEvaluation, 'Aguardando avaliação', pendingEvaluation ? 'attention' : ''),
        teamSummaryCard('badge-check', peopleCompletedMonth, 'Pessoas com conclusão no mês'),
        teamSummaryCard('clock-4', `${Math.round(totalHours)}h`, 'Carga estimada'),
        teamSummaryCard('triangle-alert', overdue.length, 'Demandas atrasadas', overdue.length ? 'danger' : ''),
        teamSummaryCard('calendar-range', dueWeek.length, 'Vencem em 7 dias'),
        teamSummaryCard('circle-check-big', completed30.length, 'Concluídas em 30 dias')
      ].join('')
    : [
        teamSummaryCard('users-round', state.collaborators.length, 'Pessoas no setor'),
        teamSummaryCard('clipboard-list', active.length, 'Demandas em andamento'),
        teamSummaryCard('calendar-range', dueWeek.length, 'Entregas da semana'),
        teamSummaryCard('badge-check', completed30.length, 'Concluídas em 30 dias')
      ].join('');

  if (manager) { renderTeamInsights(stats, active, unassigned); renderTeamCapacityForecast(stats); }

  if (manager) {
    const search = (state.teamSearch || '').trim().toLowerCase();
    if (search) stats = stats.filter(item => [item.person.nome, item.person.cargo, item.person.role].join(' ').toLowerCase().includes(search));
    if (state.teamRiskOnly) stats = stats.filter(item => ['critical', 'attention'].includes(item.risk));
    stats.sort((a, b) => {
      if (state.teamSort === 'name') return a.person.nome.localeCompare(b.person.nome, 'pt-BR');
      if (state.teamSort === 'workload') return b.hours - a.hours || b.active.length - a.active.length;
      if (state.teamSort === 'overdue') return b.overdue.length - a.overdue.length || b.hours - a.hours;
      if (state.teamSort === 'completed') return b.completed30.length - a.completed30.length || a.person.nome.localeCompare(b.person.nome, 'pt-BR');
      return TEAM_RISK[b.risk].score - TEAM_RISK[a.risk].score || b.overdue.length - a.overdue.length || b.hours - a.hours;
    });
  }

  $('teamGrid').innerHTML = stats.length
    ? stats.map(item => personCardHTML(item, manager)).join('')
    : `<div class="team-empty"><i data-lucide="users-round"></i><strong>Ninguém encontrado</strong><span>Ajuste a busca ou remova o filtro de atenção.</span></div>`;
  refreshIcons();
}
function renderTeamAvatarStrip(stats, manager) {
  const container = $('teamAvatarStrip'); if (!container) return;
  const ordered = [...stats].sort((a, b) => TEAM_RISK[b.risk].score - TEAM_RISK[a.risk].score || a.person.nome.localeCompare(b.person.nome, 'pt-BR'));
  const legend = [
    ['available', 'Disponível'], ['balanced', 'Equilibrado'], ['busy', 'Carga alta'], ['attention', 'Atenção'], ['critical', 'Crítico']
  ].map(([tone, label]) => `<span><i class="avatar-legend-dot ${tone}"></i>${label}</span>`).join('');
  container.innerHTML = `<div class="team-avatar-strip-head"><div><span class="eyebrow">Quem está com o quê</span><strong>Equipe em um olhar</strong></div><div class="avatar-risk-legend">${legend}</div></div>
    <div class="team-avatar-list">${ordered.map(item => {
      const meta = teamRiskLabel(item);
      const action = `data-person-show-tasks="${item.person.id}"`;
      return `<button type="button" class="team-avatar-person risk-${item.risk}" ${action} title="Ver demandas de ${escapeHtml(item.person.nome)}"><span class="team-avatar-visual">${avatarStatusHTML(item.person, item, 'md')}</span><span class="team-avatar-copy"><strong>${escapeHtml(firstName(item.person.nome))}</strong><small><i data-lucide="${meta.icon}"></i>${meta.label} · ${item.active.length} aberta(s)</small></span><i class="team-avatar-action" data-lucide="list-filter"></i></button>`;
    }).join('')}</div>`;
}
function renderTeamInsights(stats, active, unassigned) {
  const attention = stats.filter(item => ['critical', 'attention'].includes(item.risk));
  const overloaded = [...stats].sort((a, b) => b.hours - a.hours)[0];
  const next48h = active.filter(task => {
    const due = taskDue(task); if (!due) return false;
    const diff = new Date(due) - new Date(); return diff >= 0 && diff <= 48 * 3600000;
  }).sort(taskSortByAttention);
  const idleWithWork = stats.filter(item => item.active.length && item.lastActivity && !isWithinDays(item.lastActivity, 7));
  const alerts = [
    ...attention.slice(0, 3).map(item => ({ icon: TEAM_RISK[item.risk].icon, title: item.person.nome, text: `${item.overdue.length} atrasada(s) · ${Math.round(item.hours)}h em aberto`, personId: item.person.id, person: item.person, stats: item, tone: item.risk })),
    ...unassigned.slice(0, 2).map(task => ({ icon: 'user-round-x', title: task.titulo, text: 'Demanda sem responsável', taskId: task.id, tone: 'attention' }))
  ].slice(0, 5);
  const statusTotals = Object.keys(STATUS).map(status => ({ status, count: state.tasks.filter(task => !task.arquivada_em && task.status === status).length }));
  const totalStatus = Math.max(1, statusTotals.reduce((sum, item) => sum + item.count, 0));

  $('teamInsights').innerHTML = `<article class="team-insight-card team-alert-card">
      <div class="team-insight-head"><div><span class="eyebrow">Atenção agora</span><h3>Riscos e gargalos</h3></div><span class="insight-count">${alerts.length}</span></div>
      <div class="team-alert-list">${alerts.length ? alerts.map(item => `<button class="team-alert-item ${item.tone}" ${item.personId ? `data-open-person="${item.personId}"` : `data-open-task="${item.taskId}"`}>${item.person ? avatarStatusHTML(item.person, item.stats, 'sm') : `<span><i data-lucide="${item.icon}"></i></span>`}<div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></div><i data-lucide="chevron-right"></i></button>`).join('') : `<div class="team-insight-empty"><i data-lucide="shield-check"></i><span>Nenhum gargalo crítico neste momento.</span></div>`}</div>
    </article>
    <article class="team-insight-card">
      <div class="team-insight-head"><div><span class="eyebrow">Fluxo do setor</span><h3>Distribuição das demandas</h3></div><span class="insight-count neutral">${active.length}</span></div>
      <div class="team-status-overview">${statusTotals.map(item => `<div><div class="team-status-row"><span><i class="status-mark ${item.status === 'nova' ? 'blue' : item.status === 'andamento' ? 'amber' : item.status === 'revisao' ? 'purple' : 'green'}"></i>${STATUS[item.status].label}</span><strong>${item.count}</strong></div><div class="team-mini-track"><i style="width:${Math.round((item.count / totalStatus) * 100)}%"></i></div></div>`).join('')}</div>
    </article>
    <article class="team-insight-card team-pulse-card">
      <div class="team-insight-head"><div><span class="eyebrow">Pulso da semana</span><h3>Leitura rápida</h3></div><i data-lucide="activity"></i></div>
      <div class="team-pulse-grid">
        <div><strong>${next48h.length}</strong><span>prazos em 48h</span></div>
        <div><strong>${attention.length}</strong><span>pessoas em atenção</span></div>
        <div><strong>${idleWithWork.length}</strong><span>sem movimento há 7 dias</span></div>
        <div><strong>${overloaded ? Math.round(overloaded.hours) + 'h' : '0h'}</strong><span>maior carga · ${escapeHtml(overloaded?.person.nome || '—')}</span></div>
      </div>
    </article>`;
}
function personCardHTML(stats, manager) {
  const { person, active, overdue, dueToday, dueWeek, completed30, hours, utilization, nextTasks, lastActivity, risk, statusCounts } = stats;
  const riskMeta = teamRiskLabel(stats);
  const totalPipeline = Math.max(1, Object.values(statusCounts).reduce((sum, value) => sum + value, 0));
  const cardAttrs = manager ? `data-open-person="${person.id}" role="button" tabindex="0"` : '';
  const preview = nextTasks.slice(0, 3);
  return `<article class="person-card team-person-card risk-${risk} ${manager ? 'clickable' : 'readonly'}" ${cardAttrs}>
    <div class="person-card-accent"></div>
    <div class="person-head">${avatarStatusHTML(person, stats, 'md')}<div class="person-copy"><strong>${escapeHtml(person.nome)}</strong><span>${escapeHtml(person.cargo || 'Marketing')}</span></div>${person.role === 'gestor' ? '<span class="role-chip">Gestor</span>' : ''}</div>
    <div class="person-state-line"><span class="person-risk ${risk}"><i data-lucide="${riskMeta.icon}"></i>${riskMeta.label}</span><span>${lastActivity ? `Movimento ${relativeTime(lastActivity)}` : 'Sem atividade registrada'}</span></div>
    <div class="person-metrics manager-metrics">
      <div class="person-metric"><strong>${active.length}</strong><span>Em aberto</span></div>
      ${manager ? `<div class="person-metric ${overdue.length ? 'danger' : ''}"><strong>${overdue.length}</strong><span>Atrasadas</span></div>` : ''}
      <div class="person-metric"><strong>${dueWeek.length}</strong><span>Esta semana</span></div>
      ${manager ? `<div class="person-metric"><strong>${completed30.length}</strong><span>Concluídas 30d</span></div>` : ''}
    </div>
    <div class="workload-block"><div class="workload-label"><span>Carga estimada</span><span>${Math.round(hours)}h · ${utilization}%</span></div><div class="workload-track"><i class="${utilization >= 85 ? 'high' : utilization >= 60 ? 'medium' : ''}" style="width:${Math.min(100, utilization)}%"></i></div><div class="workload-scale"><span>Disponível</span><span>24h de referência</span></div></div>
    <div class="person-pipeline" aria-label="Distribuição por status">${Object.keys(STATUS).map(status => `<i class="${status}" title="${STATUS[status].label}: ${statusCounts[status]}" style="width:${Math.max(statusCounts[status] ? 5 : 0, (statusCounts[status] / totalPipeline) * 100)}%"></i>`).join('')}</div>
    <div class="person-task-preview"><div class="person-preview-head"><span>Próximas prioridades</span>${dueToday.length ? `<b>${dueToday.length} hoje</b>` : ''}</div>${preview.length ? preview.map(task => `<div class="person-preview-task"><i class="focus-priority ${task.prioridade}"></i><span>${escapeHtml(task.titulo)}</span><small class="${dueClass(task)}">${escapeHtml(dueLabel(task))}</small></div>`).join('') : `<div class="person-preview-empty">Nenhuma demanda pendente.</div>`}</div>
    <div class="person-card-footer"><span>${manager ? 'Clique para abrir a visão completa' : 'Disponibilidade calculada pelas demandas'}</span>${manager ? '<i data-lucide="arrow-up-right"></i>' : ''}</div>
  </article>`;
}
function completionTrendHTML(stats) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index - 6));
  const values = days.map(day => stats.completed30.filter(task => dateKey(task.concluida_em || task.atualizado_em) === dateKey(day)).length);
  const max = Math.max(1, ...values);
  return `<div class="completion-trend">${days.map((day, index) => `<div class="trend-day"><div class="trend-bar-wrap"><i style="height:${Math.max(values[index] ? 12 : 3, (values[index] / max) * 100)}%"></i></div><strong>${values[index]}</strong><span>${new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day).replace('.', '')}</span></div>`).join('')}</div>`;
}
async function openPerson(personId) {
  if (!isManager()) return;
  const person = collaborator(personId); if (!person) return;
  state.selectedPersonId = personId; state.personActivities = state.activities.filter(activity => activity.ator_id === personId);
  $('personDrawerKicker').textContent = 'Visão gerencial'; $('personDrawerTitle').textContent = person.nome;
  $('personDrawerContent').innerHTML = `<div class="drawer-loading"><div class="loading-orbit"><span></span><span></span><span></span></div><strong>Organizando os dados...</strong></div>`;
  openDrawer('personDrawer');
  try {
    const { data, error } = await db.from('atividades_tarefa')
      .select('*, tarefa:tarefas!atividades_tarefa_tarefa_id_fkey(id,titulo,status,prioridade,prazo_em,responsavel_id)')
      .eq('ator_id', personId).order('criado_em', { ascending: false }).limit(40);
    if (!error) state.personActivities = data || [];
  } catch (error) { console.warn('[equipe] Não foi possível ampliar o histórico:', error); }
  renderPersonDrawer(person);
}
function renderPersonDrawer(person) {
  const stats = teamPersonStats(person); const riskMeta = teamRiskLabel(stats);
  const active = [...stats.active].sort(taskSortByAttention);
  const completed = [...stats.completed30].sort((a, b) => new Date(b.concluida_em || b.atualizado_em) - new Date(a.concluida_em || a.atualizado_em));
  const activities = state.personActivities || [];
  $('personDrawerContent').innerHTML = `<div class="person-hero risk-${stats.risk}">
      <div class="person-hero-profile">${avatarStatusHTML(person, stats, 'xl')}<div><span class="person-risk ${stats.risk}"><i data-lucide="${riskMeta.icon}"></i>${riskMeta.label}</span><h3>${escapeHtml(person.nome)}</h3><p>${escapeHtml(person.cargo || 'Marketing')} · ${person.role === 'gestor' ? 'Gestor' : 'Colaborador'}</p></div></div>
      <div class="person-hero-copy"><i data-lucide="sparkles"></i><span>${teamManagerNarrative(stats)}</span></div>
    </div>
    <div class="person-drawer-metrics">
      <div><span>Em aberto</span><strong>${stats.active.length}</strong></div><div class="${stats.overdue.length ? 'danger' : ''}"><span>Atrasadas</span><strong>${stats.overdue.length}</strong></div>
      <div><span>Vencem hoje</span><strong>${stats.dueToday.length}</strong></div><div><span>Concluídas 30d</span><strong>${stats.completed30.length}</strong></div>
      <div><span>No prazo</span><strong>${stats.onTimeRate === null ? '—' : stats.onTimeRate + '%'}</strong></div><div><span>Ciclo médio</span><strong>${stats.avgCycle === null ? '—' : stats.avgCycle.toFixed(1) + 'd'}</strong></div>
    </div>
    <section class="person-drawer-section">
      <div class="person-section-head"><div><span class="eyebrow">Capacidade</span><h3>Carga atual</h3></div><strong>${Math.round(stats.hours)}h <small>de ${TEAM_CAPACITY_HOURS}h</small></strong></div>
      <div class="drawer-workload-track"><i class="${stats.utilization >= 85 ? 'high' : stats.utilization >= 60 ? 'medium' : ''}" style="width:${Math.min(100, stats.utilization)}%"></i></div>
      <div class="drawer-status-grid">${Object.keys(STATUS).map(status => `<div><i class="status-mark ${status === 'nova' ? 'blue' : status === 'andamento' ? 'amber' : status === 'revisao' ? 'purple' : 'green'}"></i><span>${STATUS[status].label}</span><strong>${stats.statusCounts[status]}</strong></div>`).join('')}</div>
    </section>
    <section class="person-drawer-section">
      <div class="person-section-head"><div><span class="eyebrow">Últimos 7 dias</span><h3>Ritmo de conclusão</h3></div><strong>${stats.completed7.length}<small> entregas</small></strong></div>
      ${completionTrendHTML(stats)}
    </section>
    <section class="person-drawer-section">
      <div class="person-section-head"><div><span class="eyebrow">Fila atual</span><h3>Demandas em andamento</h3></div><span>${active.length} itens</span></div>
      <div class="person-drawer-task-list">${active.length ? active.slice(0, 10).map(task => `<button class="person-drawer-task" data-open-task="${task.id}"><i class="focus-priority ${task.prioridade}"></i><div><strong>${escapeHtml(task.titulo)}</strong><span>${STATUS[task.status].label} · ${SIZE[task.tamanho] || 'Média'}${task.estimativa_horas ? ` · ${Number(task.estimativa_horas)}h` : ''}</span></div><small class="${dueClass(task)}">${escapeHtml(dueLabel(task))}</small><i data-lucide="chevron-right"></i></button>`).join('') : `<div class="drawer-empty-row"><i data-lucide="circle-check-big"></i><span>Nenhuma demanda pendente.</span></div>`}</div>
    </section>
    <section class="person-drawer-section">
      <div class="person-section-head"><div><span class="eyebrow">Histórico</span><h3>Atividade recente</h3></div><span>${activities.length} ações</span></div>
      <div class="person-activity-list">${activities.length ? activities.slice(0, 12).map(activity => `<button class="person-activity-row" data-open-task="${activity.tarefa_id}"><span class="person-activity-icon"><i data-lucide="${activityIcon(activity.tipo)}"></i></span><div><p><strong>${escapeHtml(ACTIVITY_TEXT[activity.tipo] || 'atualizou')}</strong> ${escapeHtml(activity.tarefa?.titulo || 'uma demanda')}</p><span>${formatDateTime(activity.criado_em)}</span></div></button>`).join('') : `<div class="drawer-empty-row"><i data-lucide="activity"></i><span>Nenhuma atividade recente registrada.</span></div>`}</div>
    </section>
    ${completed.length ? `<section class="person-drawer-section"><div class="person-section-head"><div><span class="eyebrow">Entregas</span><h3>Concluídas recentemente</h3></div></div><div class="recent-completed-list">${completed.slice(0, 5).map(task => `<button data-open-task="${task.id}"><i data-lucide="circle-check-big"></i><span><strong>${escapeHtml(task.titulo)}</strong><small>${formatDate(task.concluida_em || task.atualizado_em, { year: true })}</small></span></button>`).join('')}</div></section>` : ''}
    <div class="person-drawer-actions"><button class="btn secondary" data-person-show-tasks="${person.id}"><i data-lucide="list-filter"></i>Ver todas as demandas</button><button class="btn primary" data-person-create-task="${person.id}"><i data-lucide="clipboard-plus"></i>Delegar demanda</button></div>`;
  refreshIcons();
}
function teamManagerNarrative(stats) {
  if (stats.risk === 'critical') return `${stats.person.nome} precisa de atenção: há ${stats.overdue.length} demanda(s) atrasada(s) e ${Math.round(stats.hours)}h estimadas em aberto.`;
  if (stats.risk === 'attention') return `Há pressão de prazo ou carga elevada. Vale revisar prioridades antes de delegar algo novo.`;
  if (stats.risk === 'busy') return `A agenda está ocupada, mas ainda sem sinal crítico. As próximas entregas concentram-se nesta semana.`;
  if (stats.risk === 'available') return `A carga registrada está baixa. Pode haver espaço para apoiar outra frente ou receber uma nova demanda.`;
  return `A carga está equilibrada entre volume, esforço estimado e prazos registrados.`;
}
function activityIcon(type) {
  return ({ criada: 'plus', editada: 'pencil', status: 'refresh-cw', atribuida: 'user-round-cog', comentario: 'message-circle', arquivada: 'archive', restaurada: 'archive-restore', transferida: 'arrow-right-left', avaliacao: 'badge-check', tempo: 'timer', checklist: 'list-checks', dependencia: 'git-branch' })[type] || 'activity';
}
function showPersonTasks(personId) {
  closeDrawer('personDrawer'); state.smartFilter = ''; switchView('demandas'); populateAssigneeSelects();
  $('taskAssigneeFilter').value = personId; renderDemandas(); refreshIcons();
}

function renderNotifications() {
  const unread = state.notifications.filter(item => !item.lida).length;
  $('notificationBadge').textContent = unread; $('notificationBadge').classList.toggle('hidden', unread === 0);
  $('notificationList').innerHTML = state.notifications.length ? state.notifications.map(notification => {
    const title = notification.tarefa?.titulo || notification.lembrete?.titulo || 'Atualização';
    const heading = notification.mensagem || (notification.lembrete_id ? (notification.lembrete?.tipo === 'compromisso' ? 'Compromisso próximo' : 'Lembrete programado') : NOTIFICATION_TEXT[notification.tipo] || 'Atualização');
    const type = notification.tipo || '';
    const iconMap = { demanda_imediata: 'siren', comentario: 'message-circle', transferencia: 'arrow-right-left', avaliacao_pendente: 'scan-eye', avaliacao_aprovada: 'badge-check', avaliacao_ajustes: 'undo-2', status_mudou: 'refresh-cw' };
    const icon = notification.lembrete_id ? (notification.lembrete?.tipo === 'compromisso' ? 'calendar-clock' : 'alarm-clock') : iconMap[type] || (type.includes('prazo') ? 'calendar-clock' : 'clipboard-check');
    const actor = resolveNotificationActor(notification);
    const visual = actor ? `<span class="notification-item-avatar">${avatarHTML(actor, 'sm')}</span>` : `<span class="notification-item-icon"><i data-lucide="${icon}"></i></span>`;
    const task = notification.tarefa_id ? state.tasks.find(item => item.id === notification.tarefa_id) : null;
    const context = task ? `${PRIORITY[task.prioridade] || 'Média'} · ${dueLabel(task)}` : relativeTime(notification.criado_em);
    return `<div class="notification-item ${notification.lida ? '' : 'unread'} type-${type}" data-notification-id="${notification.id}" data-task-id="${notification.tarefa_id || ''}" data-reminder-id="${notification.lembrete_id || ''}">${visual}<div class="notification-item-copy"><strong>${escapeHtml(heading)}</strong><p>${escapeHtml(title)}</p><span>${escapeHtml(context)} · ${relativeTime(notification.criado_em)}</span></div><i class="notification-item-arrow" data-lucide="chevron-right"></i></div>`;
  }).join('') : `<div class="empty-state" style="margin:16px"><i data-lucide="bell-off"></i>Nenhuma notificação por aqui.</div>`;
}

function switchView(view) {
  state.view = view; renderShell();
  if (view === 'agenda') renderAgenda();
  if (view === 'academia') renderAcademy();
  if (view === 'demandas') renderDemandas();
  if (view === 'projetos') renderProjects();
  if (view === 'automacoes') renderAutomations();
  if (view === 'equipe') renderEquipe();
  window.scrollTo({ top: 0, behavior: state.accessibility.reduceMotion ? 'auto' : 'smooth' }); closeMobileSidebar(); refreshIcons();
}
function applySmartFilter(filter) { state.smartFilter = filter; switchView('demandas'); renderDemandas(); }

function openQuickAdd(type = 'demanda', preset = {}) {
  if (type === 'demanda' && !isManager()) { toast('Somente gestores podem criar demandas.', 'error'); type = 'lembrete'; }
  state.editingReminderId = preset.editingReminderId || null;
  $('quickAddForm').reset();
  setQuickType(type);
  const today = preset.date || todayKey();
  $('itemTitle').value = preset.title || ''; $('itemDescription').value = preset.description || '';
  $('itemDueDate').value = preset.date || ''; $('itemDueTime').value = preset.time || '17:00';
  $('reminderDate').value = today; $('reminderTime').value = preset.time || '09:00';
  $('meetingEndDate').value = today; $('meetingEndTime').value = preset.endTime || '10:00';
  $('reminderVisibility').value = isManager() ? (preset.visibility || 'pessoal') : 'pessoal';
  if (type === 'demanda') {
    populateAssigneeSelects();
    populateDependencySelects('itemDependencies', null);
    renderTaskTemplateSelect();
    $('itemAssignee').value = preset.assigneeId || '';
    if ($('itemProject')) $('itemProject').value = preset.project || '';
    if ($('itemChecklist')) $('itemChecklist').value = '';
    $('itemPriority').value = preset.priority || 'media';
    $('itemSize').value = preset.size || 'media';
    syncTaskFormVisuals('item');
  }
  if (preset.reminder) fillReminderForm(preset.reminder);
  $('quickAddModal').classList.remove('hidden'); setTimeout(() => $('itemTitle').focus(), 60); refreshIcons();
}
function setQuickType(type) {
  state.quickType = type; $('itemType').value = type;
  $$('[data-item-type]').forEach(btn => btn.classList.toggle('active', btn.dataset.itemType === type));
  $('demandFields').classList.toggle('hidden', type !== 'demanda'); $('reminderFields').classList.toggle('hidden', type === 'demanda');
  $('meetingEndFields').classList.toggle('hidden', type !== 'compromisso');
  $('visibilityField').classList.toggle('hidden', !isManager());
  if ($('taskTemplateToolbar')) $('taskTemplateToolbar').classList.toggle('hidden', type !== 'demanda' || !isManager());
  if (type === 'demanda') { populateAssigneeSelects(); populateDependencySelects('itemDependencies', null); renderTaskTemplateSelect(); syncTaskFormVisuals('item'); }
  $('saveItemBtn').innerHTML = `<i data-lucide="check"></i>${state.editingReminderId ? 'Salvar alterações' : type === 'demanda' ? 'Criar demanda' : type === 'compromisso' ? 'Criar compromisso' : 'Criar lembrete'}`;
  refreshIcons();
}
function fillReminderForm(reminder) {
  const start = splitDateTime(reminder.inicio_em); const end = splitDateTime(reminder.fim_em);
  $('itemTitle').value = reminder.titulo; $('itemDescription').value = reminder.descricao || '';
  $('reminderDate').value = start.date; $('reminderTime').value = start.time;
  $('meetingEndDate').value = end.date || start.date; $('meetingEndTime').value = end.time || start.time;
  $('reminderRecurrence').value = reminder.recorrencia || 'nenhuma'; $('reminderVisibility').value = reminder.visibilidade || 'pessoal';
  if (reminder.lembrar_em) {
    const diff = Math.round((new Date(reminder.inicio_em) - new Date(reminder.lembrar_em)) / 60000);
    $('reminderOffset').value = ['0', '10', '30', '60', '1440'].includes(String(diff)) ? String(diff) : '0';
  }
}
function closeModal(id) { $(id).classList.add('hidden'); if (id === 'quickAddModal') state.editingReminderId = null; if (id === 'assigneePickerModal') state.assigneePicker = { selectId: null, previewId: null, taskId: null, search: '' }; }

async function saveQuickItem(event) {
  event.preventDefault(); setLoading(true);
  const wasEditing = Boolean(state.editingReminderId);
  try {
    if (state.quickType === 'demanda') await createTaskV2();
    else if (state.editingReminderId) await updateReminderV2();
    else await createReminderV2();
    closeModal('quickAddModal'); await Promise.all([loadTasks(), loadReminders(), loadNotifications(), loadActivities()]); renderAll();
    await dispatchPendingPush(); toast(wasEditing ? 'Item atualizado.' : 'Item criado com sucesso.');
  } catch (error) { console.error(error); toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}
async function createTaskV2() {
  const dueDate = $('itemDueDate').value; const dueTime = $('itemDueTime').value || '17:00';
  const dueAt = dueDate ? localDateTime(dueDate, dueTime) : null; const offset = $('itemReminderOffset').value;
  const remindAt = dueAt && offset !== '' ? new Date(new Date(dueAt).getTime() - Number(offset) * 60000).toISOString() : null;
  const tags = $('itemTags').value.split(',').map(item => item.trim()).filter(Boolean);
  const priority = $('itemPriority').value;
  const alertAll = priority === 'imediata' && $('itemAlertAll')?.value === 'true';
  if (priority === 'imediata' && !$('itemAssignee').value && !alertAll) throw new Error('Escolha um responsável para a demanda imediata ou envie o alerta para toda a equipe.');
  const checklist = checklistFromText($('itemChecklist')?.value || '');
  const dependencies = selectedValues($('itemDependencies'));
  const { error } = await db.rpc('criar_tarefa_v4', {
    p_titulo: $('itemTitle').value.trim(), p_descricao: $('itemDescription').value.trim() || null,
    p_prioridade: priority, p_responsavel_id: $('itemAssignee').value || null,
    p_prazo_em: dueAt, p_lembrar_em: remindAt, p_tags: tags,
    p_tamanho: $('itemSize').value, p_estimativa_horas: $('itemEstimate').value ? Number($('itemEstimate').value) : null,
    p_alerta_para_todos: alertAll, p_projeto: $('itemProject')?.value.trim() || null,
    p_checklist: checklist, p_dependencias: dependencies
  });
  if (error) throw error;
}
async function createReminderV2() {
  const start = localDateTime($('reminderDate').value || todayKey(), $('reminderTime').value || '09:00');
  const end = state.quickType === 'compromisso' ? localDateTime($('meetingEndDate').value || $('reminderDate').value, $('meetingEndTime').value || $('reminderTime').value) : null;
  const remindAt = new Date(new Date(start).getTime() - Number($('reminderOffset').value || 0) * 60000).toISOString();
  const { error } = await db.rpc('criar_lembrete', {
    p_titulo: $('itemTitle').value.trim(), p_descricao: $('itemDescription').value.trim() || null,
    p_tipo: state.quickType, p_inicio_em: start, p_fim_em: end, p_lembrar_em: remindAt,
    p_recorrencia: $('reminderRecurrence').value, p_visibilidade: isManager() ? $('reminderVisibility').value : 'pessoal'
  });
  if (error) throw error;
}
async function updateReminderV2() {
  const start = localDateTime($('reminderDate').value, $('reminderTime').value || '09:00');
  const end = state.quickType === 'compromisso' ? localDateTime($('meetingEndDate').value || $('reminderDate').value, $('meetingEndTime').value || $('reminderTime').value) : null;
  const remindAt = new Date(new Date(start).getTime() - Number($('reminderOffset').value || 0) * 60000).toISOString();
  const { error } = await db.rpc('editar_lembrete', {
    p_id: state.editingReminderId, p_titulo: $('itemTitle').value.trim(), p_descricao: $('itemDescription').value.trim() || null,
    p_tipo: state.quickType, p_inicio_em: start, p_fim_em: end, p_lembrar_em: remindAt, p_recorrencia: $('reminderRecurrence').value,
    p_visibilidade: isManager() ? $('reminderVisibility').value : 'pessoal'
  });
  if (error) throw error;
}

async function openTask(taskId) {
  const task = state.tasks.find(item => item.id === taskId); if (!task) return;
  state.selectedTask = task; state.selectedReminder = null; setLoading(true);
  try {
    const [{ data: comments, error: commentsError }, { data: activities, error: activitiesError }] = await Promise.all([
      db.from('comentarios').select('*, colaborador:colaboradores(id,nome,foto_url)').eq('tarefa_id', taskId).order('criado_em'),
      db.from('atividades_tarefa').select('*, ator:colaboradores!atividades_tarefa_ator_id_fkey(id,nome,foto_url)').eq('tarefa_id', taskId).order('criado_em', { ascending: false })
    ]);
    if (commentsError) throw commentsError; if (activitiesError) throw activitiesError;
    state.comments = comments || []; state.taskActivities = activities || [];
    renderTaskDrawer(); openDrawer('taskDrawer'); await markNotificationsForTarget('task', taskId);
  } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
}
function renderTaskDrawer() {
  const task = state.selectedTask; if (!task) return;
  const person = collaborator(task.responsavel_id);
  const creator = collaborator(task.criado_por);
  const evaluator = collaborator(task.avaliado_por);
  const personStats = person ? assigneeStats(person) : null;
  $('taskDrawerKicker').textContent = `Demanda #${task.id.slice(0, 5).toUpperCase()}`; $('taskDrawerTitle').textContent = task.titulo;
  const canClaimImmediate = !task.responsavel_id && task.prioridade === 'imediata' && task.alerta_para_todos && task.status === 'nova';
  const canChangeStatus = isManager() || task.responsavel_id === state.me.id || canClaimImmediate;
  const nextAction = statusActionForTask(task);
  const canAssign = isManager() && !task.arquivada_em && task.status !== 'concluida';
  const immediate = task.prioridade === 'imediata';
  const evaluationPending = task.status === 'revisao';
  const evaluationFeedback = task.avaliacao_status === 'ajustes' && task.avaliacao_observacao;
  const evaluationApproved = task.avaliacao_status === 'aprovada';

  const evaluationPanel = evaluationPending
    ? isManager()
      ? `<section class="manager-evaluation-panel"><div class="manager-evaluation-icon"><i data-lucide="scan-eye"></i></div><div><span class="eyebrow">Sua ação é necessária</span><h3>O colaborador solicitou a conclusão</h3><p>Confira o resultado, comentários e briefing antes de encerrar. Você pode aprovar ou devolver para ajustes.</p></div><div class="manager-evaluation-actions"><button id="drawerRejectEvaluationBtn" type="button" class="btn secondary"><i data-lucide="undo-2"></i>Devolver para ajustes</button><button id="drawerApproveEvaluationBtn" type="button" class="btn primary"><i data-lucide="badge-check"></i>Aprovar conclusão</button></div></section>`
      : `<section class="manager-evaluation-panel waiting"><div class="manager-evaluation-icon"><i data-lucide="hourglass"></i></div><div><span class="eyebrow">Aguardando gestor</span><h3>Sua entrega foi enviada para avaliação</h3><p>O status final só será liberado depois que um gestor validar a conclusão. Se houver ajustes, eles aparecerão aqui e por notificação.</p></div></section>`
    : evaluationFeedback
      ? `<section class="evaluation-feedback adjustments"><span><i data-lucide="message-square-warning"></i></span><div><strong>Ajustes solicitados${evaluator ? ` por ${escapeHtml(firstName(evaluator.nome))}` : ''}</strong><p>${escapeHtml(task.avaliacao_observacao)}</p><small>${task.avaliado_em ? formatDateTime(task.avaliado_em) : ''}</small></div></section>`
      : evaluationApproved
        ? `<section class="evaluation-feedback approved"><span><i data-lucide="badge-check"></i></span><div><strong>Conclusão aprovada${evaluator ? ` por ${escapeHtml(firstName(evaluator.nome))}` : ''}</strong><p>${escapeHtml(task.avaliacao_observacao || 'Entrega validada e encerrada.')}</p><small>${task.avaliado_em ? formatDateTime(task.avaliado_em) : ''}</small></div></section>`
        : '';

  const nextActionMarkup = canChangeStatus && !task.arquivada_em && nextAction
    ? `<button id="drawerNextStatusBtn" type="button" class="status-primary-action ${task.status} ${nextAction.next === '__avaliar__' ? 'evaluation' : ''}" data-next-status="${nextAction.next}"><i data-lucide="${nextAction.icon}"></i><span><strong>${canClaimImmediate ? 'Assumir e iniciar agora' : nextAction.label}</strong><small>${canClaimImmediate ? 'Ao iniciar, esta demanda passa a ficar sob sua responsabilidade.' : nextAction.next === '__avaliar__' ? 'Revise o material e decida se pode ser encerrado' : STATUS_HELP[nextAction.next]}</small></span><i data-lucide="arrow-right"></i></button>`
    : evaluationPending && !isManager()
      ? `<div class="status-waiting-note"><i data-lucide="clock-3"></i><span><strong>Aguardando avaliação</strong><small>Você não precisa alterar o status enquanto o gestor revisa.</small></span></div>`
      : '';

  $('taskDrawerContent').innerHTML = `
    ${immediate ? `<div class="task-immediate-strip"><span class="task-immediate-siren"><i data-lucide="siren"></i></span><div><strong>DEMANDA IMEDIATA</strong><span>Este item deve interromper as prioridades normais e ser tratado agora.${task.alerta_para_todos ? ' O alerta foi enviado para toda a equipe.' : ''}</span></div><span class="task-immediate-pulse">AGORA</span></div>` : ''}
    <section class="task-overview-hero ${immediate ? 'immediate' : ''}">
      <div class="task-people-flow">
        <div class="task-person-identity"><span>${avatarHTML(creator, 'md')}</span><div><small>Criada por</small><strong>${escapeHtml(creator?.nome || 'Sistema')}</strong></div></div>
        <i data-lucide="arrow-right"></i>
        <div class="task-person-identity assigned"><span>${taskAvatarHTML(person, task, 'md')}</span><div><small>Responsável</small><strong>${escapeHtml(person?.nome || 'Sem responsável')}</strong></div></div>
      </div>
      <div class="task-overview-meta"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span><span class="size-pill">${SIZE[task.tamanho] || 'Média'}</span>${task.alerta_para_todos ? '<span class="team-alert-pill"><i data-lucide="users-round"></i>Alerta para toda a equipe</span>' : ''}<span class="task-overview-due ${dueClass(task)}"><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span></div>
      <p>${escapeHtml(task.descricao || 'Esta demanda ainda não possui descrição.')}</p>
      ${(task.tags || []).length ? `<div class="detail-tags">${task.tags.map(tag => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    </section>

    ${evaluationPanel}

    <section class="task-status-section">
      <div class="task-section-heading"><div><span class="eyebrow">Fluxo</span><h3>Status da demanda</h3></div><span class="current-status-label ${task.status}"><i data-lucide="${STATUS[task.status]?.icon || 'circle-dot'}"></i>${STATUS[task.status]?.label || task.status}</span></div>
      <div class="status-flow">${statusFlowHTML(task, canChangeStatus)}</div>
      ${nextActionMarkup}
    </section>

    <section class="task-assignee-section">
      <div class="task-section-heading"><div><span class="eyebrow">Responsabilidade</span><h3>Quem está com esta demanda</h3></div>${canAssign ? '<span class="section-hint">Transferência preserva tudo</span>' : ''}</div>
      <button id="drawerAssigneePickerBtn" type="button" class="drawer-assignee-card ${canAssign ? 'editable' : ''}" ${canAssign ? '' : 'disabled'}>
        <span class="drawer-assignee-avatar">${person ? avatarStatusHTML(person, personStats, 'lg') : avatarHTML(null, 'lg')}</span>
        <span class="drawer-assignee-copy"><strong>${escapeHtml(person?.nome || 'Sem responsável')}</strong><small>${escapeHtml(person?.cargo || 'Aguardando atribuição')}</small><em>${escapeHtml(person ? assigneeLoadText(personStats) : 'A demanda ainda não pertence a ninguém. Em alerta coletivo imediato, a primeira pessoa que iniciar assume o item.')}</em></span>
        ${canAssign ? '<span class="drawer-assignee-change"><span>Transferir demanda</span><i data-lucide="arrow-right-left"></i></span>' : ''}
      </button>
    </section>

    <section class="task-detail-summary">
      <div><span><i data-lucide="calendar-days"></i>Prazo</span><strong class="${dueClass(task)}">${escapeHtml(dueLabel(task))}</strong></div>
      <div><span><i data-lucide="gauge"></i>Esforço</span><strong>${SIZE[task.tamanho] || 'Média'}${task.estimativa_horas ? ` · ${Number(task.estimativa_horas)}h` : ''}</strong></div>
      <div><span><i data-lucide="folder-kanban"></i>Projeto</span><strong>${escapeHtml(task.projeto || 'Sem projeto')}</strong></div>
      <div><span><i data-lucide="flag"></i>Prioridade</span><strong class="${immediate ? 'immediate-text' : ''}">${PRIORITY[task.prioridade]}</strong></div>
      <div><span><i data-lucide="badge-check"></i>Validação</span><strong>${task.avaliacao_status === 'pendente' ? 'Pendente' : task.avaliacao_status === 'aprovada' ? 'Aprovada' : task.avaliacao_status === 'ajustes' ? 'Ajustes solicitados' : 'Ainda não enviada'}</strong></div>
      <div><span><i data-lucide="activity"></i>Atualizada</span><strong>${relativeTime(task.atualizado_em)}</strong></div>
    </section>

    <section class="detail-section"><div class="detail-section-head"><h3>Comentários</h3><span>${state.comments.length}</span></div><div class="comment-list">${renderComments()}</div>${!task.arquivada_em ? `<form id="drawerCommentForm" class="comment-form"><textarea id="drawerCommentText" required placeholder="Escreva um comentário..."></textarea><button type="submit"><i data-lucide="send"></i></button></form>` : ''}</section>
    <section class="detail-section"><div class="detail-section-head"><h3>Histórico</h3><span>${state.taskActivities.length} registros</span></div><div class="activity-timeline">${renderTaskActivities()}</div></section>
    <div class="drawer-footer-actions">${isManager() && !task.arquivada_em ? `<button id="editTaskBtn" class="btn secondary"><i data-lucide="pencil"></i>Editar detalhes</button>${task.status !== 'concluida' ? `<button id="transferTaskBtn" class="btn secondary"><i data-lucide="arrow-right-left"></i>Transferir</button>` : ''}<button id="archiveTaskBtn" class="btn danger-soft"><i data-lucide="archive"></i>Arquivar</button>` : ''}${isManager() && task.arquivada_em ? `<button id="restoreTaskBtn" class="btn primary"><i data-lucide="archive-restore"></i>Restaurar</button>` : ''}</div>`;
  bindTaskDrawerEvents(); refreshIcons();
}
function renderComments() {
  return state.comments.length ? state.comments.map(comment => `<div class="comment">${activityAvatarHTML(comment.colaborador, 'comentario', 'sm')}<div class="comment-bubble"><div class="comment-meta"><strong>${escapeHtml(comment.colaborador?.nome || 'Colaborador')}</strong><span>${formatDateTime(comment.criado_em)}</span></div><p>${escapeHtml(comment.texto)}</p></div></div>`).join('') : `<div class="empty-state">Sem comentários ainda.</div>`;
}
function renderTaskActivities() {
  if (!state.taskActivities.length) return `<div class="empty-state">O histórico começará a aparecer nas próximas alterações.</div>`;
  return state.taskActivities.map(activity => {
    let text = `${escapeHtml(ACTIVITY_TEXT[activity.tipo] || 'atualizou esta demanda')}`;
    let detail = '';
    if (activity.tipo === 'transferida') {
      const from = collaborator(activity.detalhes?.de);
      const to = collaborator(activity.detalhes?.para);
      text = 'transferiu a responsabilidade';
      detail = `${escapeHtml(from?.nome || 'Sem responsável')} → ${escapeHtml(to?.nome || 'Sem responsável')}${activity.detalhes?.horas != null ? ` · ${Number(activity.detalhes.horas)}h transferidas` : ''}${activity.detalhes?.observacao ? ` · ${escapeHtml(activity.detalhes.observacao)}` : ''}`;
    } else if (activity.tipo === 'avaliacao') {
      const approved = activity.detalhes?.resultado === 'aprovada';
      text = approved ? 'aprovou a conclusão' : 'devolveu a demanda para ajustes';
      detail = activity.detalhes?.observacao ? escapeHtml(activity.detalhes.observacao) : (approved ? 'Entrega validada.' : 'Ajustes solicitados.');
    }
    return `<div class="activity-log"><span class="activity-log-icon"><i data-lucide="${ACTIVITY_ICON[activity.tipo] || (activity.tipo === 'status' ? 'refresh-cw' : 'activity')}"></i></span><div><p><strong>${escapeHtml(activity.ator?.nome || 'Sistema')}</strong> ${text}</p>${detail ? `<em>${detail}</em>` : ''}<span>${formatDateTime(activity.criado_em)}</span></div></div>`;
  }).join('');
}
function bindTaskDrawerEvents() {
  $$('#taskDrawerContent [data-task-status]').forEach(button => button.addEventListener('click', () => {
    if (!button.disabled && button.dataset.taskStatus !== state.selectedTask?.status) updateTaskStatus(state.selectedTask.id, button.dataset.taskStatus);
  }));
  $('drawerNextStatusBtn')?.addEventListener('click', event => {
    const next = event.currentTarget.dataset.nextStatus;
    if (next === '__avaliar__') openTaskEvaluation(state.selectedTask.id);
    else updateTaskStatus(state.selectedTask.id, next);
  });
  $('drawerApproveEvaluationBtn')?.addEventListener('click', () => openTaskEvaluation(state.selectedTask.id, 'approve'));
  $('drawerRejectEvaluationBtn')?.addEventListener('click', () => openTaskEvaluation(state.selectedTask.id, 'reject'));
  $('drawerAssigneePickerBtn')?.addEventListener('click', () => openTransferTask(state.selectedTask.id));
  $('transferTaskBtn')?.addEventListener('click', () => openTransferTask(state.selectedTask.id));
  $('drawerCommentForm')?.addEventListener('submit', addComment);
  $('editTaskBtn')?.addEventListener('click', openEditTask);
  $('archiveTaskBtn')?.addEventListener('click', archiveTask);
  $('restoreTaskBtn')?.addEventListener('click', restoreTask);
}
function openEditTask() {
  const task = state.selectedTask; if (!task) return; const due = splitDateTime(taskDue(task));
  $('editTaskId').value = task.id; $('editTaskTitle').value = task.titulo; $('editTaskDescription').value = task.descricao || '';
  populateAssigneeSelects(); $('editTaskAssignee').value = task.responsavel_id || ''; $('editTaskAssignee').dataset.originalValue = task.responsavel_id || ''; $('editTaskPriority').value = task.prioridade;
  if ($('editTaskAlertAll')) $('editTaskAlertAll').value = String(Boolean(task.alerta_para_todos));
  $('editTaskSize').value = task.tamanho || 'media'; $('editTaskDueDate').value = due.date; $('editTaskDueTime').value = due.time || '17:00';
  $('editTaskEstimate').value = task.estimativa_horas || ''; if ($('editTaskProject')) $('editTaskProject').value = task.projeto || ''; $('editTaskTags').value = (task.tags || []).join(', ');
  if ($('editTaskChecklist')) $('editTaskChecklist').value = checklistToText(task.checklist);
  populateDependencySelects('editTaskDependencies', task.id);
  setSelectedValues($('editTaskDependencies'), dependenciesForTask(task.id).map(item => item.depende_de_tarefa_id));
  const reminderOffset = task.lembrar_em && taskDue(task) ? Math.round((new Date(taskDue(task)) - new Date(task.lembrar_em)) / 60000) : '';
  $('editTaskReminderOffset').value = ['0', '10', '30', '60', '1440'].includes(String(reminderOffset)) ? String(reminderOffset) : '';
  syncTaskFormVisuals('editTask');
  $('editTaskModal').classList.remove('hidden'); refreshIcons();
}
async function saveEditedTask(event) {
  event.preventDefault(); setLoading(true);
  try {
    const taskId = $('editTaskId').value;
    const originalAssignee = $('editTaskAssignee').dataset.originalValue || '';
    const desiredAssignee = $('editTaskAssignee').value || '';
    const date = $('editTaskDueDate').value; const dueAt = date ? localDateTime(date, $('editTaskDueTime').value || '17:00') : null;
    const offset = $('editTaskReminderOffset').value; const remindAt = dueAt && offset !== '' ? new Date(new Date(dueAt).getTime() - Number(offset) * 60000).toISOString() : null;
    const priority = $('editTaskPriority').value;
    const alertAll = priority === 'imediata' && $('editTaskAlertAll')?.value === 'true';
    const { error } = await db.rpc('editar_tarefa_v4', {
      p_tarefa_id: taskId, p_titulo: $('editTaskTitle').value.trim(), p_descricao: $('editTaskDescription').value.trim() || null,
      p_prioridade: priority, p_responsavel_id: originalAssignee || null, p_prazo_em: dueAt,
      p_lembrar_em: remindAt, p_tags: $('editTaskTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
      p_tamanho: $('editTaskSize').value, p_estimativa_horas: $('editTaskEstimate').value ? Number($('editTaskEstimate').value) : null,
      p_alerta_para_todos: alertAll, p_projeto: $('editTaskProject')?.value.trim() || null,
      p_checklist: checklistFromText($('editTaskChecklist')?.value || ''), p_dependencias: selectedValues($('editTaskDependencies'))
    });
    if (error) throw error;
    if (desiredAssignee !== originalAssignee) {
      if (!desiredAssignee) throw new Error('Para retirar um responsável, use o painel da demanda. Transferências precisam ter um destino.');
      const { error: transferError } = await db.rpc('transferir_tarefa', { p_tarefa_id: taskId, p_novo_responsavel_id: desiredAssignee, p_observacao: 'Responsável alterado durante a edição da demanda.' });
      if (transferError) throw transferError;
    }
    closeModal('editTaskModal'); await refreshData(); await openTask(taskId); await dispatchPendingPush(); toast('Demanda atualizada.');
  } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
}
async function updateTaskStatus(taskId, status) {
  const task = state.tasks.find(item => item.id === taskId);
  if (status === 'concluida') {
    if (!isManager()) return toast('Envie a demanda para avaliação. Somente um gestor pode aprovar a conclusão.', 'error');
    if (task?.status !== 'revisao') return toast('A demanda precisa estar em revisão antes da aprovação final.', 'error');
    return openTaskEvaluation(taskId);
  }
  setLoading(true);
  try {
    const { error } = await db.rpc('atualizar_status', { p_tarefa_id: taskId, p_status: status });
    if (error) throw error;
    await refreshData(); if (!$('taskDrawer').classList.contains('hidden')) await openTask(taskId); await dispatchPendingPush();
    toast(status === 'revisao' ? 'Demanda enviada para avaliação do gestor.' : 'Status atualizado.');
  } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
}
async function updateTaskAssignee(taskId, personId) {
  setLoading(true); try { const { error } = await db.rpc('atribuir_tarefa', { p_tarefa_id: taskId, p_responsavel_id: personId }); if (error) throw error; await refreshData(); await openTask(taskId); await dispatchPendingPush(); toast('Responsável atualizado.'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
}
async function addComment(event) {
  event.preventDefault(); const text = $('drawerCommentText').value.trim(); if (!text) return;
  try { const { error } = await db.rpc('adicionar_comentario', { p_tarefa_id: state.selectedTask.id, p_texto: text }); if (error) throw error; await openTask(state.selectedTask.id); await dispatchPendingPush(); toast('Comentário adicionado.'); } catch (error) { toast(errorMessage(error), 'error'); }
}
async function archiveTask() {
  if (!confirm('Arquivar esta demanda? Ela poderá ser restaurada depois.')) return;
  setLoading(true); try { const { error } = await db.rpc('arquivar_tarefa', { p_tarefa_id: state.selectedTask.id }); if (error) throw error; closeDrawer('taskDrawer'); await refreshData(); toast('Demanda arquivada.'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
}
async function restoreTask() {
  setLoading(true); try { const { error } = await db.rpc('restaurar_tarefa', { p_tarefa_id: state.selectedTask.id }); if (error) throw error; closeDrawer('taskDrawer'); await refreshData(); toast('Demanda restaurada.'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
}

function openReminder(reminderId) {
  const reminder = state.reminders.find(item => item.id === reminderId); if (!reminder) return;
  state.selectedReminder = reminder; state.selectedTask = null;
  $('taskDrawerKicker').textContent = reminder.tipo === 'compromisso' ? 'Compromisso' : 'Lembrete'; $('taskDrawerTitle').textContent = reminder.titulo;
  const isOwner = reminder.colaborador_id === state.me.id || reminder.criado_por === state.me.id || isManager();
  $('taskDrawerContent').innerHTML = `<div class="detail-banner"><p>${escapeHtml(reminder.descricao || 'Sem observações.')}</p><div class="detail-tags"><span class="detail-tag">${reminder.tipo === 'compromisso' ? 'Compromisso' : 'Lembrete'}</span><span class="detail-tag">${RECURRENCE[reminder.recorrencia]}</span><span class="detail-tag">${reminder.visibilidade === 'equipe' ? 'Equipe' : 'Pessoal'}</span></div></div>
    <div class="detail-grid"><div class="detail-field"><label>Data e horário</label><strong>${formatDateTime(reminder.inicio_em)}</strong></div><div class="detail-field"><label>Aviso programado</label><strong>${formatDateTime(reminder.adiado_ate || reminder.lembrar_em)}</strong></div>${reminder.fim_em ? `<div class="detail-field"><label>Término</label><strong>${formatDateTime(reminder.fim_em)}</strong></div>` : ''}<div class="detail-field"><label>Situação</label><strong>${reminder.concluido_em ? 'Concluído' : 'Pendente'}</strong></div></div>
    <div class="drawer-footer-actions">${!reminder.concluido_em && isOwner ? `<button id="snoozeReminderBtn" class="btn secondary"><i data-lucide="alarm-clock-plus"></i>Adiar 10 min</button><button id="completeReminderBtn" class="btn primary"><i data-lucide="check"></i>Concluir</button>` : ''}${isOwner ? `<button id="editReminderBtn" class="btn secondary"><i data-lucide="pencil"></i>Editar</button><button id="deleteReminderBtn" class="btn danger-soft"><i data-lucide="trash-2"></i>Excluir</button>` : ''}</div>`;
  $('snoozeReminderBtn')?.addEventListener('click', () => snoozeReminder(reminder.id, 10)); $('completeReminderBtn')?.addEventListener('click', () => completeReminder(reminder.id));
  $('editReminderBtn')?.addEventListener('click', () => { closeDrawer('taskDrawer'); openQuickAdd(reminder.tipo, { editingReminderId: reminder.id, reminder }); });
  $('deleteReminderBtn')?.addEventListener('click', () => deleteReminder(reminder.id)); openDrawer('taskDrawer'); markNotificationsForTarget('reminder', reminder.id); refreshIcons();
}
async function snoozeReminder(id, minutes) { setLoading(true); try { const { error } = await db.rpc('adiar_lembrete', { p_id: id, p_minutos: minutes }); if (error) throw error; closeDrawer('taskDrawer'); await refreshData(); toast(`Lembrete adiado por ${minutes} minutos.`); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); } }
async function completeReminder(id) { setLoading(true); try { const { error } = await db.rpc('concluir_lembrete', { p_id: id }); if (error) throw error; closeDrawer('taskDrawer'); await refreshData(); toast('Lembrete concluído.'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); } }
async function deleteReminder(id) { if (!confirm('Excluir este item da agenda?')) return; setLoading(true); try { const { error } = await db.rpc('excluir_lembrete', { p_id: id }); if (error) throw error; closeDrawer('taskDrawer'); await refreshData(); toast('Item excluído.'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); } }

function openDrawer(id) { $(id).classList.remove('hidden'); $('drawerBackdrop').classList.remove('hidden'); refreshIcons(); }
function closeDrawer(id) { $(id).classList.add('hidden'); if ($$('.right-drawer:not(.hidden)').length === 0) $('drawerBackdrop').classList.add('hidden'); }
async function markNotificationsForTarget(type, id) {
  const matches = state.notifications.filter(n => !n.lida && (type === 'task' ? n.tarefa_id === id : n.lembrete_id === id));
  await Promise.all(matches.map(n => db.rpc('marcar_notificacao_lida', { p_id: n.id })));
  matches.forEach(n => { n.lida = true; }); renderNotifications();
}
async function markAllRead() { const { error } = await db.rpc('marcar_todas_notificacoes_lidas'); if (error) return toast(errorMessage(error), 'error'); state.notifications.forEach(item => { item.lida = true; }); renderNotifications(); toast('Notificações marcadas como lidas.'); }

function openProfile(required = false) {
  $('profileName').value = state.me?.nome || ''; $('profileJob').value = state.me?.cargo || '';
  $('profileAvatar').innerHTML = avatarHTML(state.me, 'lg'); $('profilePreviewName').textContent = state.me?.nome || 'Seu nome'; $('profilePreviewJob').textContent = state.me?.cargo || 'Marketing';
  $('profileCloseBtn').classList.toggle('hidden', required); $('profileModal').dataset.required = required ? '1' : '0'; $('profileModal').classList.remove('hidden'); refreshIcons();
}
async function saveProfile(event) {
  event.preventDefault(); setLoading(true); try { const { data, error } = await db.rpc('atualizar_meu_perfil', { p_nome: $('profileName').value.trim(), p_cargo: $('profileJob').value.trim() || null }); if (error) throw error; state.me = data; $('profileModal').dataset.required = '0'; closeModal('profileModal'); await loadCollaborators(); renderAll(); toast('Perfil atualizado.'); setTimeout(() => maybeOpenOnboarding(), 350); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
}

async function updatePushStatus() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) return renderPushStatus('unsupported');
  try {
    const registration = await navigator.serviceWorker.register('/sw.js'); state.pushSubscription = await registration.pushManager.getSubscription();
    renderPushStatus(Notification.permission === 'denied' ? 'blocked' : state.pushSubscription ? 'active' : 'inactive');
  } catch (error) { console.warn('[push status]', error); renderPushStatus('inactive'); }
}
function renderPushStatus(status) {
  const active = status === 'active'; $('pushStatusLabel').textContent = active ? 'Alertas ativados' : status === 'blocked' ? 'Alertas bloqueados' : 'Configurar alertas';
  $('notificationStatusIcon').classList.toggle('active', active); $('notificationStatusIcon').innerHTML = `<i data-lucide="${active ? 'bell-ring' : 'bell-off'}"></i>`;
  $('notificationStatusTitle').textContent = active ? 'Notificações ativadas' : status === 'blocked' ? 'Permissão bloqueada' : status === 'unsupported' ? 'Navegador incompatível' : 'Notificações desativadas';
  $('notificationStatusText').textContent = active ? 'Este computador receberá alertas de demandas e lembretes.' : status === 'blocked' ? 'Libere as notificações nas configurações do navegador.' : 'Ative para receber lembretes mesmo com a aba fechada.';
  $('enablePushBtn').classList.toggle('hidden', active || status === 'unsupported'); $('testPushBtn').classList.toggle('hidden', !active); $('disablePushBtn').classList.toggle('hidden', !active); refreshIcons();
}
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Este navegador não suporta notificações.', 'error');
  try {
    const registration = await navigator.serviceWorker.register('/sw.js'); const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('A permissão de notificações não foi concedida.');
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    const json = subscription.toJSON(); const { error } = await db.rpc('registrar_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth }); if (error) throw error;
    state.pushSubscription = subscription; renderPushStatus('active'); toast('Notificações ativadas neste computador.');
  } catch (error) { toast(errorMessage(error), 'error'); await updatePushStatus(); }
}
async function disablePush() {
  try {
    const subscription = state.pushSubscription; if (subscription) { const endpoint = subscription.endpoint; await subscription.unsubscribe(); await db.rpc('remover_push_subscription', { p_endpoint: endpoint }); }
    state.pushSubscription = null; renderPushStatus('inactive'); toast('Notificações desativadas neste computador.');
  } catch (error) { toast(errorMessage(error), 'error'); }
}
async function testPush() {
  try { const registration = await navigator.serviceWorker.ready; await registration.showNotification('PMG Connect · Teste', { body: 'As notificações estão funcionando neste computador.', icon: '/imagenssite/pmglogo.png', badge: '/imagenssite/pmglogo.png', tag: 'pmg-test', data: { url: '/demandas.html' } }); } catch (error) { toast(errorMessage(error), 'error'); }
}
function urlBase64ToUint8Array(base64String) { const padding = '='.repeat((4 - base64String.length % 4) % 4); const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(base64); return Uint8Array.from([...raw].map(char => char.charCodeAt(0))); }
async function dispatchPendingPush() {
  const token = state.session?.access_token; if (!token) return;
  try { const response = await fetch('/api/notificar-demandas', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); if (!response.ok) console.warn('[push dispatcher]', await response.text()); } catch (error) { console.warn('[push dispatcher]', error); }
}




/* =========================================================
   V3.4.6 — ESTABILIDADE DE OVERLAYS / SCROLL
   ========================================================= */
const UI_OVERLAY_VISIBLE_SELECTOR = [
  '.modal-layer:not(.hidden)',
  '.onboarding-layer:not(.hidden)',
  '.intrusive-notification-layer:not(.hidden)',
  '.right-drawer:not(.hidden)'
].join(',');

let uiOverlayLocked = false;
let uiOverlayScrollY = 0;

function lockPageBehindOverlay() {
  if (uiOverlayLocked) return;
  uiOverlayLocked = true;
  uiOverlayScrollY = window.scrollY || window.pageYOffset || 0;

  // Não desloca o body. O antigo position:fixed + top negativo fazia
  // overlays descendentes acompanharem a posição do documento no Chrome.
  document.documentElement.classList.add('ui-overlay-open');
  document.body.classList.add('ui-overlay-open');
}

function unlockPageBehindOverlay() {
  if (!uiOverlayLocked) return;
  uiOverlayLocked = false;

  const restoreY = uiOverlayScrollY;
  document.documentElement.classList.remove('ui-overlay-open');
  document.body.classList.remove('ui-overlay-open');

  // Overflow hidden não deve alterar a posição, mas preservamos o ponto
  // original caso algum navegador tente reposicionar o documento.
  requestAnimationFrame(() => {
    if (Math.abs((window.scrollY || 0) - restoreY) > 1) {
      window.scrollTo({ top: restoreY, left: 0, behavior: 'auto' });
    }
  });
}

function syncOverlayScrollLock() {
  const open = Boolean(document.querySelector(UI_OVERLAY_VISIBLE_SELECTOR));
  if (open) lockPageBehindOverlay();
  else unlockPageBehindOverlay();
}

function initOverlayStability() {
  syncOverlayScrollLock();

  const observer = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.type === 'attributes' && mutation.attributeName === 'class')) {
      requestAnimationFrame(syncOverlayScrollLock);
    }
  });

  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  // O alerta invasivo nunca deve usar a roda do mouse para deslocar a camada/cartão.
  // A roda só é aceita dentro do corpo rolável do próprio alerta.
  const intrusiveLayer = $('intrusiveNotificationModal');
  intrusiveLayer?.addEventListener('wheel', event => {
    const scrollArea = event.target.closest('.intrusive-notification-body');

    // A roda nunca pode mover o documento ou a camada do alerta.
    if (!scrollArea) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const delta = event.deltaY;
    const atTop = scrollArea.scrollTop <= 0;
    const atBottom = Math.ceil(scrollArea.scrollTop + scrollArea.clientHeight) >= scrollArea.scrollHeight;

    if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
      event.preventDefault();
    }
    event.stopPropagation();
  }, { passive: false });

  intrusiveLayer?.addEventListener('touchmove', event => {
    if (!event.target.closest('.intrusive-notification-body')) {
      event.preventDefault();
    }
    event.stopPropagation();
  }, { passive: false });

  // Em modais comuns, impede a roda no backdrop de movimentar a página atrás.
  $$('.modal-layer').forEach(layer => {
    layer.addEventListener('wheel', event => {
      if (event.target === layer) event.preventDefault();
    }, { passive: false });
  });
}

/* =========================================================
   ALERTAS INVASIVOS EM TELA
   ========================================================= */
const INTRUSIVE_NOTIFICATION_TYPES = {
  nova_tarefa: { label: 'Nova demanda recebida', icon: 'clipboard-plus', tone: 'blue', action: 'Abrir demanda' },
  demanda_imediata: { label: 'DEMANDA IMEDIATA', icon: 'siren', tone: 'immediate', action: 'ABRIR AGORA' },
  prazo_proximo: { label: 'Prazo próximo', icon: 'clock-alert', tone: 'amber', action: 'Ver prazo' },
  prazo_atrasado: { label: 'Demanda atrasada', icon: 'triangle-alert', tone: 'red', action: 'Resolver agora' },
  prazo_alterado: { label: 'Prazo alterado', icon: 'calendar-cog', tone: 'amber', action: 'Ver alteração' },
  comentario: { label: 'Novo comentário', icon: 'message-circle-more', tone: 'purple', action: 'Abrir conversa' },
  status_mudou: { label: 'Status atualizado', icon: 'refresh-cw', tone: 'green', action: 'Ver demanda' },
  avaliacao_pendente: { label: 'Avaliação necessária', icon: 'scan-eye', tone: 'purple', action: 'Avaliar demanda' },
  avaliacao_aprovada: { label: 'Conclusão aprovada', icon: 'badge-check', tone: 'green', action: 'Ver demanda' },
  avaliacao_ajustes: { label: 'Ajustes solicitados', icon: 'undo-2', tone: 'amber', action: 'Ver ajustes' },
  transferencia: { label: 'Demanda transferida', icon: 'arrow-right-left', tone: 'blue', action: 'Abrir demanda' },
  lembrete: { label: 'Lembrete programado', icon: 'alarm-clock', tone: 'green', action: 'Abrir lembrete' }
};

function intrusiveSessionKey(notificationId) {
  return `pmg-intrusive-notification:${state.me?.id || 'usuario'}:${notificationId}`;
}

function intrusiveWasDismissed() {
  // O adiamento vale apenas enquanto esta página permanece aberta.
  // Em um novo acesso, notificações ainda não lidas voltam a aparecer.
  return false;
}

function intrusiveMarkDismissed() {}


function notificationActivityType(notificationType) {
  return ({ nova_tarefa: 'criada', demanda_imediata: 'criada', comentario: 'comentario', status_mudou: 'status', prazo_alterado: 'editada', transferencia: 'transferida', avaliacao_pendente: 'status', avaliacao_aprovada: 'avaliacao', avaliacao_ajustes: 'avaliacao' })[notificationType] || '';
}

function resolveNotificationActor(notification) {
  if (!notification?.tarefa_id) return null;
  const task = state.tasks.find(item => item.id === notification.tarefa_id);
  const expectedType = notificationActivityType(notification.tipo);
  const notificationTime = new Date(notification.criado_em || Date.now()).getTime();
  const candidates = state.activities
    .filter(activity => activity.tarefa_id === notification.tarefa_id && (!expectedType || activity.tipo === expectedType) && activity.ator)
    .map(activity => ({ activity, distance: Math.abs(new Date(activity.criado_em).getTime() - notificationTime) }))
    .sort((a, b) => a.distance - b.distance);
  if (candidates[0] && candidates[0].distance <= 45 * 60000) return candidates[0].activity.ator;
  if (['nova_tarefa', 'demanda_imediata'].includes(notification.tipo) && task?.criado_por) return collaborator(task.criado_por) || null;
  return null;
}

function intrusiveNotificationData(notification) {
  let config = INTRUSIVE_NOTIFICATION_TYPES[notification.tipo] || { label: 'Atualização importante', icon: 'bell-ring', tone: 'blue', action: 'Abrir agora' };
  const task = notification.tarefa_id ? state.tasks.find(item => item.id === notification.tarefa_id) : null;
  const isImmediate = notification.tipo === 'demanda_imediata' || task?.prioridade === 'imediata';
  if (isImmediate) config = { label: 'DEMANDA IMEDIATA', icon: 'siren', tone: 'immediate', action: 'ABRIR AGORA' };
  const reminder = notification.lembrete_id ? state.reminders.find(item => item.id === notification.lembrete_id) : null;
  const actor = resolveNotificationActor(notification);
  const title = task?.titulo || reminder?.titulo || notification.tarefa?.titulo || notification.lembrete?.titulo || 'Atualização no PMG Connect';
  const message = notification.mensagem || NOTIFICATION_TEXT[notification.tipo] || (reminder ? 'Há um item da sua agenda pedindo atenção.' : 'Há uma atualização importante na Central de Demandas.');
  const meta = [];

  if (task) {
    meta.push({ icon: 'flag', label: 'Prioridade', value: PRIORITY[task.prioridade] || 'Média', tone: task.prioridade || 'media' });
    meta.push({ icon: 'calendar-clock', label: 'Prazo', value: dueLabel(task), tone: dueClass(task) || '' });
    meta.push({ icon: STATUS[task.status]?.icon || 'circle-dot', label: 'Status', value: STATUS[task.status]?.label || task.status || 'Nova', tone: task.status || '' });
  } else if (reminder) {
    meta.push({ icon: 'calendar-days', label: 'Quando', value: formatDateTime(reminder.inicio_em), tone: '' });
    meta.push({ icon: reminder.tipo === 'compromisso' ? 'calendar-clock' : 'bell-ring', label: 'Tipo', value: reminder.tipo === 'compromisso' ? 'Compromisso' : 'Lembrete', tone: '' });
    meta.push({ icon: 'repeat-2', label: 'Recorrência', value: RECURRENCE[reminder.recorrencia] || 'Não repete', tone: '' });
  } else {
    meta.push({ icon: 'clock-3', label: 'Recebida', value: formatDateTime(notification.criado_em), tone: '' });
  }

  return { config, task, reminder, actor, title, message, meta, isImmediate };
}

const NOTIFICATION_SOUND_PREF_KEY = 'pmg-notification-sounds-enabled';
let notificationAudioContext = null;
let notificationAudioUnlocked = false;

function notificationSoundsEnabled() {
  return localStorage.getItem(NOTIFICATION_SOUND_PREF_KEY) !== '0';
}

function setNotificationSoundsEnabled(enabled) {
  localStorage.setItem(NOTIFICATION_SOUND_PREF_KEY, enabled ? '1' : '0');
  const toggle = $('notificationSoundEnabled');
  if (toggle) toggle.checked = enabled;
}

function getNotificationAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!notificationAudioContext || notificationAudioContext.state === 'closed') {
    notificationAudioContext = new AudioContextClass();
  }
  return notificationAudioContext;
}

async function unlockNotificationAudio() {
  if (notificationAudioUnlocked) return;
  try {
    const context = getNotificationAudioContext();
    if (!context) return;
    if (context.state === 'suspended') await context.resume();
    notificationAudioUnlocked = context.state === 'running';
  } catch (_) {}
}

function scheduleTone_(context, {
  frequency = 680,
  when = 0,
  duration = .16,
  gain = .09,
  type = 'sine',
  endFrequency = null
} = {}) {
  const now = context.currentTime + when;
  const oscillator = context.createOscillator();
  const volume = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);

  volume.gain.setValueAtTime(.0001, now);
  volume.gain.exponentialRampToValueAtTime(Math.max(.001, gain), now + .018);
  volume.gain.exponentialRampToValueAtTime(.0001, now + duration);

  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + .025);
}

function playNotificationSound(level = 'normal', { force = false } = {}) {
  if (!force && !notificationSoundsEnabled()) return;

  try {
    const context = getNotificationAudioContext();
    if (!context) return;

    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }

    // CRÍTICA: sirene curta alternada, perceptível e impossível de confundir.
    if (level === 'critica') {
      [0,.13,.26,.39,.58,.71,.84,.97].forEach((offset,index) => {
        scheduleTone_(context,{
          frequency:index % 2 ? 980 : 620,
          endFrequency:index % 2 ? 760 : 860,
          when:offset,
          duration:.12,
          gain:.13,
          type:index % 2 ? 'square' : 'sawtooth'
        });
      });
      try { navigator.vibrate?.([200,70,200,70,350]); } catch (_) {}
      return;
    }

    // IMPORTANTE: três batidas ascendentes.
    if (level === 'importante') {
      [
        [0,540],[.16,690],[.32,860]
      ].forEach(([when,frequency]) => scheduleTone_(context,{
        frequency,when,duration:.15,gain:.105,type:'triangle'
      }));
      try { navigator.vibrate?.([120,60,120]); } catch (_) {}
      return;
    }

    // INFORMATIVA: dois tons macios e descendentes.
    if (level === 'informativa') {
      scheduleTone_(context,{frequency:720,when:0,duration:.13,gain:.055,type:'sine'});
      scheduleTone_(context,{frequency:570,when:.15,duration:.17,gain:.045,type:'sine'});
      return;
    }

    // NORMAL: "ping" rápido de duas notas.
    scheduleTone_(context,{frequency:660,when:0,duration:.11,gain:.07,type:'sine'});
    scheduleTone_(context,{frequency:880,when:.11,duration:.13,gain:.065,type:'sine'});
  } catch (_) {}
}

function playIntrusiveNotificationSound(tone = 'blue') {
  const level = tone === 'immediate' || tone === 'red'
    ? 'critica'
    : tone === 'amber' || tone === 'purple'
      ? 'importante'
      : 'normal';
  playNotificationSound(level);
}

function playNotificationArrivalSound(notification) {
  if (!notification || document.hidden) return;
  const level = notificationLevel(notification);
  if (['critica','importante'].includes(level)) return; // o popup invasivo toca o som
  playNotificationSound(level);
}

function syncNotificationSoundUI() {
  const enabled = notificationSoundsEnabled();
  const toggle = $('notificationSoundEnabled');
  if (toggle) toggle.checked = enabled;
}

function renderIntrusiveNotification(notification) {
  const data = intrusiveNotificationData(notification);
  const card = $('intrusiveNotificationCard');
  card.className = `intrusive-notification-card tone-${data.config.tone} ${data.isImmediate ? 'is-immediate' : ''}`;
  $('intrusiveNotificationIcon').innerHTML = `<i data-lucide="${data.config.icon}"></i>`;
  $('intrusiveNotificationType').textContent = data.config.label;
  $('intrusiveNotificationTitle').textContent = data.title;
  $('intrusiveNotificationMessage').textContent = data.message;
  $('intrusiveNotificationCounter').textContent = `1 de ${1 + state.intrusiveQueue.length}`;
  $('intrusiveNotificationOpenBtn').innerHTML = `<span>${escapeHtml(data.config.action)}</span><i data-lucide="arrow-up-right"></i>`;
  $('intrusiveNotificationLaterBtn')?.classList.toggle('hidden', data.isImmediate);
  if ($('intrusiveNotificationWarningText')) $('intrusiveNotificationWarningText').textContent = data.isImmediate ? 'Demanda imediata: este alerta permanece bloqueante até você abrir a solicitação.' : 'Este aviso não some sozinho. Abra agora ou escolha ver depois.';

  $('intrusiveNotificationActor').innerHTML = data.actor
    ? `${avatarHTML(data.actor, 'md')}<div><span>Atualização feita por</span><strong>${escapeHtml(data.actor.nome)}</strong><small>${escapeHtml(data.actor.cargo || 'Marketing')}</small></div>`
    : `<span class="intrusive-system-avatar"><i data-lucide="sparkles"></i></span><div><span>Origem do alerta</span><strong>PMG Connect</strong><small>Atualização automática do sistema</small></div>`;

  $('intrusiveNotificationMeta').innerHTML = data.meta.map(item => `<div class="intrusive-meta-card ${escapeHtml(item.tone)}"><span><i data-lucide="${item.icon}"></i>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join('');
  refreshIcons();
}

function maybeShowNextIntrusiveNotification() {
  if (state.intrusiveActive || !state.intrusiveQueue.length || document.hidden) return;
  if (!$('intrusiveNotificationModal') || !$('intrusiveNotificationModal').classList.contains('hidden')) return;
  if ($('onboardingModal') && !$('onboardingModal').classList.contains('hidden')) return;
  if ($('profileModal') && !$('profileModal').classList.contains('hidden') && $('profileModal').dataset.required === '1') return;

  const notification = state.intrusiveQueue.shift();
  if (!notification || notification.lida) return maybeShowNextIntrusiveNotification();
  state.intrusiveActive = notification;
  state.intrusiveShownIds.add(notification.id);
  renderIntrusiveNotification(notification);
  $('intrusiveNotificationModal').classList.remove('hidden');
  document.body.classList.add('intrusive-notification-open');
  playIntrusiveNotificationSound(intrusiveNotificationData(notification).config.tone || 'blue');
  setTimeout(() => $('intrusiveNotificationOpenBtn')?.focus(), 80);
}

function enqueueIntrusiveNotification(notification) {
  if (!notification?.id || notification.lida || intrusiveWasDismissed(notification.id)) return;
  if (!['critica','importante'].includes(notificationLevel(notification))) return;
  if (state.intrusiveActive?.id === notification.id || state.intrusiveShownIds.has(notification.id) || state.intrusiveQueue.some(item => item.id === notification.id)) return;
  state.intrusiveQueue.push(notification);
  maybeShowNextIntrusiveNotification();
}

function queueUnreadIntrusiveNotifications() {
  if (state.intrusiveBootstrapped) return;
  state.intrusiveBootstrapped = true;
  state.notifications.filter(item => !item.lida && ['critica','importante'].includes(notificationLevel(item))).slice(0, 20).forEach(enqueueIntrusiveNotification);
  maybeShowNextIntrusiveNotification();
}

function closeIntrusiveNotification() {
  $('intrusiveNotificationModal')?.classList.add('hidden');
  document.body.classList.remove('intrusive-notification-open');
  state.intrusiveActive = null;
  setTimeout(maybeShowNextIntrusiveNotification, 220);
}

async function markIntrusiveNotificationRead(notification) {
  if (!notification || notification.lida) return;
  const { error } = await db.rpc('marcar_notificacao_lida', { p_id: notification.id });
  if (error) throw error;
  notification.lida = true;
  const found = state.notifications.find(item => item.id === notification.id);
  if (found) found.lida = true;
  renderNotifications();
}

async function openIntrusiveNotification() {
  const notification = state.intrusiveActive;
  if (!notification) return;
  const button = $('intrusiveNotificationOpenBtn');
  button.disabled = true;
  try {
    await markIntrusiveNotificationRead(notification);
    closeIntrusiveNotification();
    if (notification.tarefa_id) await openTask(notification.tarefa_id);
    else if (notification.lembrete_id) openReminder(notification.lembrete_id);
    else openDrawer('notificationDrawer');
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    button.disabled = false;
  }
}

function postponeIntrusiveNotification() {
  const notification = state.intrusiveActive;
  if (!notification) return;
  intrusiveMarkDismissed(notification.id);
  closeIntrusiveNotification();
}

function setupRealtime() {
  if (state.realtime) db.removeChannel(state.realtime);
  const refreshDebounced = debounce(async () => { try { await loadAll(); renderAll(); } catch (error) { console.warn('[realtime refresh]', error); } }, 350);
  state.realtime = db.channel(`demandas-v2-${state.me.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lembretes' }, refreshDebounced)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comentarios' }, refreshDebounced)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atividades_tarefa' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'academia_reservas' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transferencias_tarefa' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dependencias_tarefa' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'registros_tempo' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'modelos_demanda' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fechamentos_mensais' }, refreshDebounced)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `colaborador_id=eq.${state.me.id}` }, async payload => {
      await loadNotifications();
      renderNotifications();
      const inserted = state.notifications.find(item => item.id === payload.new?.id);
      if (inserted) {
        enqueueIntrusiveNotification(inserted);
        playNotificationArrivalSound(inserted);
      }
      await dispatchPendingPush();
      refreshIcons();
    })
    .subscribe(status => {
      const online = status === 'SUBSCRIBED'; const failed = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status);
      $('realtimeDot').className = `live-dot ${online ? 'online' : failed ? 'offline' : ''}`; $('realtimeLabel').textContent = online ? 'Conectado' : failed ? 'Reconectando' : 'Conectando';
      $('connectionBanner').classList.toggle('hidden', !failed);
    });
}
async function refreshData() {
  await loadAll(); renderAll(); refreshIcons();
}

function parseQuickCapture(text) {
  const lower = text.toLowerCase(); let date = todayKey(); let time = '';
  if (/amanhã|amanha/.test(lower)) date = dateKey(addDays(new Date(), 1));
  const dateMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dateMatch) { const year = dateMatch[3] ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : new Date().getFullYear(); date = `${year}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`; }
  const timeMatch = lower.match(/(?:às|as|a)\s*(\d{1,2})(?::|h)?(\d{2})?\b/); if (timeMatch) time = `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2] || '00'}`;
  return { title: text.trim(), date, time: time || (state.quickCaptureType === 'lembrete' ? '09:00' : '17:00') };
}
function renderGlobalSearch() {
  const query = $('globalSearchInput').value.trim().toLowerCase();
  if (!query) { $('globalSearchResults').innerHTML = `<div class="empty-state" style="margin:8px"><i data-lucide="search"></i>Busque demandas, compromissos ou lembretes.</div>`; refreshIcons(); return; }
  const tasks = state.tasks.filter(task => [task.titulo, task.descricao, task.projeto, ...(task.tags || [])].join(' ').toLowerCase().includes(query)).slice(0, 8);
  const reminders = state.reminders.filter(item => [item.titulo, item.descricao].join(' ').toLowerCase().includes(query)).slice(0, 8);
  $('globalSearchResults').innerHTML = `${tasks.length ? `<div class="search-group-label">Demandas</div>${tasks.map(task => taskSearchResultHTML(task)).join('')}` : ''}${reminders.length ? `<div class="search-group-label">Agenda</div>${reminders.map(item => searchResultHTML('reminder', item.id, item.titulo, `${item.tipo === 'compromisso' ? 'Compromisso' : 'Lembrete'} · ${formatDateTime(item.inicio_em)}`, item.tipo === 'compromisso' ? 'calendar-clock' : 'bell')).join('')}` : ''}${!tasks.length && !reminders.length ? `<div class="empty-state" style="margin:8px"><i data-lucide="search-x"></i>Nenhum resultado encontrado.</div>` : ''}`; refreshIcons();
}
function searchResultHTML(type, id, title, meta, icon) { return `<button class="search-result" data-search-${type}="${id}"><span class="search-result-icon"><i data-lucide="${icon}"></i></span><span class="search-result-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(meta)}</span></span><i data-lucide="arrow-up-right"></i></button>`; }
function taskSearchResultHTML(task) { const person = collaborator(task.responsavel_id); return `<button class="search-result task-search-result" data-search-task="${task.id}"><span class="search-result-avatar">${taskAvatarHTML(person, task, 'sm')}</span><span class="search-result-copy"><strong>${escapeHtml(task.titulo)}</strong><span>${task.projeto ? `${escapeHtml(task.projeto)} · ` : ''}${escapeHtml(person?.nome || 'Sem responsável')} · ${escapeHtml(STATUS[task.status]?.label || task.status)} · ${escapeHtml(dueLabel(task))}</span></span><i data-lucide="arrow-up-right"></i></button>`; }
function openSearch() { $('searchModal').classList.remove('hidden'); $('globalSearchInput').value = ''; renderGlobalSearch(); setTimeout(() => $('globalSearchInput').focus(), 40); }
function closeSearch() { $('searchModal').classList.add('hidden'); }

async function handleUrlActions() {
  const params = new URLSearchParams(location.search);
  const task = params.get('tarefa');
  const reminder = params.get('lembrete');
  const snooze = params.get('adiar_lembrete');
  const complete = params.get('concluir_lembrete');
  if (snooze) { await snoozeReminder(snooze, 10); history.replaceState({}, '', '/demandas.html'); return; }
  if (complete) { await completeReminder(complete); history.replaceState({}, '', '/demandas.html'); return; }
  if (task) setTimeout(() => openTask(task), 250);
  if (reminder) setTimeout(() => openReminder(reminder), 250);
}
function openMobileSidebar() { $('sidebar').classList.add('open'); $('sidebarBackdrop').classList.remove('hidden'); }
function closeMobileSidebar() { $('sidebar').classList.remove('open'); $('sidebarBackdrop').classList.add('hidden'); }


/* =========================================================
   TUTORIAL DE PRIMEIRO ACESSO — GESTOR E COLABORADOR
   ========================================================= */
const ONBOARDING_VERSION = '2026-08-demandas-v3-operacao';

function onboardingStorageKey() {
  return `pmg-demandas-onboarding:${ONBOARDING_VERSION}:${state.me?.id || 'usuario'}`;
}

function onboardingDemoWindow(title, content, subtitle = '') {
  return `<div class="onboarding-demo-window">
    <div class="onboarding-demo-head"><i></i><i></i><i></i><div><span class="onboarding-demo-title">${escapeHtml(title)}</span>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}</div></div>
    ${content}
  </div>`;
}

function onboardingMetricsDemo(manager) {
  return onboardingDemoWindow(
    manager ? 'Painel gerencial' : 'Minha rotina',
    `<div class="onboarding-demo-metrics">
      <div class="onboarding-demo-metric danger"><strong>${manager ? '3' : '1'}</strong><span>Atrasadas</span></div>
      <div class="onboarding-demo-metric amber"><strong>${manager ? '7' : '2'}</strong><span>Para hoje</span></div>
      <div class="onboarding-demo-metric"><strong>${manager ? '18' : '4'}</strong><span>Próximos 7 dias</span></div>
      <div class="onboarding-demo-metric"><strong>${manager ? '26' : '6'}</strong><span>${manager ? 'Em aberto' : 'Minhas demandas'}</span></div>
    </div>`,
    manager ? 'Visão do setor' : 'Visão individual'
  );
}

function onboardingTaskFormDemo() {
  return onboardingDemoWindow('Criar demanda', `<div class="onboarding-form-demo">
    <label><span>Título</span><strong>Finalizar campanha de agosto</strong></label>
    <div class="onboarding-form-demo-grid"><label><span>Responsável</span><b>FM Francielly</b></label><label><span>Prazo</span><b>12 ago · 17h</b></label></div>
    <div class="onboarding-option-demo"><i class="urgent"></i><div><strong>Prioridade IMEDIATA</strong><small>O nível máximo pode disparar um alerta invasivo individual ou coletivo; sem responsável, a primeira pessoa que iniciar assume a demanda</small></div></div>
    <div class="onboarding-option-demo"><i class="medium"></i><div><strong>Tamanho médio</strong><small>Algumas horas de trabalho</small></div></div>
  </div>`, 'Briefing, responsabilidade e prazo');
}

function onboardingAssigneeDemo() {
  return onboardingDemoWindow('Escolher responsável', `<div class="onboarding-assignee-demo">
    <div class="onboarding-assignee-row selected"><span class="onboarding-person-avatar">FM</span><div><strong>Francielly</strong><small>4 abertas · 0 atrasadas · 8h estimadas</small></div><b>Equilibrada</b></div>
    <div class="onboarding-assignee-row"><span class="onboarding-person-avatar">GH</span><div><strong>Giovanni</strong><small>7 abertas · 2 atrasadas · 19h estimadas</small></div><b class="attention">Atenção</b></div>
    <div class="onboarding-assignee-row"><span class="onboarding-person-avatar">HS</span><div><strong>Henrique</strong><small>2 abertas · 0 atrasadas · 4h estimadas</small></div><b>Disponível</b></div>
  </div>`, 'Distribuição consciente da carga');
}

function onboardingStatusDemo(active = 'andamento', action = 'Enviar para avaliação') {
  const stages = [
    ['nova', 'circle-dot-dashed', 'Nova', 'Aguardando início'],
    ['andamento', 'loader-circle', 'Em andamento', 'Trabalho sendo executado'],
    ['revisao', 'scan-eye', 'Em revisão', 'Pronta para validação'],
    ['concluida', 'circle-check-big', 'Concluída', 'Entrega encerrada']
  ];
  return onboardingDemoWindow('Fluxo da demanda', `<div class="onboarding-status-flow">${stages.map(([key, icon, label, desc], index) => `<div class="onboarding-status-step ${key === active ? 'active' : ''}"><span><i data-lucide="${icon}"></i></span><div><strong>${label}</strong><small>${desc}</small></div><b>${index + 1}</b></div>`).join('')}</div><button class="onboarding-demo-action" type="button" tabindex="-1">${escapeHtml(action)}<i data-lucide="arrow-right"></i></button>`, 'Cada mudança fica registrada');
}

function onboardingTeamDemo() {
  return onboardingDemoWindow('Equipe', `<div class="onboarding-team-demo">
    <div class="onboarding-team-summary"><span><strong>5</strong><small>Pessoas</small></span><span><strong>26</strong><small>Em aberto</small></span><span><strong>3</strong><small>Atrasadas</small></span></div>
    <div class="onboarding-assignee-row"><span class="onboarding-person-avatar">FM</span><div><strong>Francielly</strong><small>8h em aberto · movimento hoje</small><div class="onboarding-load"><i style="width:36%"></i></div></div><b>Equilibrada</b></div>
    <div class="onboarding-assignee-row"><span class="onboarding-person-avatar">GH</span><div><strong>Giovanni</strong><small>19h em aberto · 2 atrasadas</small><div class="onboarding-load"><i class="warning" style="width:82%"></i></div></div><b class="attention">Atenção</b></div>
  </div>`, 'Carga, prazo e risco no mesmo lugar');
}

function onboardingReviewDemo() {
  return onboardingDemoWindow('Revisar entrega', `<div class="onboarding-review-demo">
    <div class="onboarding-review-head"><span><i data-lucide="scan-eye"></i></span><div><strong>Campanha pronta para validação</strong><small>Em revisão · enviada por Francielly</small></div></div>
    <div class="onboarding-comment-demo"><span class="onboarding-person-avatar">FM</span><div><strong>Francielly</strong><p>Artes e texto finalizados. A versão aprovada está anexada no briefing.</p></div></div>
    <div class="onboarding-review-actions"><button type="button" tabindex="-1">Pedir ajuste</button><button class="primary" type="button" tabindex="-1">Concluir</button></div>
  </div>`, 'Valide antes de encerrar');
}

function onboardingTodayDemo() {
  return onboardingDemoWindow('Hoje', `<div class="onboarding-demo-list">
    <div class="onboarding-demo-row"><span><i data-lucide="triangle-alert"></i></span><div><strong>Revisar campanha</strong><small>Atrasada desde ontem</small></div><b>Urgente</b></div>
    <div class="onboarding-demo-row"><span><i data-lucide="play"></i></span><div><strong>Editar vídeo institucional</strong><small>Em andamento · prazo 14h</small></div><b>Minha</b></div>
    <div class="onboarding-demo-row"><span><i data-lucide="bell"></i></span><div><strong>Enviar aprovação</strong><small>Lembrete às 16h</small></div><b>Aviso</b></div>
  </div>`, 'O que merece atenção agora');
}

function onboardingTaskDetailDemo() {
  return onboardingDemoWindow('Detalhes da demanda', `<div class="onboarding-detail-demo">
    <div class="onboarding-detail-title"><span class="priority-pill alta">Alta</span><strong>Editar vídeo institucional</strong></div>
    <p>Produzir versão vertical de até 45 segundos com abertura, depoimentos e encerramento da PMG.</p>
    <div class="onboarding-detail-grid"><span><small>Responsável</small><b>GV Giovanni</b></span><span><small>Prazo</small><b>Hoje · 17h</b></span><span><small>Estimativa</small><b>4 horas</b></span><span><small>Status</small><b>Em andamento</b></span></div>
  </div>`, 'Leia o briefing antes de começar');
}

function onboardingCommunicationDemo() {
  return onboardingDemoWindow('Comentários e histórico', `<div class="onboarding-history-demo">
    <div><span class="onboarding-person-avatar">GV</span><p><strong>Giovanni comentou</strong><small>“Preciso do logo em alta para finalizar.”</small></p><time>09:12</time></div>
    <div><span class="onboarding-history-icon"><i data-lucide="user-round-check"></i></span><p><strong>Responsável alterado</strong><small>Francielly → Giovanni</small></p><time>08:45</time></div>
    <div><span class="onboarding-history-icon"><i data-lucide="refresh-cw"></i></span><p><strong>Status atualizado</strong><small>Nova → Em andamento</small></p><time>08:31</time></div>
  </div>`, 'Contexto preservado na própria demanda');
}

function onboardingCalendarDemo() {
  return onboardingDemoWindow('Agenda e alertas', `<div class="onboarding-calendar"><div class="onboarding-calendar-day">04<div class="onboarding-calendar-event"></div></div><div class="onboarding-calendar-day active">05<div class="onboarding-calendar-event purple"></div><div class="onboarding-calendar-event"></div></div><div class="onboarding-calendar-day">06<div class="onboarding-calendar-event amber"></div></div><div class="onboarding-calendar-day">07<div class="onboarding-calendar-event"></div></div><div class="onboarding-calendar-day">08</div></div><div class="onboarding-alert-demo"><i data-lucide="bell-ring"></i><div><strong>Prazo em 30 minutos</strong><small>Editar vídeo institucional · hoje, 17h</small></div></div>`, 'Demandas, compromissos e lembretes');
}

function onboardingCompleteDemo(manager) {
  return `<div class="onboarding-complete"><div class="onboarding-complete-icon"><i data-lucide="${manager ? 'clipboard-check' : 'badge-check'}"></i></div><strong>${manager ? 'Sua gestão começa aqui' : 'Sua rotina está pronta'}</strong><span>${manager ? 'Crie a primeira demanda com briefing, responsável e prazo claros.' : 'Abra suas demandas, atualize o status e envie a entrega para avaliação quando estiver pronta.'}</span></div>`;
}

function getManagerOnboardingSteps(userName) {
  return [
    {
      icon: 'shield-check', eyebrow: 'Tutorial do gestor', title: `Bem-vindo, ${userName}. Você organiza o fluxo do setor.`,
      description: 'Como gestor, sua função na Central não é apenas criar tarefas. Você transforma pedidos em demandas claras, distribui o trabalho com responsabilidade, acompanha riscos e valida entregas. As telas e permissões abaixo foram pensadas para essa rotina.',
      points: [
        ['clipboard-plus', 'Criar com clareza', 'Toda demanda deve explicar o resultado esperado, o contexto necessário e o prazo real.'],
        ['users-round', 'Distribuir sem sobrecarregar', 'Use carga, atrasos e estimativas antes de escolher o responsável.'],
        ['scan-search', 'Acompanhar sem microgerenciar', 'Observe status, prazos e bloqueios; não dependa de cobrar atualização por mensagem.'],
        ['badge-check', 'Validar e encerrar', 'Toda conclusão passa pela avaliação de um gestor: aprovar encerra; pedir ajustes devolve ao responsável.']
      ],
      tip: ['compass', 'Seu ponto de partida', 'Use Hoje para enxergar urgências e Equipe para decidir onde novas demandas devem entrar.'],
      demo: onboardingMetricsDemo(true)
    },
    {
      icon: 'clipboard-plus', eyebrow: 'Criação de demandas', title: 'Transforme um pedido em uma demanda executável',
      description: 'Ao clicar em “Nova demanda”, registre informações suficientes para que o responsável consiga começar sem precisar reconstruir o pedido em uma conversa paralela. Título genérico, prazo sem contexto e prioridade “urgente” em tudo anulam o valor do sistema. Surpreendente, eu sei.',
      points: [
        ['text-cursor-input', 'Título orientado à entrega', 'Prefira “Criar carrossel da campanha X” a “Ver campanha”.'],
        ['file-text', 'Descrição com contexto', 'Inclua objetivo, formato, materiais disponíveis, aprovador e restrições importantes.'],
        ['calendar-clock', 'Prazo completo', 'Defina data e horário considerando revisão, aprovação e dependências.'],
        ['tags', 'Prioridade, tamanho e tags', 'Esses dados ajudam a ordenar a fila, estimar carga e localizar o trabalho depois.']
      ],
      tip: ['check-circle-2', 'Antes de criar', 'Pergunte: outra pessoa conseguiria executar essa demanda lendo apenas o que está registrado aqui?'],
      demo: onboardingTaskFormDemo()
    },
    {
      icon: 'user-round-search', eyebrow: 'Delegação', title: 'Escolha o responsável pelo trabalho, não apenas quem respondeu primeiro',
      description: 'O seletor visual mostra avatar, cargo, demandas abertas, atrasos e esforço estimado. Esses indicadores não substituem conversa e contexto, mas impedem que a distribuição seja feita às cegas, tradição administrativa que ninguém pediu para preservar.',
      points: [
        ['gauge', 'Considere a carga estimada', 'Horas e volume em aberto ajudam a identificar quem já está perto do limite.'],
        ['triangle-alert', 'Observe atrasos e prazos próximos', 'Uma pessoa com poucas tarefas pode estar concentrada em entregas críticas.'],
        ['badge-info', 'Use cargo e contexto', 'Delegue para quem possui domínio ou responsabilidade sobre aquela frente.'],
        ['repeat-2', 'Reatribua quando necessário', 'Se a responsabilidade mudar, atualize no sistema para manter histórico e clareza.']
      ],
      tip: ['scale', 'Boa distribuição', 'Equilibre capacidade, competência, urgência e continuidade do trabalho. Nenhum número isolado decide tudo.'],
      demo: onboardingAssigneeDemo()
    },
    {
      icon: 'workflow', eyebrow: 'Fluxo e status', title: 'Use o status como informação real, não decoração colorida',
      description: 'O status indica em que ponto a demanda está. O responsável move o trabalho até Em revisão; a partir daí, um gestor avalia a entrega. Aprovar encerra a demanda e pedir ajustes devolve o item para Em andamento com a orientação registrada.',
      points: [
        ['circle-dot-dashed', 'Nova', 'A demanda foi criada e ainda não começou. Briefing e responsabilidade devem estar definidos.'],
        ['loader-circle', 'Em andamento', 'O responsável iniciou a execução e o trabalho está ativo.'],
        ['scan-eye', 'Em revisão', 'O colaborador terminou sua parte e aguarda a avaliação obrigatória de um gestor.'],
        ['circle-check-big', 'Concluída', 'Somente aparece depois que um gestor aprova a entrega. A avaliação e eventual observação ficam no histórico.']
      ],
      tip: ['hand', 'Evite antecipar status', 'Não marque como concluída apenas para limpar o painel. O histórico precisa representar o trabalho de verdade.'],
      demo: onboardingStatusDemo('revisao', 'Aprovar ou pedir ajustes')
    },
    {
      icon: 'users-round', eyebrow: 'Painel da equipe', title: 'Encontre gargalos antes que virem urgência coletiva',
      description: 'A tela Equipe consolida carga estimada, atrasos, entregas da semana, atividade recente e risco por colaborador. Ela serve para orientar priorização, redistribuição e conversas de alinhamento, não para fabricar ranking de produtividade com três números e confiança excessiva.',
      points: [
        ['siren', 'Riscos e gargalos', 'Pessoas com atrasos, urgências ou carga elevada aparecem em destaque.'],
        ['clock-4', 'Carga estimada', 'O cálculo usa tamanho e horas registradas nas demandas abertas.'],
        ['activity', 'Movimentações recentes', 'Veja se o trabalho está avançando e onde não houve atualização.'],
        ['list-filter', 'Visão individual', 'Abra um colaborador para consultar fila, prazos, conclusões e histórico.']
      ],
      tip: ['message-circle', 'Indicador não é sentença', 'Use o painel para fazer perguntas melhores e ajustar prioridades, não para substituir conversa com a equipe.'],
      demo: onboardingTeamDemo()
    },
    {
      icon: 'scan-eye', eyebrow: 'Revisão e aprovação', title: 'A etapa de revisão protege a qualidade e o histórico',
      description: 'Quando uma demanda chega em “Em revisão”, abra o item, confira briefing, entrega, comentários e contexto. Aprove, peça ajustes com orientação objetiva ou devolva ao fluxo. O responsável precisa entender o que muda e por quê.',
      points: [
        ['file-check-2', 'Compare com o briefing', 'Valide o resultado esperado, formato, prazo e critérios registrados.'],
        ['message-square-text', 'Peça ajustes no comentário', 'Registre correções de forma específica para manter o contexto acessível.'],
        ['circle-check-big', 'Aprove após validar', 'O botão Aprovar e concluir é a única conclusão oficial do fluxo e alimenta os indicadores mensais.'],
        ['rotate-ccw', 'Reabra quando necessário', 'Se houver mudança relevante ou erro após a conclusão, devolva a demanda ao fluxo correto.']
      ],
      tip: ['history', 'Tudo fica registrado', 'Comentários, responsáveis e mudanças de status formam o histórico da demanda.'],
      demo: onboardingReviewDemo()
    },
    {
      icon: 'calendar-days', eyebrow: 'Planejamento', title: 'Use agenda, prazos e alertas para reduzir cobranças manuais',
      description: 'O Connect trabalha com dois calendários claros: a Agenda unificada, que alterna entre sua rotina e a visão da equipe, e a Academia PMG, dedicada exclusivamente à disponibilidade do espaço. A Academia também recebe solicitações importadas do Microsoft Forms.',
      points: [
        ['calendar-range', 'Dois calendários', 'Na Agenda, alterne entre Minha agenda e Equipe. A Academia PMG fica separada porque controla um recurso físico e reservas.'],
        ['alarm-clock', 'Lembretes programados', 'Defina quando o sistema deve avisar antes de um prazo ou compromisso.'],
        ['bell-ring', 'Notificações', 'Novas atribuições, comentários e mudanças importantes aparecem na central de alertas.'],
        ['refresh-cw', 'Recorrência', 'Use repetição para rotinas reais, evitando recriar o mesmo lembrete toda semana.']
      ],
      tip: ['monitor-check', 'Permissão do navegador', 'Os alertas dependem da autorização deste computador. Cada usuário precisa ativá-los no próprio navegador.'],
      demo: onboardingCalendarDemo()
    },
    {
      icon: 'messages-square', eyebrow: 'Governança do trabalho', title: 'Mantenha decisões e cobranças dentro da demanda',
      description: 'Comentários, histórico, busca e notificações existem para que o contexto não fique espalhado entre WhatsApp, memória e arqueologia de caixa de entrada. Quando uma decisão altera o trabalho, registre no item correspondente.',
      points: [
        ['message-circle', 'Comentários objetivos', 'Registre impedimentos, decisões, aprovações e orientações que afetam a entrega.'],
        ['history', 'Histórico automático', 'Criação, edição, responsável, status e arquivamento ficam documentados.'],
        ['search', 'Busca global', 'Use Ctrl + K para localizar rapidamente demandas e lembretes.'],
        ['archive', 'Arquivamento', 'Arquive itens que não devem permanecer no fluxo ativo, preservando o registro.']
      ],
      tip: ['ban', 'Evite duplicidade', 'Não crie uma nova demanda para cada comentário ou pequeno ajuste do mesmo trabalho. Atualize o item existente quando o escopo continuar sendo o mesmo.'],
      demo: onboardingCommunicationDemo()
    },
    {
      icon: 'clipboard-check', eyebrow: 'Checklist do gestor', title: 'Você está pronto para criar a primeira demanda',
      description: 'Comece com uma entrega real e simples. Preencha o briefing, escolha o responsável com base em contexto e carga, defina o prazo e acompanhe o fluxo sem retirar da equipe a responsabilidade de atualizar o próprio trabalho.',
      points: [
        ['check', 'Demanda clara', 'Título, descrição, prioridade, tamanho e prazo representam a necessidade real.'],
        ['check', 'Responsável correto', 'A pessoa escolhida sabe que recebeu a demanda e possui contexto para começar.'],
        ['check', 'Revisão combinada', 'Está claro quem valida a entrega e quando ela pode ser concluída.'],
        ['circle-help', 'Tutorial disponível', 'Abra novamente em Avatar → Ver tutorial sempre que precisar revisar o fluxo.']
      ],
      tip: ['rocket', 'Próxima ação', 'Feche o tutorial e clique em “Nova demanda” para iniciar o fluxo oficial da equipe.'],
      demo: onboardingCompleteDemo(true)
    }
  ];
}

function getCollaboratorOnboardingSteps(userName) {
  return [
    {
      icon: 'badge-check', eyebrow: 'Tutorial do colaborador', title: `Bem-vindo, ${userName}. Esta é a sua fila de trabalho.`,
      description: 'Como colaborador, você usa a Central para entender o que precisa fazer, organizar o dia, atualizar o andamento das entregas e registrar impedimentos. Seu papel é manter a demanda fiel ao trabalho real, sem depender de alguém perguntar a cada três horas se “já saiu”.',
      points: [
        ['sun', 'Planeje o dia', 'A tela Hoje reúne atrasos, prazos, agenda e lembretes que pedem atenção.'],
        ['clipboard-check', 'Leia antes de começar', 'Abra a demanda e confirme briefing, prazo, prioridade e resultado esperado.'],
        ['workflow', 'Atualize o status', 'Mova a demanda quando iniciar e envie para avaliação quando a entrega estiver pronta. A conclusão final é validada por um gestor.'],
        ['message-circle', 'Registre impedimentos', 'Use comentários para avisar dependências, dúvidas e decisões importantes.']
      ],
      tip: ['compass', 'Seu ponto de partida', 'Comece pela tela Hoje e depois abra Minhas demandas para enxergar toda a sua fila.'],
      demo: onboardingMetricsDemo(false)
    },
    {
      icon: 'sun', eyebrow: 'Rotina diária', title: 'A tela Hoje mostra o que merece sua atenção primeiro',
      description: 'A página reúne demandas atrasadas, entregas do dia, próximos prazos, lembretes e compromissos. Use essa visão para montar sua ordem de execução antes de abrir novas frentes. Trabalhar em tudo simultaneamente continua não sendo um método, apesar do entusiasmo coletivo.',
      points: [
        ['triangle-alert', 'Atrasadas', 'Revise imediatamente e registre o motivo ou impedimento dentro da demanda.'],
        ['clock-3', 'Para hoje', 'Confira horário, prioridade e esforço antes de decidir a ordem.'],
        ['calendar-range', 'Próximos 7 dias', 'Antecipe entregas maiores e dependências que exigem preparação.'],
        ['bell', 'Lembretes e agenda', 'Compromissos pessoais e avisos aparecem junto da sua linha do tempo.']
      ],
      tip: ['list-ordered', 'Priorize com contexto', 'Urgência, prazo, dependência e esforço importam mais do que a ordem em que as mensagens chegaram.'],
      demo: onboardingTodayDemo()
    },
    {
      icon: 'file-search-2', eyebrow: 'Entendimento da demanda', title: 'Abra o item e confirme o que precisa ser entregue',
      description: 'Antes de iniciar, confira descrição, prazo, prioridade, tamanho, tags, responsável e histórico. Se faltar material ou houver dúvida sobre o resultado, comente no item. Começar com briefing incompleto costuma economizar cinco minutos e desperdiçar duas horas, um negócio brilhante.',
      points: [
        ['file-text', 'Leia o briefing inteiro', 'Entenda objetivo, formato, público, materiais, restrições e aprovação esperada.'],
        ['calendar-clock', 'Confirme o prazo', 'Observe data e horário, especialmente quando existir revisão antes da entrega final.'],
        ['badge-alert', 'Entenda a prioridade', 'IMEDIATA é o nível máximo e exige ação naquele instante; urgente vem logo abaixo. Alta, média e baixa seguem o fluxo normal.'],
        ['circle-help', 'Pergunte no próprio item', 'Registre dúvidas para que a resposta permaneça junto da demanda.']
      ],
      tip: ['hand', 'Não adivinhe o briefing', 'Quando a informação necessária não estiver registrada, sinalize antes de executar.'],
      demo: onboardingTaskDetailDemo()
    },
    {
      icon: 'workflow', eyebrow: 'Atualização do trabalho', title: 'Mude o status no momento em que o trabalho realmente muda',
      description: 'O botão principal da demanda indica a próxima ação do fluxo. Atualizar o status permite que gestor e equipe acompanhem o andamento sem interromper você para pedir notícia. É uma troca bastante razoável: um clique por menos cobrança.',
      points: [
        ['play', 'Iniciar demanda', 'Ao começar a execução, mova de Nova para Em andamento.'],
        ['scan-eye', 'Enviar para avaliação', 'Quando a entrega estiver pronta, envie para Em revisão. A conclusão fica bloqueada até um gestor avaliar.'],
        ['badge-check', 'Aguardar a validação', 'Se o gestor aprovar, a demanda é concluída. Se pedir ajustes, ela volta para Em andamento com a observação.'],
        ['message-square-warning', 'Responder aos ajustes', 'Leia a observação do gestor, faça a correção e envie novamente para avaliação.']
      ],
      tip: ['timer-reset', 'Status desatualizado gera ruído', 'Não deixe “Nova” quando já começou nem “Em andamento” quando está aguardando revisão.'],
      demo: onboardingStatusDemo('andamento', 'Enviar para avaliação')
    },
    {
      icon: 'message-circle', eyebrow: 'Comunicação e impedimentos', title: 'Registre o que afeta a entrega dentro da demanda',
      description: 'Comentários servem para dúvidas, bloqueios, decisões, aprovações e atualizações que mudam o trabalho. O histórico registra automaticamente alterações de status e responsável. Assim, qualquer pessoa consegue entender o que aconteceu sem reconstruir a história em mensagens soltas.',
      points: [
        ['message-square-warning', 'Sinalize bloqueios cedo', 'Informe o que está impedindo o avanço e de quem depende a solução.'],
        ['paperclip', 'Referencie materiais', 'Indique links, arquivos ou locais onde os insumos estão disponíveis.'],
        ['history', 'Consulte o histórico', 'Veja quem alterou status, prazo, responsável ou detalhes da demanda.'],
        ['at-sign', 'Contexto objetivo', 'Escreva o suficiente para orientar a próxima ação, evitando comentários vagos como “ver isso”.']
      ],
      tip: ['message-square-more', 'Modelo útil de comentário', '“Estou aguardando o arquivo X de Y. Sem ele, o prazo estimado muda para Z.”'],
      demo: onboardingCommunicationDemo()
    },
    {
      icon: 'calendar-days', eyebrow: 'Prazos e organização pessoal', title: 'Use agenda e lembretes para proteger seu foco',
      description: 'Demandas com prazo aparecem na Agenda automaticamente. Você também pode criar lembretes pessoais e compromissos, escolher recorrência e ativar notificações neste computador. O objetivo é lembrar no momento certo, não decorar cada obrigação como se sua memória fosse um servidor corporativo.',
      points: [
        ['calendar-range', 'Planeje a semana', 'Abra datas futuras para identificar picos de entrega e organizar tarefas maiores.'],
        ['alarm-clock', 'Crie lembretes pessoais', 'Use avisos para revisões, retornos e pequenas ações que não precisam virar demanda.'],
        ['bell-ring', 'Ative notificações', 'Permita alertas no navegador para receber avisos de prazo e atribuição.'],
        ['repeat', 'Use recorrência com cuidado', 'Repita apenas rotinas reais, evitando encher a agenda de alertas ignorados.']
      ],
      tip: ['clock-alert', 'Prazo em risco', 'Se perceber que não conseguirá cumprir, comente na demanda antes do vencimento e explique o impedimento.'],
      demo: onboardingCalendarDemo()
    },
    {
      icon: 'circle-user-round', eyebrow: 'Responsabilidade e avatares', title: 'Os avatares identificam pessoas, não substituem informação',
      description: 'Seu avatar aparece nas demandas atribuídas a você, nos comentários, atividades, filtros e visão da equipe. Ele ajuda a reconhecer rapidamente quem é responsável por cada item. Cores e pequenos indicadores mostram contexto, mas o nome e o status continuam visíveis para evitar hieróglifos corporativos.',
      points: [
        ['user-round-check', 'Responsável principal', 'A pessoa exibida no item é quem responde pela condução daquela demanda.'],
        ['list-filter', 'Filtro por pessoa', 'Na tela Demandas, use os avatares para mostrar sua fila ou a de outro colaborador.'],
        ['messages-square', 'Identidade nos comentários', 'Cada atualização fica associada a quem a registrou.'],
        ['users-round', 'Visão da equipe', 'Consulte disponibilidade estimada para entender prioridades e possíveis apoios.']
      ],
      tip: ['arrow-right-left', 'Mudança de responsável', 'Se outra pessoa assumir o trabalho, o gestor deve reatribuir a demanda para manter a responsabilidade correta.'],
      demo: onboardingAssigneeDemo()
    },
    {
      icon: 'search-check', eyebrow: 'Boas práticas', title: 'Mantenha sua fila limpa, atualizada e compreensível',
      description: 'Use busca, filtros e histórico para localizar itens. Evite duplicar demandas, concluir trabalho incompleto ou deixar decisões importantes fora do sistema. O valor da Central depende da qualidade das atualizações, fenômeno irritante em que software algum consegue compensar totalmente a criatividade humana.',
      points: [
        ['search', 'Busque antes de criar contexto novo', 'Use Ctrl + K para encontrar demandas e lembretes existentes.'],
        ['copy-x', 'Evite duplicidades', 'Quando o ajuste pertence ao mesmo resultado, continue no item existente.'],
        ['badge-check', 'Envie para avaliação com responsabilidade', 'Verifique se a entrega está pronta e registre observações finais antes de pedir a validação do gestor.'],
        ['shield-alert', 'Não esconda atrasos', 'Atualize o item e sinalize o risco; status correto ajuda a equipe a reagir.']
      ],
      tip: ['refresh-cw', 'Atualização mínima saudável', 'Ao iniciar, bloquear, enviar para avaliação ou receber pedido de ajustes, atualize o status ou deixe um comentário.'],
      demo: onboardingTaskDetailDemo()
    },
    {
      icon: 'badge-check', eyebrow: 'Checklist do colaborador', title: 'Você está pronto para assumir suas primeiras demandas',
      description: 'Quando uma demanda for atribuída a você, ela aparecerá em Hoje e em Minhas demandas. Leia o briefing, organize o prazo, inicie o trabalho, registre impedimentos e envie para avaliação quando estiver pronto. Um gestor aprova a conclusão ou devolve com ajustes registrados.',
      points: [
        ['check', 'Entendi a entrega', 'Sei qual resultado é esperado, quais materiais existem e quem valida.'],
        ['check', 'Planejei o prazo', 'Considerei esforço, dependências e outras demandas da minha fila.'],
        ['check', 'Vou atualizar o fluxo', 'Mudarei o status, registrarei bloqueios e enviarei a entrega para avaliação quando estiver pronta.'],
        ['circle-help', 'Tutorial disponível', 'Abra novamente em Avatar → Ver tutorial sempre que precisar.']
      ],
      tip: ['rocket', 'Próxima ação', 'Feche o tutorial, abra Minhas demandas e confira se existe algum item atribuído a você.'],
      demo: onboardingCompleteDemo(false)
    }
  ];
}

function getOnboardingSteps() {
  const userName = firstName(state.me?.nome || 'você');
  return isManager() ? getManagerOnboardingSteps(userName) : getCollaboratorOnboardingSteps(userName);
}

function renderOnboardingStep() {
  const steps = getOnboardingSteps();
  const index = Math.max(0, Math.min(state.onboardingStep, steps.length - 1));
  state.onboardingStep = index;
  const step = steps[index];
  const manager = isManager();

  $('onboardingProgressText').textContent = `Passo ${index + 1} de ${steps.length}`;
  $('onboardingRoleBadge').textContent = manager ? 'Tutorial do gestor' : 'Tutorial do colaborador';
  $('onboardingRoleBadge').classList.toggle('manager', manager);
  $('onboardingEyebrow').textContent = step.eyebrow;
  $('onboardingTitle').textContent = step.title;
  $('onboardingDescription').textContent = step.description;
  $('onboardingIcon').innerHTML = `<i data-lucide="${step.icon}"></i>`;
  $('onboardingDemo').innerHTML = step.demo;
  $('onboardingPoints').innerHTML = step.points.map(([icon, title, detail]) => `<div class="onboarding-point"><span><i data-lucide="${icon}"></i></span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></div>`).join('');
  const [tipIcon, tipTitle, tipText] = step.tip || ['lightbulb', 'Dica', 'Use o tutorial como referência sempre que precisar.'];
  $('onboardingTip').innerHTML = `<span><i data-lucide="${tipIcon}"></i></span><div><strong>${escapeHtml(tipTitle)}</strong><p>${escapeHtml(tipText)}</p></div>`;
  $('onboardingStepDots').innerHTML = steps.map((_, dotIndex) => `<button type="button" class="${dotIndex === index ? 'active' : dotIndex < index ? 'done' : ''}" data-onboarding-step="${dotIndex}" aria-label="Ir para o passo ${dotIndex + 1}"></button>`).join('');
  $('onboardingBackBtn').classList.toggle('hidden', index === 0);
  $('onboardingNextBtn').innerHTML = index === steps.length - 1 ? `Entrar na Central<i data-lucide="check"></i>` : `Continuar<i data-lucide="arrow-right"></i>`;
  refreshIcons();
}

function maybeOpenOnboarding(force = false) {
  if (!state.me || !$('onboardingModal')) return;
  let completed = false;
  try { completed = localStorage.getItem(onboardingStorageKey()) === 'done'; } catch (_) {}
  if (!force && completed) return;
  state.onboardingStep = 0;
  renderOnboardingStep();
  $('onboardingModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeOnboarding(markCompleted = true) {
  if (markCompleted) {
    try { localStorage.setItem(onboardingStorageKey(), 'done'); } catch (_) {}
  }
  $('onboardingModal')?.classList.add('hidden');
  document.body.style.overflow = '';
  setTimeout(maybeShowNextIntrusiveNotification, 220);
}

function moveOnboarding(direction) {
  const steps = getOnboardingSteps();
  const next = state.onboardingStep + direction;
  if (next >= steps.length) return closeOnboarding(true);
  state.onboardingStep = Math.max(0, next);
  renderOnboardingStep();
}


/* =========================================================
   DEMANDAS V3 — OPERAÇÃO, ACADEMIA, RELATÓRIOS E ACESSIBILIDADE
   ========================================================= */
function isV3MissingError(error) {
  const message = String(error?.message || error?.details || error || '');
  return /academia_reservas|academia_config|transferencias_tarefa|does not exist|schema cache/i.test(message);
}

async function loadOperationalV3() {
  try {
    const [transferResult, academyResult, configResult] = await Promise.all([
      db.from('transferencias_tarefa')
        .select('*, de:colaboradores!transferencias_tarefa_de_colaborador_id_fkey(id,nome,foto_url,cargo,role), para:colaboradores!transferencias_tarefa_para_colaborador_id_fkey(id,nome,foto_url,cargo,role), por:colaboradores!transferencias_tarefa_transferido_por_fkey(id,nome,foto_url,cargo,role)')
        .order('criado_em', { ascending: false }).limit(1200),
      db.from('academia_reservas').select('*').order('inicio_em', { ascending: true }).limit(1800),
      db.from('academia_config').select('*').eq('id', 1).maybeSingle()
    ]);
    const firstError = transferResult.error || academyResult.error || configResult.error;
    if (firstError) throw firstError;
    state.transfers = transferResult.data || [];
    state.academyReservations = academyResult.data || [];
    state.academyConfig = configResult.data || null;
    state.v3Ready = true;
  } catch (error) {
    if (!isV3MissingError(error)) throw error;
    console.warn('[Demandas V3] Migração ainda não disponível:', error);
    state.transfers = []; state.academyReservations = []; state.academyConfig = null; state.v3Ready = false;
  }
}

function formatHours(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? `${num}h` : `${num.toFixed(1).replace('.', ',')}h`;
}

function openTaskEvaluation(taskId = state.selectedTask?.id) {
  if (!isManager()) return toast('Somente gestores podem avaliar conclusões.', 'error');
  const task = state.tasks.find(item => item.id === taskId);
  if (!task || task.status !== 'revisao') return toast('Esta demanda não está aguardando avaliação.', 'error');
  const person = collaborator(task.responsavel_id);
  $('evaluationTaskId').value = task.id;
  $('evaluationNote').value = task.avaliacao_observacao || '';
  $('evaluationTaskSummary').innerHTML = `<div class="evaluation-summary-person">${avatarHTML(person, 'lg')}<div><span>Entrega enviada por</span><strong>${escapeHtml(person?.nome || 'Sem responsável')}</strong><small>${escapeHtml(person?.cargo || 'Marketing')}</small></div></div><div class="evaluation-summary-task"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade] || 'Média'}</span><h3>${escapeHtml(task.titulo)}</h3><p>${escapeHtml(task.descricao || 'Sem descrição registrada.')}</p><div><span><i data-lucide="clock-3"></i>${formatHours(sizeWeight(task))} estimadas</span><span><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span></div></div>`;
  $('taskEvaluationModal').classList.remove('hidden'); refreshIcons();
}

async function submitTaskEvaluation(approved) {
  const taskId = $('evaluationTaskId').value;
  const note = $('evaluationNote').value.trim();
  if (!approved && !note) { $('evaluationNote').focus(); return toast('Informe o que precisa ser ajustado antes de devolver a demanda.', 'error'); }
  setLoading(true);
  try {
    const { error } = await db.rpc('avaliar_conclusao', { p_tarefa_id: taskId, p_aprovado: approved, p_observacao: note || null });
    if (error) throw error;
    closeModal('taskEvaluationModal'); await refreshData(); await dispatchPendingPush();
    if (state.tasks.some(task => task.id === taskId)) await openTask(taskId);
    toast(approved ? 'Conclusão aprovada. Demanda encerrada.' : 'Demanda devolvida para ajustes.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

function openTransferTask(taskId = state.selectedTask?.id) {
  if (!isManager()) return toast('Somente gestores podem transferir demandas.', 'error');
  const task = state.tasks.find(item => item.id === taskId); if (!task) return;
  const from = collaborator(task.responsavel_id);
  populateAssigneeSelects();
  $('transferTaskId').value = task.id; $('transferAssignee').value = ''; $('transferNote').value = '';
  $('transferFromCard').innerHTML = `${avatarHTML(from, 'lg')}<div><span>Responsável atual</span><strong>${escapeHtml(from?.nome || 'Sem responsável')}</strong><small>${escapeHtml(from?.cargo || 'Marketing')} · ${formatHours(sizeWeight(task))} desta demanda na carga</small></div>`;
  $('transferHoursBadge').textContent = formatHours(sizeWeight(task));
  renderAssigneePreview('transferAssignee', 'transferAssigneePreview');
  $('transferTaskModal').classList.remove('hidden'); refreshIcons();
}

async function submitTransferTask(event) {
  event.preventDefault();
  const taskId = $('transferTaskId').value, personId = $('transferAssignee').value, note = $('transferNote').value.trim();
  if (!personId) return toast('Selecione quem receberá a demanda.', 'error');
  setLoading(true);
  try {
    const { error } = await db.rpc('transferir_tarefa', { p_tarefa_id: taskId, p_novo_responsavel_id: personId, p_observacao: note || null });
    if (error) throw error;
    closeModal('transferTaskModal'); await refreshData(); await dispatchPendingPush(); await openTask(taskId);
    toast('Demanda transferida com briefing, histórico e horas preservados.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

function academyTime(value, fallback='08:00') { return String(value || fallback).slice(0,5); }
function weekdayShortPt(value) {
  const d=value instanceof Date?value:new Date(value);
  if(isNaN(d))return'';
  return ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()];
}
function academyStatusLabel(status) { return ({ solicitada:'Solicitada', aprovada:'Aprovada', recusada:'Recusada', cancelada:'Cancelada' })[status] || status; }
function isAcademyTraining(item){return item?.tipo_registro==='treinamento'||item?.origem==='treinamento'||item?.origem==='legado';}
function academyTrainingCategory(item){return String(item?.categoria_treinamento||'PMG Geral').trim()||'PMG Geral';}
function academyTrainingClass(item){const c=academyTrainingCategory(item).toLowerCase();return c==='mkt'?'mkt':c==='avulso'?'avulso':c==='pmg geral'?'geral':'outro';}
function academyReservationsForDate(key, includeInactive=false) {
  return state.academyReservations.filter(r => dateKey(r.inicio_em)===key && (includeInactive || ['solicitada','aprovada'].includes(r.status))).sort((a,b)=>new Date(a.inicio_em)-new Date(b.inicio_em));
}
function academyConflicts(startIso,endIso,ignoreId='') {
  const start=new Date(startIso), end=new Date(endIso);
  return state.academyReservations.filter(r=>r.id!==ignoreId && r.status==='aprovada' && new Date(r.inicio_em)<end && new Date(r.fim_em)>start);
}
function minutesFromClock(clock) { const [h,m]=academyTime(clock).split(':').map(Number); return h*60+m; }
function clockFromMinutes(total) { return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`; }
function academyFreeSlots(key) {
  const open=minutesFromClock(state.academyConfig?.horario_abertura||'08:00'), close=minutesFromClock(state.academyConfig?.horario_fechamento||'18:00');
  const busy=academyReservationsForDate(key).filter(r=>r.status==='aprovada').map(r=>{ const a=splitDateTime(r.inicio_em).time,b=splitDateTime(r.fim_em).time; return [minutesFromClock(a),minutesFromClock(b)]; }).sort((a,b)=>a[0]-b[0]);
  const slots=[]; let cursor=open;
  busy.forEach(([a,b])=>{ if(a>cursor) slots.push([cursor,Math.min(a,close)]); cursor=Math.max(cursor,b); }); if(cursor<close) slots.push([cursor,close]);
  return slots.filter(([a,b])=>b-a>=30).map(([a,b])=>`${clockFromMinutes(a)}–${clockFromMinutes(b)}`);
}

function setAcademyTab(tab, render=true) {
  const allowed=['calendar','trainings','requests'];
  state.academyTab=allowed.includes(tab)?tab:'calendar';
  document.querySelectorAll('[data-academy-tab]').forEach(button=>{
    const active=button.dataset.academyTab===state.academyTab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
  });
  const panels={calendar:'academyPanelCalendar',trainings:'academyPanelTrainings',requests:'academyPanelRequests'};
  Object.entries(panels).forEach(([key,id])=>$(id)?.classList.toggle('hidden',key!==state.academyTab));
  if(render){renderAcademy();refreshIcons();}
}

function renderAcademy() {
  if (!$('academyCalendarGrid')) return;
  const setup=$('academySetupNotice');
  if (!state.v3Ready) {
    setup.classList.remove('hidden'); setup.innerHTML=`<i data-lucide="database-zap"></i><div><strong>Instalação única para liberar a Academia PMG.</strong><span>Execute o SQL mais recente da Academia no Supabase. As reservas, solicitações e treinamentos ficam compartilhados entre todos os computadores.</span></div>`;
  } else setup.classList.add('hidden');
  const config=state.academyConfig||{horario_abertura:'08:00',horario_fechamento:'18:00'};
  const formsReady=Boolean(config.forms_url);
  $('academyFormsBtn').disabled=!formsReady; $('academyCopyFormsBtn').disabled=!formsReady;
  const cursor=state.academyCursor; $('academyMonthLabel').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(cursor);
  const selected=new Date(`${state.academySelectedDate}T12:00:00`);
  $('academySelectedWeekday').textContent=weekdayShortPt(selected); $('academySelectedNumber').textContent=String(selected.getDate()).padStart(2,'0'); $('academySelectedMonth').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long'}).format(selected);

  const pending=state.academyReservations.filter(r=>r.status==='solicitada');
  const approved=state.academyReservations.filter(r=>r.status==='aprovada');
  const trainings=approved.filter(isAcademyTraining);
  const reservations=approved.filter(r=>!isAcademyTraining(r));
  const futureTrainingsForTab=trainings.filter(r=>new Date(r.fim_em)>=new Date()).sort((a,b)=>new Date(a.inicio_em)-new Date(b.inicio_em));
  if($('academyTrainingTabCount')) $('academyTrainingTabCount').textContent=String(futureTrainingsForTab.length);
  if($('academyRequestTabCount')) { $('academyRequestTabCount').textContent=String(pending.length); $('academyRequestTabCount').classList.toggle('has-items',pending.length>0); }
  setAcademyTab(state.academyTab,false);
  const thisMonthTrainings=trainings.filter(r=>new Date(r.inicio_em).getMonth()===cursor.getMonth()&&new Date(r.inicio_em).getFullYear()===cursor.getFullYear());
  const thisMonthReservations=reservations.filter(r=>new Date(r.inicio_em).getMonth()===cursor.getMonth()&&new Date(r.inicio_em).getFullYear()===cursor.getFullYear());
  const totalPeople=[...thisMonthReservations,...thisMonthTrainings].reduce((sum,r)=>sum+Number(r.participantes||0),0);
  $('academySummary').innerHTML=[
    ['presentation',thisMonthTrainings.length,'Treinamentos no mês'],
    ['calendar-check',thisMonthReservations.length,'Reservas no mês'],
    ['inbox',pending.length,'Solicitações pendentes'],
    ['users-round',totalPeople,'Pessoas previstas'],
    ['clock-3',`${academyTime(config.horario_abertura)}–${academyTime(config.horario_fechamento)}`,'Horário padrão']
  ].map(([i,v,l])=>`<div class="academy-summary-card"><i data-lucide="${i}"></i><div><strong>${v}</strong><span>${l}</span></div></div>`).join('');

  const first=startOfMonth(cursor), gridStart=addDays(first,-first.getDay()), cells=[];
  for(let i=0;i<42;i++){
    const date=addDays(gridStart,i),key=dateKey(date),rs=academyReservationsForDate(key),approvedDay=rs.filter(r=>r.status==='aprovada'),trainingDay=approvedDay.filter(isAcademyTraining),bookingDay=approvedDay.filter(r=>!isAcademyTraining(r)),requested=rs.filter(r=>r.status==='solicitada'),outside=date.getMonth()!==cursor.getMonth();
    const stateClass=trainingDay.length?'academy-training-day':bookingDay.length?'academy-busy':requested.length?'academy-requested':'academy-free-day';
    let headline='Livre';
    if(trainingDay.length&&bookingDay.length)headline=`${trainingDay.length} treinamento${trainingDay.length>1?'s':''} · ${bookingDay.length} reserva${bookingDay.length>1?'s':''}`;
    else if(trainingDay.length)headline=`${trainingDay.length} treinamento${trainingDay.length>1?'s':''}`;
    else if(bookingDay.length)headline=`${bookingDay.length} reserva${bookingDay.length>1?'s':''}`;
    else if(requested.length)headline=`${requested.length} pendente${requested.length>1?'s':''}`;
    const previews=approvedDay.slice(0,2).map(r=>`<span class="${isAcademyTraining(r)?'training-preview '+academyTrainingClass(r):''}">${isAcademyTraining(r)?`<b>${escapeHtml(academyTrainingCategory(r))}</b> `:''}${formatTime(r.inicio_em)} ${escapeHtml(r.titulo)}</span>`).join('');
    cells.push(`<button class="calendar-day academy-day ${outside?'outside':''} ${key===todayKey()?'today':''} ${key===state.academySelectedDate?'selected':''} ${stateClass}" data-academy-date="${key}"><span class="day-number">${date.getDate()}</span><div class="academy-day-state"><strong>${headline}</strong>${previews}</div></button>`);
  }
  $('academyCalendarGrid').innerHTML=cells.join('');

  const selectedReservations=academyReservationsForDate(state.academySelectedDate,true).filter(r=>!['recusada','cancelada'].includes(r.status));
  const free=academyFreeSlots(state.academySelectedDate);
  $('academyAvailability').innerHTML=`<span class="academy-availability-label"><i data-lucide="clock"></i>Disponibilidade</span><strong>${free.length?free.join(' · '):'Sem janela livre no horário padrão'}</strong><small>${escapeHtml(config.observacoes||'Treinamentos e reservas aprovadas bloqueiam automaticamente o período.')}</small>`;
  $('academySelectedItems').innerHTML=selectedReservations.length?selectedReservations.map(r=>academyReservationCard(r,true)).join(''):`<div class="empty-state"><i data-lucide="door-open"></i>O espaço está livre neste dia.</div>`;
  $('academyPendingCount').textContent=`${pending.length} solicitaç${pending.length===1?'ão':'ões'}`;
  $('academyPendingList').innerHTML=pending.length?pending.slice(0,30).map(r=>academyReservationCard(r,false)).join(''):`<div class="empty-state"><i data-lucide="badge-check"></i>Nenhuma solicitação aguardando análise.</div>`;

  const futureTrainings=futureTrainingsForTab;
  if($('academyTrainingCount'))$('academyTrainingCount').textContent=`${futureTrainings.length} programado${futureTrainings.length===1?'':'s'}`;
  if($('academyTrainingList'))$('academyTrainingList').innerHTML=futureTrainings.length?futureTrainings.slice(0,12).map(r=>academyTrainingListCard(r)).join(''):`<div class="empty-state"><i data-lucide="calendar-plus"></i>Nenhum treinamento futuro cadastrado.</div>`;
  refreshIcons();
}

function academyReservationCard(r, compact=false) {
  const training=isAcademyTraining(r),conflict=academyConflicts(r.inicio_em,r.fim_em,r.id).length>0;
  const category=training?academyTrainingCategory(r):'';
  const editAttr=training?`data-academy-training-edit="${r.id}"`:`data-academy-edit="${r.id}"`;
  return `<article class="academy-reservation-card status-${r.status} ${training?'is-training training-'+academyTrainingClass(r):''} ${conflict?'has-conflict':''}"><div class="academy-reservation-time"><strong>${formatTime(r.inicio_em)}</strong><span>${formatTime(r.fim_em)}</span></div><div class="academy-reservation-copy"><div>${training?`<span class="academy-training-pill ${academyTrainingClass(r)}"><i data-lucide="presentation"></i>${escapeHtml(category)}</span>`:`<span class="academy-status-pill ${r.status}">${academyStatusLabel(r.status)}</span>`}${conflict&&r.status==='solicitada'?'<span class="academy-conflict-pill"><i data-lucide="triangle-alert"></i>Conflito</span>':''}</div><h4>${escapeHtml(r.titulo)}</h4><p>${training?'Treinamento interno':escapeHtml(r.solicitante)}${r.setor?` · ${escapeHtml(r.setor)}`:''}${r.participantes?` · ${r.participantes} pessoas`:''}</p>${!compact&&r.finalidade?`<small>${escapeHtml(r.finalidade)}</small>`:''}</div>${canManageAcademy()?`<div class="academy-reservation-actions"><button type="button" class="icon-btn subtle" ${editAttr} title="Editar"><i data-lucide="pencil"></i></button>${r.status==='solicitada'?`<button type="button" class="academy-status-action approve" data-academy-status="aprovada" data-academy-id="${r.id}"><i data-lucide="check"></i>Aprovar</button><button type="button" class="academy-status-action reject" data-academy-status="recusada" data-academy-id="${r.id}"><i data-lucide="x"></i>Recusar</button>`:r.status==='aprovada'?`<button type="button" class="academy-status-action reject" data-academy-status="cancelada" data-academy-id="${r.id}"><i data-lucide="ban"></i>Cancelar</button>`:''}</div>`:''}</article>`;
}

function academyTrainingListCard(r){
  const d=new Date(r.inicio_em);
  return `<article class="academy-training-list-card training-${academyTrainingClass(r)}"><div class="academy-training-date"><span>${weekdayShortPt(d)}</span><strong>${String(d.getDate()).padStart(2,'0')}</strong><small>${new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(d).replace('.','')}</small></div><div class="academy-training-copy"><span class="academy-training-pill ${academyTrainingClass(r)}">${escapeHtml(academyTrainingCategory(r))}</span><strong>${escapeHtml(r.titulo)}</strong><small>${formatTime(r.inicio_em)}–${formatTime(r.fim_em)}${r.participantes?` · ${r.participantes} pessoas`:''}</small></div>${canManageAcademy()?`<button type="button" class="icon-btn subtle" data-academy-training-edit="${r.id}" title="Editar treinamento"><i data-lucide="pencil"></i></button>`:''}</article>`;
}

function setAcademyTrainingType(type){
  const value=['PMG Geral','MKT','Avulso','Outro'].includes(type)?type:'Outro';
  $('academyTrainingType').value=value;
  document.querySelectorAll('[data-training-type]').forEach(btn=>btn.classList.toggle('active',btn.dataset.trainingType===value));
  const input=$('academyTrainingName');
  if(input && (!input.value.trim() || /^Treinamento PMG( Geral)?$|^Treinamento MKT$|^Treinamento Avulso$/i.test(input.value.trim()))){
    input.value=value==='PMG Geral'?'Treinamento PMG Geral':value==='MKT'?'Treinamento MKT':value==='Avulso'?'Treinamento Avulso':'Treinamento Academia PMG';
  }
}
function updateAcademyTrainingTimeState(){
  const full=$('academyTrainingFullDay')?.checked;
  const start=$('academyTrainingStart'),end=$('academyTrainingEnd');
  if(!start||!end)return;
  if(full){start.value=academyTime(state.academyConfig?.horario_abertura,'08:00');end.value=academyTime(state.academyConfig?.horario_fechamento,'18:00');}
  start.disabled=Boolean(full);end.disabled=Boolean(full);
  updateAcademyTrainingConflictPreview();
}
function openAcademyTraining(training=null,date=state.academySelectedDate){
  if(!canManageAcademy())return toast('Você não tem permissão para gerenciar a Academia PMG.','error');
  const item=training||null,start=item?splitDateTime(item.inicio_em):{date,time:academyTime(state.academyConfig?.horario_abertura,'08:00')},end=item?splitDateTime(item.fim_em):{date,time:academyTime(state.academyConfig?.horario_fechamento,'18:00')};
  $('academyTrainingTitle').textContent=item?'Editar treinamento':'Novo treinamento';
  $('academyTrainingId').value=item?.id||'';
  $('academyTrainingDate').value=start.date||date||todayKey();
  $('academyTrainingName').value=item?.titulo||'Treinamento PMG Geral';
  $('academyTrainingParticipants').value=item?.participantes??'';
  $('academyTrainingNotes').value=item?.observacoes||'';
  $('academyTrainingStart').value=start.time||academyTime(state.academyConfig?.horario_abertura,'08:00');
  $('academyTrainingEnd').value=end.time||academyTime(state.academyConfig?.horario_fechamento,'18:00');
  $('academyTrainingFullDay').checked=item?Boolean(item.dia_inteiro):true;
  setAcademyTrainingType(item?academyTrainingCategory(item):'PMG Geral');
  updateAcademyTrainingTimeState();
  $('academyTrainingModal').classList.remove('hidden');refreshIcons();
}
function updateAcademyTrainingConflictPreview(){
  const box=$('academyTrainingConflictPreview'),date=$('academyTrainingDate')?.value,start=$('academyTrainingStart')?.value,end=$('academyTrainingEnd')?.value;
  if(!box||!date||!start||!end)return;
  const a=localDateTime(date,start),b=localDateTime(date,end);
  if(new Date(b)<=new Date(a)){box.className='academy-conflict-preview conflict';box.innerHTML='<i data-lucide="triangle-alert"></i><span>O horário final precisa ser posterior ao início.</span>';refreshIcons();return;}
  const conflicts=academyConflicts(a,b,$('academyTrainingId')?.value||'');
  box.className=`academy-conflict-preview ${conflicts.length?'conflict':'free'}`;
  box.innerHTML=conflicts.length?`<i data-lucide="triangle-alert"></i><span>Este treinamento conflita com <strong>${escapeHtml(conflicts[0].titulo)}</strong>, ${formatTime(conflicts[0].inicio_em)}–${formatTime(conflicts[0].fim_em)}. Ajuste o horário antes de salvar.</span>`:`<i data-lucide="shield-check"></i><span>Período livre. Ao salvar, o treinamento já bloqueia a Academia.</span>`;
  refreshIcons();
}
async function saveAcademyTraining(event){
  event.preventDefault();
  if(!canManageAcademy())return;
  const date=$('academyTrainingDate').value,start=$('academyTrainingStart').value,end=$('academyTrainingEnd').value;
  if(!date||!start||!end)return toast('Informe data e horário do treinamento.','error');
  setLoading(true);
  try{
    const {data,error}=await db.rpc('salvar_treinamento_academia',{
      p_id:$('academyTrainingId').value||null,
      p_titulo:$('academyTrainingName').value.trim(),
      p_categoria:$('academyTrainingType').value||'PMG Geral',
      p_data:date,
      p_inicio:start,
      p_fim:end,
      p_dia_inteiro:Boolean($('academyTrainingFullDay').checked),
      p_participantes:$('academyTrainingParticipants').value?Number($('academyTrainingParticipants').value):null,
      p_observacoes:$('academyTrainingNotes').value.trim()||null
    });
    if(error)throw error;
    const saved=Array.isArray(data)?data[0]:data;
    closeModal('academyTrainingModal');
    state.academyTab='trainings';
    if(saved?.inicio_em){state.academySelectedDate=dateKey(saved.inicio_em);state.academyCursor=startOfMonth(new Date(saved.inicio_em));}
    await refreshData();
    toast('Treinamento salvo. A data já está bloqueada na Academia PMG.');
  }catch(error){toast(errorMessage(error),'error');}
  finally{setLoading(false);}
}

function openAcademyBooking(reservation=null,date=state.academySelectedDate) {
  if (!canManageAcademy()) return toast('Você não tem permissão para gerenciar a Academia PMG.', 'error');
  const item=reservation || null, start=item?splitDateTime(item.inicio_em):{date,time:'09:00'}, end=item?splitDateTime(item.fim_em):{date,time:'10:00'};
  $('academyBookingTitle').textContent=item?'Editar reserva':'Nova reserva'; $('academyBookingId').value=item?.id||''; $('academyBookingName').value=item?.titulo||''; $('academyRequester').value=item?.solicitante||''; $('academyDepartment').value=item?.setor||''; $('academyEmail').value=item?.email||''; $('academyPhone').value=item?.telefone||''; $('academyDate').value=start.date||date||todayKey(); $('academyStartTime').value=start.time||'09:00'; $('academyEndTime').value=end.time||'10:00'; $('academyParticipants').value=item?.participantes??''; $('academyPurpose').value=item?.finalidade||''; $('academyNotes').value=item?.observacoes||'';
  updateAcademyConflictPreview(); $('academyBookingModal').classList.remove('hidden'); refreshIcons();
}
function updateAcademyConflictPreview() {
  const date=$('academyDate')?.value,start=$('academyStartTime')?.value,end=$('academyEndTime')?.value,box=$('academyConflictPreview'); if(!box||!date||!start||!end)return;
  const a=localDateTime(date,start),b=localDateTime(date,end); if(new Date(b)<=new Date(a)){box.className='academy-conflict-preview conflict';box.innerHTML='<i data-lucide="triangle-alert"></i><span>O horário final precisa ser posterior ao início.</span>';refreshIcons();return;}
  const conflicts=academyConflicts(a,b,$('academyBookingId')?.value||''); box.className=`academy-conflict-preview ${conflicts.length?'conflict':'free'}`; box.innerHTML=conflicts.length?`<i data-lucide="triangle-alert"></i><span>Conflita com <strong>${escapeHtml(conflicts[0].titulo)}</strong>, ${formatTime(conflicts[0].inicio_em)}–${formatTime(conflicts[0].fim_em)}. Você pode salvar como solicitação, mas não conseguirá aprovar enquanto houver conflito.</span>`:`<i data-lucide="circle-check"></i><span>Horário sem conflito com reservas aprovadas.</span>`;refreshIcons();
}
async function saveAcademyBooking(event){event.preventDefault();const date=$('academyDate').value,start=$('academyStartTime').value,end=$('academyEndTime').value;if(!date||!start||!end)return;setLoading(true);try{const{error}=await db.rpc('salvar_reserva_academia',{p_id:$('academyBookingId').value||null,p_titulo:$('academyBookingName').value.trim(),p_solicitante:$('academyRequester').value.trim(),p_setor:$('academyDepartment').value.trim()||null,p_email:$('academyEmail').value.trim()||null,p_telefone:$('academyPhone').value.trim()||null,p_finalidade:$('academyPurpose').value.trim()||null,p_inicio_em:localDateTime(date,start),p_fim_em:localDateTime(date,end),p_participantes:$('academyParticipants').value?Number($('academyParticipants').value):null,p_observacoes:$('academyNotes').value.trim()||null});if(error)throw error;closeModal('academyBookingModal');await refreshData();toast('Reserva da Academia PMG salva.');}catch(error){toast(errorMessage(error),'error');}finally{setLoading(false);}}
async function updateAcademyStatus(id,status){
  if(!canManageAcademy())return;
  setLoading(true);
  try{
    const{data,error}=await db.rpc('atualizar_status_reserva_academia',{p_id:id,p_status:status});
    if(error)throw error;

    // A RPC V3.4.2 devolve a própria reserva atualizada. Isso permite que o
    // calendário reflita a aprovação imediatamente, antes mesmo do reload.
    let updated=Array.isArray(data)?data[0]:data;
    if(!updated?.id){
      const result=await db.from('academia_reservas').select('*').eq('id',id).single();
      if(result.error)throw result.error;
      updated=result.data;
    }

    if(updated?.id){
      const index=state.academyReservations.findIndex(item=>item.id===updated.id);
      if(index>=0)state.academyReservations[index]=updated;
      else state.academyReservations.push(updated);

      if(status==='aprovada'){
        state.academySelectedDate=dateKey(updated.inicio_em);
        state.academyCursor=startOfMonth(new Date(updated.inicio_em));
      }
      renderAcademy();
    }

    // Confirma contra o banco e atualiza todas as demais áreas da Central.
    await refreshData();

    if(status==='aprovada'){
      const reservation=state.academyReservations.find(item=>item.id===id)||updated;
      const when=reservation?.inicio_em?`${formatDate(reservation.inicio_em)} · ${formatTime(reservation.inicio_em)}–${formatTime(reservation.fim_em)}`:'no calendário';
      toast(`Reserva aprovada e horário bloqueado automaticamente: ${when}.`);
    }else{
      toast(status==='recusada'?'Solicitação recusada. O horário continua livre.':'Reserva cancelada. O horário foi liberado automaticamente.');
    }
  }catch(error){
    toast(errorMessage(error),'error');
  }finally{setLoading(false);}
}
function openAcademyConfig(){if(!canManageAcademy())return toast('Você não tem permissão para configurar a Academia PMG.','error');const c=state.academyConfig||{};$('academyFormsUrl').value=c.forms_url||'';$('academyOpenTime').value=academyTime(c.horario_abertura,'08:00');$('academyCloseTime').value=academyTime(c.horario_fechamento,'18:00');$('academyConfigNotes').value=c.observacoes||'';$('academyConfigModal').classList.remove('hidden');}
async function saveAcademyConfig(event){event.preventDefault();setLoading(true);try{const{error}=await db.rpc('salvar_config_academia',{p_forms_url:$('academyFormsUrl').value.trim()||null,p_horario_abertura:$('academyOpenTime').value||'08:00',p_horario_fechamento:$('academyCloseTime').value||'18:00',p_observacoes:$('academyConfigNotes').value.trim()||null});if(error)throw error;closeModal('academyConfigModal');await refreshData();toast('Configuração da Academia PMG salva.');}catch(error){toast(errorMessage(error),'error');}finally{setLoading(false);}}
function openAcademyForms(){const url=state.academyConfig?.forms_url;if(!url)return toast('Cadastre primeiro o link do Google Forms.', 'error');window.open(url,'_blank','noopener,noreferrer');}
async function copyAcademyForms(){const url=state.academyConfig?.forms_url;if(!url)return toast('Cadastre primeiro o link do Google Forms.', 'error');try{await navigator.clipboard.writeText(url);toast('Link do Forms copiado.');}catch(_){toast('Não foi possível copiar automaticamente.', 'error');}}

function normalizeHeader(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const ACADEMY_IMPORT_FIELDS=[['titulo','Título / evento',['titulo','evento','treinamento','assunto','nome do evento']],['solicitante','Solicitante',['solicitante','nome','responsavel','seu nome']],['setor','Setor',['setor','departamento','area']],['email','E-mail',['email','e mail']],['telefone','Telefone / ramal',['telefone','ramal','celular']],['data','Data',['data','dia','data desejada']],['inicio','Horário inicial',['inicio','horario inicial','hora inicio','horario de inicio']],['fim','Horário final',['fim','horario final','hora fim','horario de termino']],['participantes','Participantes',['participantes','quantidade','pessoas','numero de pessoas']],['finalidade','Finalidade',['finalidade','objetivo','motivo']],['observacoes','Observações',['observacoes','observacao','necessidades','comentarios']],['chave','ID / Data da resposta',['id','respondent id','data de conclusao','hora de conclusao','timestamp']]];
function autoAcademyImportMap(headers){const normalized=headers.map(h=>[h,normalizeHeader(h)]);const map={};ACADEMY_IMPORT_FIELDS.forEach(([key,_label,candidates])=>{const found=normalized.find(([,n])=>candidates.some(c=>n===c||n.includes(c)));map[key]=found?.[0]||'';});return map;}
function academyImportSelect(key,label,headers){const value=state.academyImportMap[key]||'';return `<label><span>${label}</span><select data-academy-map="${key}"><option value="">Não importar</option>${headers.map(h=>`<option value="${escapeHtml(h)}" ${h===value?'selected':''}>${escapeHtml(h)}</option>`).join('')}</select></label>`;}
function renderAcademyImportMapping(){const box=$('academyImportMapping');if(!state.academyImportHeaders.length){box.classList.add('hidden');return;}box.classList.remove('hidden');box.innerHTML=`<div class="academy-import-map-head"><strong>Mapeamento das colunas</strong><span>Confira principalmente data, início e fim.</span></div><div class="academy-import-map-grid">${ACADEMY_IMPORT_FIELDS.map(([k,l])=>academyImportSelect(k,l,state.academyImportHeaders)).join('')}</div>`;renderAcademyImportPreview();}
function academyMapped(row,key){const header=state.academyImportMap[key];return header?row[header]:'';}
function parseFormsDate(value){if(value instanceof Date&&!isNaN(value))return dateKey(value);const text=String(value||'').trim();if(!text)return'';let m=text.match(/^(\d{1,2})[\/]([0-9]{1,2})[\/]([0-9]{2,4})/);if(m){let y=m[3].length===2?`20${m[3]}`:m[3];return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}m=text.match(/^(\d{4})[-\/]([0-9]{1,2})[-\/]([0-9]{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;const d=new Date(text);return isNaN(d)?'':dateKey(d);}
function parseFormsTime(value,fallback='09:00'){if(value instanceof Date&&!isNaN(value))return `${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')}`;const text=String(value||'').trim();const m=text.match(/(\d{1,2})[:h](\d{2})/i)||text.match(/^(\d{1,2})$/);if(!m)return fallback;return `${String(Math.min(23,Number(m[1]))).padStart(2,'0')}:${m[2]||'00'}`;}
async function handleAcademyImportFile(event){const file=event.target.files?.[0];if(!file)return;if(!window.XLSX)return toast('Biblioteca de Excel não carregou. Atualize a página.', 'error');try{const data=await file.arrayBuffer();const workbook=XLSX.read(data,{type:'array',cellDates:true});const sheet=workbook.Sheets[workbook.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});state.academyImportRows=rows;state.academyImportHeaders=rows.length?Object.keys(rows[0]):[];state.academyImportMap=autoAcademyImportMap(state.academyImportHeaders);renderAcademyImportMapping();$('academyImportConfirmBtn').disabled=!rows.length;toast(`${rows.length} resposta${rows.length===1?'':'s'} carregada${rows.length===1?'':'s'}.`);}catch(error){console.error(error);toast('Não foi possível ler esse relatório.', 'error');}}
function renderAcademyImportPreview(){const rows=state.academyImportRows.slice(0,5);$('academyImportPreview').innerHTML=rows.length?`<div class="academy-import-preview-head"><strong>Prévia</strong><span>${state.academyImportRows.length} linhas no arquivo</span></div>${rows.map((r,i)=>`<div class="academy-import-preview-row"><b>${i+1}</b><span><strong>${escapeHtml(String(academyMapped(r,'titulo')||'Sem título'))}</strong><small>${escapeHtml(String(academyMapped(r,'solicitante')||'Sem solicitante'))} · ${escapeHtml(String(academyMapped(r,'data')||'Sem data'))}</small></span></div>`).join('')}`:'';}
async function importAcademyFormsRows(){if(!state.academyImportRows.length)return;const required=['titulo','solicitante','data','inicio','fim'];const missing=required.filter(k=>!state.academyImportMap[k]);if(missing.length)return toast('Mapeie título, solicitante, data, início e fim antes de importar.', 'error');setLoading(true);let ok=0,failed=0;try{for(let i=0;i<state.academyImportRows.length;i++){const row=state.academyImportRows[i],date=parseFormsDate(academyMapped(row,'data')),start=parseFormsTime(academyMapped(row,'inicio'),'09:00'),end=parseFormsTime(academyMapped(row,'fim'),'10:00');if(!date){failed++;continue;}const rawKey=String(academyMapped(row,'chave')||'').trim();const key=rawKey||`${fileSafeKey(academyMapped(row,'solicitante'))}:${date}:${start}:${fileSafeKey(academyMapped(row,'titulo'))}`;const participants=parseInt(String(academyMapped(row,'participantes')||'').replace(/\D+/g,''),10);const {error}=await db.rpc('importar_reserva_academia_forms',{p_chave:key,p_titulo:String(academyMapped(row,'titulo')||'').trim(),p_solicitante:String(academyMapped(row,'solicitante')||'').trim(),p_setor:String(academyMapped(row,'setor')||'').trim()||null,p_email:String(academyMapped(row,'email')||'').trim()||null,p_telefone:String(academyMapped(row,'telefone')||'').trim()||null,p_finalidade:String(academyMapped(row,'finalidade')||'').trim()||null,p_inicio_em:localDateTime(date,start),p_fim_em:localDateTime(date,end),p_participantes:Number.isFinite(participants)?participants:null,p_observacoes:String(academyMapped(row,'observacoes')||'').trim()||null,p_payload:row});if(error){console.warn('[Forms import]',error);failed++;}else ok++;}closeModal('academyImportModal');await refreshData();toast(`${ok} solicitação${ok===1?'':'ões'} importada${ok===1?'':'s'}${failed?` · ${failed} ignorada${failed===1?'':'s'} por erro`:''}.`);}finally{setLoading(false);}}
function fileSafeKey(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'linha';}

function monthInputValue(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;}
function monthBounds(value){const [y,m]=String(value||monthInputValue()).split('-').map(Number);const start=new Date(y,m-1,1),end=new Date(y,m,1);return{start,end,label:new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(start)};}
function buildMonthlyReport(value){
  const {start,end,label}=monthBounds(value),operators=state.collaborators.filter(p=>p.role!=='gestor');
  const operatorIds=new Set(operators.map(p=>p.id));
  const rows=operators.map(person=>{
    const completed=state.tasks.filter(t=>t.responsavel_id===person.id&&t.status==='concluida'&&new Date(t.concluida_em||t.atualizado_em)>=start&&new Date(t.concluida_em||t.atualizado_em)<end);
    const created=state.tasks.filter(t=>t.responsavel_id===person.id&&new Date(t.criado_em)>=start&&new Date(t.criado_em)<end);
    const overdue=state.tasks.filter(t=>t.responsavel_id===person.id&&!t.arquivada_em&&isOverdue(t));
    const active=state.tasks.filter(t=>t.responsavel_id===person.id&&!t.arquivada_em&&t.status!=='concluida');
    const approved=completed.filter(t=>t.avaliacao_status==='aprovada').length;
    const immediates=completed.filter(t=>t.prioridade==='imediata').length;
    const hours=completed.reduce((sum,t)=>sum+sizeWeight(t),0);
    const deadlineCompleted=completed.filter(t=>taskDue(t)&&t.concluida_em);
    const onTime=deadlineCompleted.filter(t=>new Date(t.concluida_em)<=new Date(taskDue(t))).length;
    const onTimeRate=deadlineCompleted.length?Math.round((onTime/deadlineCompleted.length)*100):null;
    const cycleValues=completed.filter(t=>t.criado_em&&(t.concluida_em||t.atualizado_em)).map(t=>Math.max(0,(new Date(t.concluida_em||t.atualizado_em)-new Date(t.criado_em))/86400000));
    const avgCycle=cycleValues.length?cycleValues.reduce((a,b)=>a+b,0)/cycleValues.length:null;
    const transfersIn=state.transfers.filter(tr=>tr.para_colaborador_id===person.id&&new Date(tr.criado_em)>=start&&new Date(tr.criado_em)<end);
    const transfersOut=state.transfers.filter(tr=>tr.de_colaborador_id===person.id&&new Date(tr.criado_em)>=start&&new Date(tr.criado_em)<end);
    return{person,created:created.length,completed:completed.length,approved,immediates,hours,active:active.length,overdue:overdue.length,onTimeRate,avgCycle,transfersIn:transfersIn.length,transfersOut:transfersOut.length};
  }).sort((a,b)=>b.completed-a.completed||b.hours-a.hours);
  const completedInMonth=state.tasks.filter(t=>t.status==='concluida'&&operatorIds.has(t.responsavel_id)&&new Date(t.concluida_em||t.atualizado_em)>=start&&new Date(t.concluida_em||t.atualizado_em)<end);
  const createdInMonth=state.tasks.filter(t=>operatorIds.has(t.responsavel_id)&&new Date(t.criado_em)>=start&&new Date(t.criado_em)<end);
  const projectSet=new Set([...completedInMonth,...createdInMonth].map(t=>String(t.projeto||'').trim()||'Sem projeto'));
  const projects=[...projectSet].map(name=>{
    const completed=completedInMonth.filter(t=>(String(t.projeto||'').trim()||'Sem projeto')===name);
    const created=createdInMonth.filter(t=>(String(t.projeto||'').trim()||'Sem projeto')===name);
    const active=state.tasks.filter(t=>operatorIds.has(t.responsavel_id)&&!t.arquivada_em&&t.status!=='concluida'&&(String(t.projeto||'').trim()||'Sem projeto')===name);
    return{name,created:created.length,completed:completed.length,hours:completed.reduce((sum,t)=>sum+sizeWeight(t),0),active:active.length,overdue:active.filter(isOverdue).length,immediates:completed.filter(t=>t.prioridade==='imediata').length};
  }).sort((a,b)=>b.completed-a.completed||b.hours-a.hours||a.name.localeCompare(b.name,'pt-BR'));
  const completedWithDeadline=completedInMonth.filter(t=>taskDue(t)&&t.concluida_em);
  const totalOnTime=completedWithDeadline.filter(t=>new Date(t.concluida_em)<=new Date(taskDue(t))).length;
  return{label,rows,projects,totalCompleted:rows.reduce((s,r)=>s+r.completed,0),totalHours:rows.reduce((s,r)=>s+r.hours,0),totalCreated:rows.reduce((s,r)=>s+r.created,0),teamOnTimeRate:completedWithDeadline.length?Math.round(totalOnTime/completedWithDeadline.length*100):null};
}
function renderMonthlyReport(){
  const value=$('monthlyReportMonth').value||monthInputValue();const report=buildMonthlyReport(value);state.monthlyReportData=report;
  const projectsHTML=report.projects.length?`<section class="monthly-project-section"><div class="monthly-section-title"><div><span class="eyebrow">Projetos</span><h4>Onde o esforço do mês foi aplicado</h4></div><span>${report.projects.length} projeto${report.projects.length===1?'':'s'}</span></div><div class="monthly-project-grid">${report.projects.map(project=>`<article class="monthly-project-card ${project.name==='Sem projeto'?'unclassified':''}"><div class="monthly-project-card-head"><span><i data-lucide="folder-kanban"></i></span><div><strong>${escapeHtml(project.name)}</strong><small>${project.created} recebida(s) · ${project.completed} concluída(s)</small></div></div><div class="monthly-project-stats"><span><strong>${formatHours(project.hours)}</strong><small>entregues</small></span><span><strong>${project.active}</strong><small>ativas</small></span><span class="${project.overdue?'danger':''}"><strong>${project.overdue}</strong><small>atrasadas</small></span><span><strong>${project.immediates}</strong><small>imediatas</small></span></div></article>`).join('')}</div></section>`:'<section class="monthly-project-section"><div class="empty-state"><i data-lucide="folder-kanban"></i>Nenhum projeto com atividade neste mês.</div></section>';
  $('monthlyReportContent').innerHTML=`<div class="monthly-report-hero"><div><span class="eyebrow light">${escapeHtml(report.label)}</span><h3>Performance operacional da equipe</h3><p>Gestores ficam fora da comparação. O relatório combina volume concluído, horas estimadas, prazo, ciclo, projetos e transferências.</p></div><div class="monthly-report-totals"><span><strong>${report.totalCompleted}</strong>concluídas</span><span><strong>${formatHours(report.totalHours)}</strong>entregues</span><span><strong>${report.teamOnTimeRate===null?'—':report.teamOnTimeRate+'%'}</strong>no prazo</span></div></div>${projectsHTML}<section class="monthly-people-section"><div class="monthly-section-title"><div><span class="eyebrow">Equipe</span><h4>Performance por colaborador</h4></div></div><div class="monthly-report-table"><div class="monthly-report-row head"><span>Colaborador</span><span>Recebidas</span><span>Concluídas</span><span>Horas</span><span>No prazo</span><span>Ciclo médio</span><span>Ativas</span><span>Atrasadas</span><span>Transferências</span></div>${report.rows.map((r,i)=>`<div class="monthly-report-row"><span class="monthly-person">${avatarHTML(r.person,'sm')}<span><strong>${escapeHtml(r.person.nome)}</strong><small>${escapeHtml(r.person.cargo||'Marketing')} · #${i+1}${r.immediates?` · ${r.immediates} imediata(s)`:''}</small></span></span><strong>${r.created}</strong><strong>${r.completed}</strong><strong>${formatHours(r.hours)}</strong><strong>${r.onTimeRate===null?'—':r.onTimeRate+'%'}</strong><strong>${r.avgCycle===null?'—':r.avgCycle.toFixed(1).replace('.',',')+'d'}</strong><strong>${r.active}</strong><strong class="${r.overdue?'danger':''}">${r.overdue}</strong><span>${r.transfersIn} receb. · ${r.transfersOut} env.</span></div>`).join('')||'<div class="empty-state">Nenhum colaborador operacional encontrado.</div>'}</div></section>`;refreshIcons();
}
function openMonthlyReport(){if(!isManager())return;$('monthlyReportMonth').value=monthInputValue();renderMonthlyReport();$('monthlyReportModal').classList.remove('hidden');refreshIcons();}
function csvCell(value){const text=String(value??'');return `"${text.replace(/"/g,'""')}"`;}
function exportMonthlyReportCsv(){
  const report=state.monthlyReportData||buildMonthlyReport($('monthlyReportMonth').value);
  const lines=[
    ['COLABORADORES'],
    ['Colaborador','Cargo','Recebidas','Concluídas','Horas entregues','No prazo (%)','Ciclo médio (dias)','Imediatas concluídas','Ativas agora','Atrasadas agora','Transferências recebidas','Transferências enviadas'],
    ...report.rows.map(r=>[r.person.nome,r.person.cargo||'',r.created,r.completed,r.hours,r.onTimeRate??'',r.avgCycle===null?'':r.avgCycle.toFixed(1),r.immediates,r.active,r.overdue,r.transfersIn,r.transfersOut]),
    [],
    ['PROJETOS'],
    ['Projeto','Recebidas','Concluídas','Horas entregues','Ativas agora','Atrasadas agora','Imediatas concluídas'],
    ...report.projects.map(project=>[project.name,project.created,project.completed,project.hours,project.active,project.overdue,project.immediates])
  ].map(row=>row.map(csvCell).join(';'));
  const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`relatorio-demandas-${$('monthlyReportMonth').value}.csv`;a.click();URL.revokeObjectURL(url);
}
function printMonthlyReport(){const html=$('monthlyReportContent').innerHTML,w=window.open('','_blank','width=1200,height=800');if(!w)return toast('Permita pop-ups para imprimir o relatório.','error');w.document.write(`<!doctype html><html><head><title>Relatório mensal PMG Connect</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#17221b}.monthly-report-row{display:grid;grid-template-columns:2fr repeat(6,1fr);gap:10px;padding:10px;border-bottom:1px solid #ddd}.head{font-weight:bold;background:#f2f5f3}.avatar{display:none}.monthly-report-hero{padding:20px;background:#164b2d;color:white;margin-bottom:20px}.monthly-report-totals{display:flex;gap:30px}.monthly-person small{display:block;color:#777}</style></head><body>${html}</body></html>`);w.document.close();setTimeout(()=>w.print(),250);}

const ACCESSIBILITY_KEY='pmg-demandas-accessibilidade-v2';
function loadAccessibilityPreferences(){
  try{
    const saved=JSON.parse(localStorage.getItem(ACCESSIBILITY_KEY)||localStorage.getItem('pmg-demandas-accessibilidade-v1')||'{}');
    // Migração da versão anterior: "system" deixa de existir. Se estava em system,
    // começamos no claro para que o único controle de tema seja o toggle manual.
    state.accessibility={
      scale:['medium','large','xlarge'].includes(saved.scale)?saved.scale:'large',
      theme:saved.theme==='dark'?'dark':'light',
      contrast:Boolean(saved.contrast),reduceMotion:Boolean(saved.reduceMotion)
    };
  }catch(_){state.accessibility={scale:'large',theme:'light',contrast:false,reduceMotion:false};}
  applyAccessibilityPreferences();
}
function updateThemeToggle(){
  const dark=state.accessibility.theme==='dark';
  const button=$('themeToggleBtn');
  if(button){
    button.setAttribute('aria-checked',String(dark));
    button.setAttribute('aria-label',dark?'Desativar modo escuro':'Ativar modo escuro');
    button.title=dark?'Usar modo claro':'Usar modo escuro';
    button.classList.toggle('active',dark);
  }
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',dark?'#0f1813':'#133d25');
  document.documentElement.style.colorScheme=dark?'dark':'light';
}
function applyAccessibilityPreferences(){
  ['medium','large','xlarge'].forEach(scale=>document.body.classList.toggle(`ui-scale-${scale}`,state.accessibility.scale===scale));
  const dark=state.accessibility.theme==='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.classList.toggle('ui-theme-dark',dark);
  document.documentElement.classList.toggle('ui-theme-light',!dark);
  document.body.classList.toggle('ui-theme-dark',dark);
  document.body.classList.toggle('ui-theme-light',!dark);
  document.body.dataset.themePreference=dark?'dark':'light';
  document.body.classList.toggle('ui-high-contrast',state.accessibility.contrast);
  document.body.classList.toggle('ui-reduce-motion',state.accessibility.reduceMotion);
  $$('[data-ui-scale]').forEach(btn=>{const active=btn.dataset.uiScale===state.accessibility.scale;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
  if($('accessibilityContrast'))$('accessibilityContrast').checked=state.accessibility.contrast;
  if($('accessibilityMotion'))$('accessibilityMotion').checked=state.accessibility.reduceMotion;
  updateThemeToggle();
}
function saveAccessibilityPreferences(){try{localStorage.setItem(ACCESSIBILITY_KEY,JSON.stringify(state.accessibility));}catch(_){}applyAccessibilityPreferences();}
function openAccessibility(){applyAccessibilityPreferences();$('accessibilityModal').classList.remove('hidden');refreshIcons();}
function setAccessibilityScale(scale){if(!['medium','large','xlarge'].includes(scale))return;state.accessibility.scale=scale;saveAccessibilityPreferences();}
function toggleTheme(){
  state.accessibility.theme=state.accessibility.theme==='dark'?'light':'dark';
  saveAccessibilityPreferences();
  refreshIcons();
}
function resetAccessibility(){state.accessibility={scale:'large',theme:'light',contrast:false,reduceMotion:false};saveAccessibilityPreferences();toast('Acessibilidade restaurada.');}

/* =========================================================
   MENU DO USUÁRIO E LOGOUT
   ========================================================= */
function renderUserMenu() {
  if (!state.me) return;

  const name = state.me.nome || 'Usuário';
  const role = state.me.cargo || (state.me.role === 'gestor' ? 'Gestor' : 'Colaborador');
  const email = state.session?.user?.email || 'Conta do PMG Connect';

  if ($('headerUserName')) $('headerUserName').textContent = name;
  if ($('headerUserRole')) $('headerUserRole').textContent = role;
  if ($('dropdownUserName')) $('dropdownUserName').textContent = name;
  if ($('dropdownUserEmail')) $('dropdownUserEmail').textContent = email;
  if ($('headerUserAvatar')) $('headerUserAvatar').innerHTML = avatarHTML(state.me, 'sm');
  if ($('dropdownUserAvatar')) $('dropdownUserAvatar').innerHTML = avatarHTML(state.me, 'md');
}

function closeUserMenu() {
  const trigger = $('userMenuTrigger');
  const dropdown = $('userDropdown');
  if (!trigger || !dropdown) return;

  dropdown.classList.add('hidden');
  trigger.setAttribute('aria-expanded', 'false');
}

function toggleUserMenu(event) {
  event?.stopPropagation();

  const trigger = $('userMenuTrigger');
  const dropdown = $('userDropdown');
  if (!trigger || !dropdown) return;

  const opening = dropdown.classList.contains('hidden');
  dropdown.classList.toggle('hidden', !opening);
  trigger.setAttribute('aria-expanded', String(opening));

  if (opening) refreshIcons();
}

async function logout() {
  if (!window.confirm('Deseja realmente sair da sua conta?')) return;

  closeUserMenu();
  setLoading(true);

  try {
    if (state.realtime && db) {
      await db.removeChannel(state.realtime);
      state.realtime = null;
    }

    const { error } = await db.auth.signOut();
    if (error) throw error;

    window.location.replace('/demandas.html');
  } catch (error) {
    console.error('[Demandas] Falha ao sair:', error);
    toast(`Não foi possível sair: ${errorMessage(error)}`, 'error');
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  // Navegadores bloqueiam áudio automático até a primeira interação humana.
  // Destravamos uma única vez sem tocar som.
  document.addEventListener('pointerdown', unlockNotificationAudio, { once: true, passive: true });
  document.addEventListener('keydown', unlockNotificationAudio, { once: true });
  syncNotificationSoundUI();
  $('authForm').addEventListener('submit', async event => {
    event.preventDefault(); $('authError').classList.add('hidden'); setLoading(true);
    try { await initializeSupabaseClient(); const { data, error } = await db.auth.signInWithPassword({ email: $('authEmail').value.trim(), password: $('authPassword').value }); if (error) throw error; state.session = data.session; await initializeUser(); }
    catch (error) { $('authError').textContent = errorMessage(error); $('authError').classList.remove('hidden'); }
    finally { setLoading(false); }
  });
  $$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.view === 'demandas') state.smartFilter = '';
    switchView(button.dataset.view);
  }));
  $$('[data-goto]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.goto === 'demandas') state.smartFilter = '';
    switchView(button.dataset.goto);
  }));
  $$('[data-quick-type]').forEach(button => button.addEventListener('click', () => openQuickAdd(button.dataset.quickType)));
  $('quickAddBtn').addEventListener('click', () => openQuickAdd(isManager() ? 'demanda' : 'lembrete'));
  $('newTaskPageBtn').addEventListener('click', () => openQuickAdd('demanda'));
  $$('[data-item-type]').forEach(button => button.addEventListener('click', () => { if (!button.disabled) setQuickType(button.dataset.itemType); }));
  $('quickAddForm').addEventListener('submit', saveQuickItem); $('editTaskForm').addEventListener('submit', saveEditedTask); $('profileForm').addEventListener('submit', saveProfile);
  $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => { const modal = $(button.dataset.closeModal); if (modal.id === 'profileModal' && modal.dataset.required === '1') return; closeModal(modal.id); }));
  $$('[data-close-drawer]').forEach(button => button.addEventListener('click', () => closeDrawer(button.dataset.closeDrawer)));
  $('drawerBackdrop').addEventListener('click', () => { closeDrawer('taskDrawer'); closeDrawer('personDrawer'); closeDrawer('notificationDrawer'); });
  $('intrusiveNotificationOpenBtn')?.addEventListener('click', openIntrusiveNotification);
  $('intrusiveNotificationLaterBtn')?.addEventListener('click', postponeIntrusiveNotification);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) maybeShowNextIntrusiveNotification(); });
  $('notificationBtn').addEventListener('click', () => openDrawer('notificationDrawer')); $('markAllReadBtn').addEventListener('click', markAllRead);
  $('notificationSettingsBtn').addEventListener('click', () => { closeDrawer('notificationDrawer'); $('notificationSettingsModal').classList.remove('hidden'); updatePushStatus(); syncNotificationSoundUI(); });
  $('openNotificationSettings').addEventListener('click', () => { $('notificationSettingsModal').classList.remove('hidden'); updatePushStatus(); syncNotificationSoundUI(); });
  $('enablePushBtn').addEventListener('click', enablePush); $('disablePushBtn').addEventListener('click', disablePush); $('testPushBtn').addEventListener('click', testPush);
  $('notificationSoundEnabled')?.addEventListener('change', async event => {
    await unlockNotificationAudio();
    setNotificationSoundsEnabled(event.target.checked);
    if (event.target.checked) playNotificationSound('normal', { force: true });
    toast(event.target.checked ? 'Sons de notificação ativados.' : 'Sons de notificação desativados.');
  });
  $$('[data-sound-preview]').forEach(button => button.addEventListener('click', async () => {
    await unlockNotificationAudio();
    playNotificationSound(button.dataset.soundPreview, { force: true });
  }));
  $('profileBtn').addEventListener('click', () => openProfile(false));
  $('accessibilityBtn')?.addEventListener('click', openAccessibility);
  $$('[data-ui-scale]').forEach(button => button.addEventListener('click', () => setAccessibilityScale(button.dataset.uiScale)));
  $('themeToggleBtn')?.addEventListener('click', toggleTheme);
  $('accessibilityContrast')?.addEventListener('change', event => { state.accessibility.contrast = event.target.checked; saveAccessibilityPreferences(); });
  $('accessibilityMotion')?.addEventListener('change', event => { state.accessibility.reduceMotion = event.target.checked; saveAccessibilityPreferences(); });
  $('accessibilityResetBtn')?.addEventListener('click', resetAccessibility);
  $('transferTaskForm')?.addEventListener('submit', submitTransferTask);
  $('transferAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ selectId: 'transferAssignee', previewId: 'transferAssigneePreview', title: 'Transferir para' }));
  $('evaluationApproveBtn')?.addEventListener('click', () => submitTaskEvaluation(true));
  $('evaluationRejectBtn')?.addEventListener('click', () => submitTaskEvaluation(false));
  $('teamMonthlyReportBtn')?.addEventListener('click', openMonthlyReport);
  $('monthlyReportMonth')?.addEventListener('change', renderMonthlyReport);
  $('monthlyReportCsvBtn')?.addEventListener('click', exportMonthlyReportCsv);
  $('monthlyReportPrintBtn')?.addEventListener('click', printMonthlyReport);
  $$('[data-agenda-scope]').forEach(button => button.addEventListener('click', () => { state.agendaScope = button.dataset.agendaScope === 'team' ? 'team' : 'mine'; if (state.agendaScope === 'mine') state.agendaPersonFilter = ''; renderAgenda(); }));
  $('agendaPersonFilter')?.addEventListener('change', event => { state.agendaPersonFilter = event.target.value; renderAgenda(); });
  $('agendaNewEventBtn')?.addEventListener('click', () => openQuickAdd('compromisso', { date: state.selectedDate, visibility: state.agendaScope === 'team' && isManager() ? 'equipe' : 'pessoal' }));
  $$('[data-academy-tab]').forEach(button => button.addEventListener('click', async () => {
    const tab = button.dataset.academyTab;
    try {
      // Busca novamente no Supabase ao abrir a aba. Assim uma resposta recém-enviada
      // pelo Google Forms aparece mesmo se o Realtime tiver perdido o INSERT.
      await loadOperationalV3();
      setAcademyTab(tab, false);
      renderAcademy();
    } catch (error) {
      console.warn('[Academia refresh]', error);
      setAcademyTab(tab);
    }
  }));
  $('academyTrainingCreateTabBtn')?.addEventListener('click', () => openAcademyTraining(null, state.academySelectedDate));
  $('academyPrev')?.addEventListener('click', () => { state.academyCursor = addMonths(state.academyCursor, -1); renderAcademy(); });
  $('academyNext')?.addEventListener('click', () => { state.academyCursor = addMonths(state.academyCursor, 1); renderAcademy(); });
  $('academyNewTrainingBtn')?.addEventListener('click', () => openAcademyTraining(null, state.academySelectedDate));
  $('academyAddTrainingSelectedDay')?.addEventListener('click', () => openAcademyTraining(null, state.academySelectedDate));
  $('academyNewBookingBtn')?.addEventListener('click', () => openAcademyBooking(null, state.academySelectedDate));
  $('academyAddSelectedDay')?.addEventListener('click', () => openAcademyBooking(null, state.academySelectedDate));
  $('academyFormsBtn')?.addEventListener('click', openAcademyForms);
  $('academyCopyFormsBtn')?.addEventListener('click', copyAcademyForms);
  $('academyConfigBtn')?.addEventListener('click', openAcademyConfig);
  $('academyImportBtn')?.addEventListener('click', () => { state.academyImportRows=[]; state.academyImportHeaders=[]; state.academyImportMap={}; $('academyImportFile').value=''; $('academyImportMapping').classList.add('hidden'); $('academyImportPreview').innerHTML=''; $('academyImportConfirmBtn').disabled=true; $('academyImportModal').classList.remove('hidden'); });
  $('academyTrainingForm')?.addEventListener('submit', saveAcademyTraining);
  $('academyTrainingFullDay')?.addEventListener('change', updateAcademyTrainingTimeState);
  ['academyTrainingDate','academyTrainingStart','academyTrainingEnd'].forEach(id => $(id)?.addEventListener('change', updateAcademyTrainingConflictPreview));
  $('academyBookingForm')?.addEventListener('submit', saveAcademyBooking);
  $('academyConfigForm')?.addEventListener('submit', saveAcademyConfig);
  $('academyImportFile')?.addEventListener('change', handleAcademyImportFile);
  $('academyImportMapping')?.addEventListener('change', event => { const select = event.target.closest('[data-academy-map]'); if (!select) return; state.academyImportMap[select.dataset.academyMap] = select.value; renderAcademyImportPreview(); });
  $('academyImportConfirmBtn')?.addEventListener('click', importAcademyFormsRows);
  ['academyDate','academyStartTime','academyEndTime'].forEach(id => $(id)?.addEventListener('change', updateAcademyConflictPreview));
  $('itemAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ selectId: 'itemAssignee', previewId: 'itemAssigneePreview', title: 'Selecionar responsável' }));
  $('editTaskAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ selectId: 'editTaskAssignee', previewId: 'editTaskAssigneePreview', title: 'Alterar responsável' }));
  $('assigneePickerSearch')?.addEventListener('input', debounce(event => { state.assigneePicker.search = event.target.value; renderAssigneePicker(); }, 100));
  $('userMenuTrigger')?.addEventListener('click', toggleUserMenu);
  $('userMenuProfileBtn')?.addEventListener('click', () => { closeUserMenu(); openProfile(false); });
  $('userMenuTasksBtn')?.addEventListener('click', () => { closeUserMenu(); applySmartFilter('minhas'); });
  $('userMenuAgendaBtn')?.addEventListener('click', () => { closeUserMenu(); switchView('agenda'); });
  $('userMenuTutorialBtn')?.addEventListener('click', () => { closeUserMenu(); maybeOpenOnboarding(true); });
  $('onboardingCloseBtn')?.addEventListener('click', () => closeOnboarding(false));
  $('onboardingSkipBtn')?.addEventListener('click', () => closeOnboarding(true));
  $('onboardingBackBtn')?.addEventListener('click', () => moveOnboarding(-1));
  $('onboardingNextBtn')?.addEventListener('click', () => moveOnboarding(1));
  $('onboardingStepDots')?.addEventListener('click', event => { const dot = event.target.closest('[data-onboarding-step]'); if (!dot) return; state.onboardingStep = Number(dot.dataset.onboardingStep) || 0; renderOnboardingStep(); });
  $('logoutBtn')?.addEventListener('click', logout);
  $('teamNewDemandBtn')?.addEventListener('click', () => openQuickAdd('demanda'));
  $('teamSearch')?.addEventListener('input', debounce(event => { state.teamSearch = event.target.value; renderEquipe(); }, 120));
  $('teamSort')?.addEventListener('change', event => { state.teamSort = event.target.value; renderEquipe(); });
  $('teamRiskOnly')?.addEventListener('click', event => { state.teamRiskOnly = !state.teamRiskOnly; event.currentTarget.classList.toggle('active', state.teamRiskOnly); event.currentTarget.setAttribute('aria-pressed', String(state.teamRiskOnly)); renderEquipe(); });
  $('refreshBtn').addEventListener('click', async () => { $('refreshBtn').classList.add('spinning'); setLoading(true); try { await refreshData(); toast('Dados atualizados.'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); $('refreshBtn').classList.remove('spinning'); } });
  $('globalSearchBtn').addEventListener('click', openSearch); $('globalSearchInput').addEventListener('input', debounce(renderGlobalSearch, 100));
  $('searchModal').addEventListener('click', event => { if (event.target === $('searchModal')) closeSearch(); });
  $('quickCaptureType').addEventListener('click', event => { const button = event.target.closest('[data-type]'); if (!button) return; state.quickCaptureType = button.dataset.type; $$('[data-type]', $('quickCaptureType')).forEach(item => item.classList.toggle('active', item === button)); });
  $('quickCaptureForm').addEventListener('submit', event => { event.preventDefault(); const text = $('quickCaptureText').value.trim(); if (!text) return; const preset = parseQuickCapture(text); openQuickAdd(state.quickCaptureType, preset); $('quickCaptureText').value = ''; });
  $$('[data-smart-filter]').forEach(button => button.addEventListener('click', () => applySmartFilter(button.dataset.smartFilter)));
  $('clearSmartFilter').addEventListener('click', () => { state.smartFilter = ''; renderDemandas(); });
  ['taskSearch', 'taskAssigneeFilter', 'taskProjectFilter', 'taskPriorityFilter', 'taskArchiveFilter'].forEach(id => {
    $(id).addEventListener(id === 'taskSearch' ? 'input' : 'change', debounce(() => {
      // Ao escolher um responsável manualmente, o usuário espera ver TODAS as
      // demandas daquela pessoa. Não manter silenciosamente "Hoje/Atrasadas"
      // herdado da Home, pois isso fazia os cards mostrarem contagem > 0
      // enquanto o quadro aparecia vazio.
      if (id === 'taskAssigneeFilter') state.smartFilter = '';
      renderDemandas();
    }, 120));
  });
  $('taskViewToggle').addEventListener('click', event => { const button = event.target.closest('[data-task-view]'); if (!button) return; state.taskView = button.dataset.taskView; renderDemandas(); refreshIcons(); });
  $('calendarPrev').addEventListener('click', () => { state.calendarCursor = addMonths(state.calendarCursor, -1); renderAgenda(); refreshIcons(); });
  $('calendarNext').addEventListener('click', () => { state.calendarCursor = addMonths(state.calendarCursor, 1); renderAgenda(); refreshIcons(); });
  $('agendaTodayBtn').addEventListener('click', () => { state.calendarCursor = startOfMonth(new Date()); state.selectedDate = todayKey(); renderAgenda(); refreshIcons(); });
  $('addOnSelectedDay').addEventListener('click', () => openQuickAdd(state.agendaScope === 'team' && isManager() ? 'compromisso' : 'lembrete', { date: state.selectedDate, visibility: state.agendaScope === 'team' && isManager() ? 'equipe' : 'pessoal' }));
  $('openSidebarBtn').addEventListener('click', openMobileSidebar); $('closeSidebarBtn').addEventListener('click', closeMobileSidebar); $('sidebarBackdrop').addEventListener('click', closeMobileSidebar);
  document.addEventListener('click', event => {
    if (!$('userMenuWrapper')?.contains(event.target)) closeUserMenu();
    const immediateAudience = event.target.closest('[data-immediate-audience]');
    if (immediateAudience) { setImmediateAudience(immediateAudience.dataset.immediateAudience === 'todos', false); return; }
    const editImmediateAudience = event.target.closest('[data-edit-immediate-audience]');
    if (editImmediateAudience) { setImmediateAudience(editImmediateAudience.dataset.editImmediateAudience === 'todos', true); return; }
    const academyFormsOpen = event.target.closest('[data-academy-open-forms]'); if (academyFormsOpen) { openAcademyForms(); return; }
    const academyFormsCopy = event.target.closest('[data-academy-copy-forms]'); if (academyFormsCopy) { copyAcademyForms(); return; }
    const academyMap = event.target.closest('[data-academy-map]');
    if (academyMap) return;
    const trainingType = event.target.closest('[data-training-type]'); if (trainingType) { setAcademyTrainingType(trainingType.dataset.trainingType); return; }
    const choice = event.target.closest('[data-choice-target]');
    if (choice) { const select = $(choice.dataset.choiceTarget); if (select) { select.value = choice.dataset.choiceValue; syncChoiceCards(choice.dataset.choiceTarget); if (['itemPriority','editTaskPriority'].includes(choice.dataset.choiceTarget)) syncImmediateAudience(choice.dataset.choiceTarget === 'editTaskPriority' ? 'editTask' : 'item'); } return; }
    const assigneeChoice = event.target.closest('[data-assignee-choice]');
    if (assigneeChoice) { chooseAssignee(assigneeChoice.dataset.assigneeChoice); return; }
    const avatarFilter = event.target.closest('[data-avatar-filter]');
    if (avatarFilter) {
      state.smartFilter = '';
      $('taskAssigneeFilter').value = avatarFilter.dataset.avatarFilter;
      renderDemandas();
      return;
    }
    const person = event.target.closest('[data-open-person]'); if (person) openPerson(person.dataset.openPerson);
    const showTasks = event.target.closest('[data-person-show-tasks]'); if (showTasks) showPersonTasks(showTasks.dataset.personShowTasks);
    const createFor = event.target.closest('[data-person-create-task]'); if (createFor) { const personId = createFor.dataset.personCreateTask; closeDrawer('personDrawer'); openQuickAdd('demanda', { assigneeId: personId }); }
    const task = event.target.closest('[data-open-task]'); if (task) { if (!$('personDrawer').classList.contains('hidden')) closeDrawer('personDrawer'); openTask(task.dataset.openTask); }
    const reminder = event.target.closest('[data-open-reminder]'); if (reminder) openReminder(reminder.dataset.openReminder);
    const academyDate = event.target.closest('[data-academy-date]'); if (academyDate) { state.academySelectedDate = academyDate.dataset.academyDate; renderAcademy(); refreshIcons(); return; }
    const academyTrainingEdit = event.target.closest('[data-academy-training-edit]'); if (academyTrainingEdit) { const training = state.academyReservations.find(item => item.id === academyTrainingEdit.dataset.academyTrainingEdit); if (training) openAcademyTraining(training); return; }
    const academyEdit = event.target.closest('[data-academy-edit]'); if (academyEdit) { const reservation = state.academyReservations.find(item => item.id === academyEdit.dataset.academyEdit); if (reservation) openAcademyBooking(reservation); return; }
    const academyStatus = event.target.closest('[data-academy-status]'); if (academyStatus) { updateAcademyStatus(academyStatus.dataset.academyId, academyStatus.dataset.academyStatus); return; }
    const date = event.target.closest('[data-calendar-date]'); if (date) { state.selectedDate = date.dataset.calendarDate; renderAgenda(); refreshIcons(); }
    const notification = event.target.closest('[data-notification-id]'); if (notification) { markNotificationAndOpen(notification); }
    const searchTask = event.target.closest('[data-search-task]'); if (searchTask) { closeSearch(); openTask(searchTask.dataset.searchTask); }
    const searchReminder = event.target.closest('[data-search-reminder]'); if (searchReminder) { closeSearch(); openReminder(searchReminder.dataset.searchReminder); }
  });
  $$('.kanban-column').forEach(column => {
    column.addEventListener('dragover', event => { event.preventDefault(); column.classList.add('drag-over'); });
    column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
    column.addEventListener('drop', event => { event.preventDefault(); column.classList.remove('drag-over'); const id = event.dataTransfer.getData('text/plain'); const task = state.tasks.find(item => item.id === id); if (task && task.status !== column.dataset.status) updateTaskStatus(id, column.dataset.status); });
  });
  document.addEventListener('keydown', event => {
    if (!$('intrusiveNotificationModal')?.classList.contains('hidden')) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); $('intrusiveNotificationCard')?.classList.remove('attention-pulse'); void $('intrusiveNotificationCard')?.offsetWidth; $('intrusiveNotificationCard')?.classList.add('attention-pulse'); }
      return;
    }
    if (!$('onboardingModal')?.classList.contains('hidden')) {
      if (event.key === 'Escape') { event.preventDefault(); closeOnboarding(false); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); moveOnboarding(1); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); moveOnboarding(-1); return; }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.matches?.('[data-open-person]')) { event.preventDefault(); openPerson(document.activeElement.dataset.openPerson); }
    if (event.key === 'Escape') { closeUserMenu(); closeSearch(); $$('.modal-layer:not(.hidden)').forEach(modal => { if (modal.id !== 'profileModal' || modal.dataset.required !== '1') closeModal(modal.id); }); closeDrawer('taskDrawer'); closeDrawer('personDrawer'); closeDrawer('notificationDrawer'); }
  });
}
async function markNotificationAndOpen(element) {
  const id = element.dataset.notificationId; const { error } = await db.rpc('marcar_notificacao_lida', { p_id: id }); if (!error) { const found = state.notifications.find(item => item.id === id); if (found) found.lida = true; renderNotifications(); }
  closeDrawer('notificationDrawer'); if (element.dataset.taskId) openTask(element.dataset.taskId); else if (element.dataset.reminderId) openReminder(element.dataset.reminderId);
}

/* =========================================================
   DEMANDAS V3.4 — MODELOS, DEPENDÊNCIAS, CHECKLIST E TEMPO
   ========================================================= */
function isV4MissingError(error) {
  const message = String(error?.message || error?.details || error || '');
  return /modelos_demanda|dependencias_tarefa|registros_tempo|fechamentos_mensais|criar_tarefa_v4|editar_tarefa_v4|schema cache|does not exist/i.test(message);
}

async function loadProductivityV4() {
  try {
    const [templatesResult, dependenciesResult, timeResult, closuresResult] = await Promise.all([
      db.from('modelos_demanda').select('*').eq('ativo', true).order('sistema', { ascending: false }).order('nome'),
      db.from('dependencias_tarefa').select('*').order('criado_em', { ascending: true }).limit(4000),
      db.from('registros_tempo').select('*').order('inicio_em', { ascending: false }).limit(6000),
      db.from('fechamentos_mensais').select('*').order('mes', { ascending: false }).limit(120)
    ]);
    const firstError = templatesResult.error || dependenciesResult.error || timeResult.error || closuresResult.error;
    if (firstError) throw firstError;
    state.templates = templatesResult.data || [];
    state.dependencies = dependenciesResult.data || [];
    state.timeEntries = timeResult.data || [];
    state.monthlyClosures = closuresResult.data || [];
    state.v4Ready = true;
  } catch (error) {
    if (!isV4MissingError(error)) throw error;
    console.warn('[Demandas V4] Migração de produtividade ainda não disponível:', error);
    state.templates = [];
    state.dependencies = [];
    state.timeEntries = [];
    state.monthlyClosures = [];
    state.v4Ready = false;
  }
}

function normalizeChecklist(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === 'string') return { texto: item.trim(), concluido: false, ordem: index };
    return {
      texto: String(item?.texto ?? item?.text ?? '').trim(),
      concluido: Boolean(item?.concluido ?? item?.done),
      ordem: Number.isFinite(Number(item?.ordem)) ? Number(item.ordem) : index
    };
  }).filter(item => item.texto).sort((a, b) => a.ordem - b.ordem);
}

function checklistFromText(text) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((texto, ordem) => ({ texto, concluido: false, ordem }));
}

function checklistToText(value) {
  return normalizeChecklist(value).map(item => item.texto).join('\n');
}

function selectedValues(select) {
  if (!select) return [];
  return [...select.selectedOptions].map(option => option.value).filter(Boolean);
}

function setSelectedValues(select, values = []) {
  if (!select) return;
  const wanted = new Set(values || []);
  [...select.options].forEach(option => { option.selected = wanted.has(option.value); });
}

function dependenciesForTask(taskId) {
  return state.dependencies.filter(item => item.tarefa_id === taskId);
}

function tasksDependingOn(taskId) {
  return state.dependencies.filter(item => item.depende_de_tarefa_id === taskId);
}

function dependencyTask(id) {
  return state.tasks.find(task => task.id === id);
}

function dependencyIsOpen(dep) {
  const task = dependencyTask(dep.depende_de_tarefa_id);
  return !task || task.arquivada_em || task.status !== 'concluida';
}

function taskIsBlocked(taskId) {
  return dependenciesForTask(taskId).some(dependencyIsOpen);
}

function populateDependencySelects(selectId, currentTaskId = null) {
  const select = $(selectId);
  if (!select) return;
  const selected = selectedValues(select);
  const items = state.tasks
    .filter(task => !task.arquivada_em && task.id !== currentTaskId)
    .sort((a, b) => Number(a.status === 'concluida') - Number(b.status === 'concluida') || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));
  select.innerHTML = items.map(task => `<option value="${task.id}">${task.status === 'concluida' ? '✓ ' : ''}${escapeHtml(task.titulo)}${task.projeto ? ` · ${escapeHtml(task.projeto)}` : ''} · ${STATUS[task.status]?.label || task.status}</option>`).join('');
  setSelectedValues(select, selected.filter(id => items.some(task => task.id === id)));
}

function renderTaskTemplateSelect() {
  const select = $('taskTemplateSelect');
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">Sem modelo</option>${state.templates.map(template => `<option value="${template.id}">${template.sistema ? 'PMG · ' : ''}${escapeHtml(template.nome)}</option>`).join('')}`;
  if (state.templates.some(template => template.id === current)) select.value = current;
  updateTaskTemplateActions();
}

function updateTaskTemplateActions() {
  const id = $('taskTemplateSelect')?.value || '';
  const template = state.templates.find(item => item.id === id);
  $('taskTemplateApplyBtn')?.toggleAttribute('disabled', !template);
  if ($('taskTemplateDeleteBtn')) $('taskTemplateDeleteBtn').classList.toggle('hidden', !template || template.sistema);
}

function templateDueDate(hours) {
  const amount = Number(hours);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return new Date(Date.now() + amount * 3600000);
}

function applyTaskTemplate() {
  const template = state.templates.find(item => item.id === $('taskTemplateSelect')?.value);
  if (!template) return toast('Escolha um modelo primeiro.', 'error');
  $('itemTitle').value = template.titulo_base || '';
  $('itemDescription').value = template.descricao_padrao || '';
  $('itemPriority').value = template.prioridade || 'media';
  $('itemSize').value = template.tamanho || 'media';
  $('itemEstimate').value = template.estimativa_horas ?? '';
  if ($('itemProject')) $('itemProject').value = template.projeto || '';
  $('itemTags').value = (template.tags || []).join(', ');
  if ($('itemChecklist')) $('itemChecklist').value = checklistToText(template.checklist);
  const due = templateDueDate(template.prazo_horas);
  if (due) {
    const parts = splitDateTime(due.toISOString());
    $('itemDueDate').value = parts.date;
    $('itemDueTime').value = parts.time || '17:00';
  }
  syncTaskFormVisuals('item');
  $('itemTitle').focus();
  refreshIcons();
  toast(`Modelo “${template.nome}” aplicado.`);
}

function openSaveTaskTemplate() {
  if (!isManager()) return;
  $('taskTemplateForm').reset();
  $('taskTemplateDeadlineHours').value = '48';
  $('taskTemplateBaseTitle').value = $('itemTitle').value.trim();
  $('taskTemplateModal').classList.remove('hidden');
  setTimeout(() => $('taskTemplateName').focus(), 50);
  refreshIcons();
}

async function saveTaskTemplate(event) {
  event.preventDefault();
  setLoading(true);
  try {
    const { error } = await db.rpc('salvar_modelo_demanda', {
      p_nome: $('taskTemplateName').value.trim(),
      p_titulo_base: $('taskTemplateBaseTitle').value.trim() || null,
      p_descricao_padrao: $('itemDescription').value.trim() || null,
      p_prioridade: $('itemPriority').value,
      p_tamanho: $('itemSize').value,
      p_estimativa_horas: $('itemEstimate').value ? Number($('itemEstimate').value) : null,
      p_prazo_horas: $('taskTemplateDeadlineHours').value ? Number($('taskTemplateDeadlineHours').value) : null,
      p_tags: $('itemTags').value.split(',').map(value => value.trim()).filter(Boolean),
      p_projeto: $('itemProject')?.value.trim() || null,
      p_checklist: checklistFromText($('itemChecklist')?.value || '')
    });
    if (error) throw error;
    closeModal('taskTemplateModal');
    await loadProductivityV4();
    renderTaskTemplateSelect();
    toast('Modelo salvo. Agora o trabalho repetitivo tem menos oportunidades de se reproduzir.');
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally { setLoading(false); }
}

async function deleteSelectedTaskTemplate() {
  const template = state.templates.find(item => item.id === $('taskTemplateSelect')?.value);
  if (!template || template.sistema) return;
  if (!confirm(`Excluir o modelo “${template.nome}”?`)) return;
  setLoading(true);
  try {
    const { error } = await db.rpc('excluir_modelo_demanda', { p_id: template.id });
    if (error) throw error;
    await loadProductivityV4();
    renderTaskTemplateSelect();
    toast('Modelo removido.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

function taskTimeEntries(taskId) {
  return state.timeEntries.filter(entry => entry.tarefa_id === taskId);
}

function entryElapsedMinutes(entry, now = new Date()) {
  if (entry.fim_em) return Number(entry.minutos || Math.max(0, (new Date(entry.fim_em) - new Date(entry.inicio_em)) / 60000));
  return Math.max(0, (now - new Date(entry.inicio_em)) / 60000);
}

function taskActualMinutes(taskId) {
  const now = new Date();
  return taskTimeEntries(taskId).reduce((sum, entry) => sum + entryElapsedMinutes(entry, now), 0);
}

function activeTimerFor(personId = state.me?.id, taskId = null) {
  return state.timeEntries.find(entry => entry.colaborador_id === personId && !entry.fim_em && (!taskId || entry.tarefa_id === taskId));
}

function formatMinutesHuman(minutes) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}min`;
}

function dependencyPanelHTML(task) {
  const dependencies = dependenciesForTask(task.id);
  const reverse = tasksDependingOn(task.id);
  const pending = dependencies.filter(dependencyIsOpen);
  const dependencyRows = dependencies.length ? dependencies.map(dep => {
    const item = dependencyTask(dep.depende_de_tarefa_id);
    if (!item) return '';
    const done = item.status === 'concluida' && !item.arquivada_em;
    return `<button type="button" class="dependency-task ${done ? 'done' : 'pending'}" data-open-task="${item.id}"><span class="dependency-state"><i data-lucide="${done ? 'circle-check-big' : 'lock-keyhole'}"></i></span><span><strong>${escapeHtml(item.titulo)}</strong><small>${escapeHtml(STATUS[item.status]?.label || item.status)}${item.projeto ? ` · ${escapeHtml(item.projeto)}` : ''}</small></span><i data-lucide="chevron-right"></i></button>`;
  }).join('') : `<div class="productivity-empty"><i data-lucide="git-branch"></i><span>Esta demanda pode começar sem depender de outra entrega.</span></div>`;
  const reverseText = reverse.length ? `<div class="dependency-releases"><i data-lucide="unlock-keyhole"></i><span>Ao concluir esta demanda, você libera <strong>${reverse.length}</strong> outra${reverse.length === 1 ? '' : 's'}.</span></div>` : '';
  return `<section class="productivity-card dependency-card ${pending.length ? 'blocked' : ''}"><div class="productivity-card-head"><div><span class="eyebrow">Dependências</span><h3>${pending.length ? `Bloqueada por ${pending.length} entrega${pending.length === 1 ? '' : 's'}` : 'Fluxo liberado'}</h3></div><span class="dependency-badge ${pending.length ? 'blocked' : 'free'}"><i data-lucide="${pending.length ? 'lock-keyhole' : 'unplug'}"></i>${pending.length ? 'Bloqueada' : 'Livre'}</span></div><div class="dependency-list">${dependencyRows}</div>${reverseText}</section>`;
}

function checklistPanelHTML(task) {
  const list = normalizeChecklist(task.checklist);
  const done = list.filter(item => item.concluido).length;
  const canEdit = !task.arquivada_em && task.status !== 'concluida' && (isManager() || task.responsavel_id === state.me?.id);
  const percent = list.length ? Math.round(done / list.length * 100) : 0;
  return `<section class="productivity-card checklist-card"><div class="productivity-card-head"><div><span class="eyebrow">Execução</span><h3>Checklist da demanda</h3></div><span class="checklist-progress-label">${done}/${list.length || 0} · ${percent}%</span></div>${list.length ? `<div class="checklist-progress-track"><i style="width:${percent}%"></i></div><div class="checklist-items">${list.map((item, index) => `<button type="button" class="checklist-item ${item.concluido ? 'done' : ''}" data-checklist-toggle="${index}" ${canEdit ? '' : 'disabled'}><span><i data-lucide="${item.concluido ? 'check' : 'circle'}"></i></span><strong>${escapeHtml(item.texto)}</strong></button>`).join('')}</div>` : `<div class="productivity-empty"><i data-lucide="list-checks"></i><span>Sem checklist. O gestor pode adicionar itens em Editar detalhes.</span></div>`}</section>`;
}

function timerPanelHTML(task) {
  const entries = taskTimeEntries(task.id);
  const actualMinutes = taskActualMinutes(task.id);
  const actualHours = actualMinutes / 60;
  const estimated = Number(task.estimativa_horas || sizeWeight(task) || 0);
  const percent = estimated > 0 ? Math.min(160, Math.round(actualHours / estimated * 100)) : 0;
  const active = activeTimerFor(state.me?.id, task.id);
  const another = activeTimerFor(state.me?.id);
  const canTrack = !task.arquivada_em && task.status !== 'concluida' && (isManager() || task.responsavel_id === state.me?.id);
  const action = active
    ? `<button type="button" class="time-action stop" data-task-time-stop="${task.id}"><i data-lucide="square"></i><span><strong>Pausar cronômetro</strong><small id="taskLiveTimer">${formatMinutesHuman(entryElapsedMinutes(active))}</small></span></button>`
    : canTrack
      ? `<button type="button" class="time-action start" data-task-time-start="${task.id}"><i data-lucide="play"></i><span><strong>Iniciar trabalho</strong><small>${another && another.tarefa_id !== task.id ? 'O cronômetro da outra demanda será pausado automaticamente.' : 'Registra o tempo real desta execução.'}</small></span></button>`
      : '';
  return `<section class="productivity-card time-card"><div class="productivity-card-head"><div><span class="eyebrow">Tempo</span><h3>Real x estimado</h3></div><span class="time-total">${formatMinutesHuman(actualMinutes)}</span></div><div class="time-comparison"><div><span>Real registrado</span><strong>${actualHours.toFixed(1).replace('.', ',')}h</strong></div><div><span>Estimativa</span><strong>${estimated ? `${estimated.toFixed(1).replace('.', ',')}h` : '—'}</strong></div><div><span>Uso da estimativa</span><strong class="${percent > 110 ? 'danger' : percent > 85 ? 'attention' : ''}">${estimated ? `${percent}%` : '—'}</strong></div></div>${estimated ? `<div class="time-progress-track"><i class="${percent > 110 ? 'over' : percent > 85 ? 'near' : ''}" style="width:${Math.min(100, percent)}%"></i></div>` : ''}${action}${entries.length ? `<small class="time-entry-count">${entries.length} sessão${entries.length === 1 ? '' : 'ões'} registrada${entries.length === 1 ? '' : 's'} nesta demanda.</small>` : ''}</section>`;
}

function injectProductivityTaskPanels() {
  const task = state.selectedTask;
  const root = $('taskDrawerContent');
  if (!task || !root) return;
  root.querySelectorAll('.productivity-v4-wrap').forEach(el => el.remove());
  const wrap = document.createElement('div');
  wrap.className = 'productivity-v4-wrap';
  wrap.innerHTML = `${taskIsBlocked(task.id) ? `<div class="task-blocked-banner"><i data-lucide="shield-alert"></i><div><strong>Esta demanda está bloqueada</strong><span>Ela só poderá iniciar ou voltar para revisão depois que todas as dependências pendentes forem concluídas.</span></div></div>` : ''}<div class="productivity-grid">${checklistPanelHTML(task)}${timerPanelHTML(task)}</div>${dependencyPanelHTML(task)}`;
  const firstDetail = root.querySelector('.detail-section');
  root.insertBefore(wrap, firstDetail || root.firstChild);
  if (state.activeTimerTick) clearInterval(state.activeTimerTick);
  const active = activeTimerFor(state.me?.id, task.id);
  if (active) {
    state.activeTimerTick = setInterval(() => {
      const label = $('taskLiveTimer');
      if (label && activeTimerFor(state.me?.id, task.id)) label.textContent = formatMinutesHuman(entryElapsedMinutes(active));
      else { clearInterval(state.activeTimerTick); state.activeTimerTick = null; }
    }, 1000);
  }
  refreshIcons();
}

async function toggleChecklistItem(index) {
  const task = state.selectedTask;
  if (!task) return;
  const checklist = normalizeChecklist(task.checklist);
  if (!checklist[index]) return;
  checklist[index].concluido = !checklist[index].concluido;
  setLoading(true);
  try {
    const { error } = await db.rpc('atualizar_checklist_tarefa', { p_tarefa_id: task.id, p_checklist: checklist });
    if (error) throw error;
    await refreshData();
    await openTask(task.id);
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

async function startTaskTimer(taskId) {
  setLoading(true);
  try {
    const { error } = await db.rpc('iniciar_tempo_tarefa', { p_tarefa_id: taskId });
    if (error) throw error;
    await refreshData();
    await openTask(taskId);
    toast('Cronômetro iniciado.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

async function stopTaskTimer(taskId) {
  setLoading(true);
  try {
    const { data, error } = await db.rpc('parar_tempo_tarefa', { p_tarefa_id: taskId, p_observacao: null });
    if (error) throw error;
    await refreshData();
    await openTask(taskId);
    toast(`Tempo registrado: ${formatMinutesHuman(data || 0)}.`);
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

function closureForMonth(value) {
  const key = `${String(value || monthInputValue())}-01`;
  return state.monthlyClosures.find(item => String(item.mes).slice(0, 10) === key) || null;
}

function entryMinutesInsideMonth(entry, start, end) {
  const a = Math.max(new Date(entry.inicio_em).getTime(), start.getTime());
  const rawEnd = entry.fim_em ? new Date(entry.fim_em).getTime() : Date.now();
  const b = Math.min(rawEnd, end.getTime());
  return Math.max(0, (b - a) / 60000);
}

function buildMonthlyReport(value) {
  const { start, end, label } = monthBounds(value);
  const operators = state.collaborators.filter(person => person.role !== 'gestor');
  const operatorIds = new Set(operators.map(person => person.id));
  const monthTimes = state.timeEntries.filter(entry => operatorIds.has(entry.colaborador_id) && new Date(entry.inicio_em) < end && new Date(entry.fim_em || Date.now()) >= start);
  const actualHoursForPerson = personId => monthTimes.filter(entry => entry.colaborador_id === personId).reduce((sum, entry) => sum + entryMinutesInsideMonth(entry, start, end), 0) / 60;

  const rows = operators.map(person => {
    const completed = state.tasks.filter(task => task.responsavel_id === person.id && task.status === 'concluida' && new Date(task.concluida_em || task.atualizado_em) >= start && new Date(task.concluida_em || task.atualizado_em) < end);
    const created = state.tasks.filter(task => task.responsavel_id === person.id && new Date(task.criado_em) >= start && new Date(task.criado_em) < end);
    const overdue = state.tasks.filter(task => task.responsavel_id === person.id && !task.arquivada_em && isOverdue(task));
    const active = state.tasks.filter(task => task.responsavel_id === person.id && !task.arquivada_em && task.status !== 'concluida');
    const approved = completed.filter(task => task.avaliacao_status === 'aprovada').length;
    const immediates = completed.filter(task => task.prioridade === 'imediata').length;
    const estimatedHours = completed.reduce((sum, task) => sum + sizeWeight(task), 0);
    const actualHours = actualHoursForPerson(person.id);
    const deadlineCompleted = completed.filter(task => taskDue(task) && task.concluida_em);
    const onTime = deadlineCompleted.filter(task => new Date(task.concluida_em) <= new Date(taskDue(task))).length;
    const onTimeRate = deadlineCompleted.length ? Math.round(onTime / deadlineCompleted.length * 100) : null;
    const cycleValues = completed.filter(task => task.criado_em && (task.concluida_em || task.atualizado_em)).map(task => Math.max(0, (new Date(task.concluida_em || task.atualizado_em) - new Date(task.criado_em)) / 86400000));
    const avgCycle = cycleValues.length ? cycleValues.reduce((a, b) => a + b, 0) / cycleValues.length : null;
    const transfersIn = state.transfers.filter(item => item.para_colaborador_id === person.id && new Date(item.criado_em) >= start && new Date(item.criado_em) < end);
    const transfersOut = state.transfers.filter(item => item.de_colaborador_id === person.id && new Date(item.criado_em) >= start && new Date(item.criado_em) < end);
    return { person, created: created.length, completed: completed.length, approved, immediates, estimatedHours, actualHours, hours: actualHours, active: active.length, overdue: overdue.length, onTimeRate, avgCycle, transfersIn: transfersIn.length, transfersOut: transfersOut.length };
  }).sort((a, b) => b.completed - a.completed || b.actualHours - a.actualHours);

  const completedInMonth = state.tasks.filter(task => task.status === 'concluida' && operatorIds.has(task.responsavel_id) && new Date(task.concluida_em || task.atualizado_em) >= start && new Date(task.concluida_em || task.atualizado_em) < end);
  const createdInMonth = state.tasks.filter(task => operatorIds.has(task.responsavel_id) && new Date(task.criado_em) >= start && new Date(task.criado_em) < end);
  const projectSet = new Set([...completedInMonth, ...createdInMonth, ...monthTimes.map(entry => state.tasks.find(task => task.id === entry.tarefa_id)).filter(Boolean)].map(task => String(task.projeto || '').trim() || 'Sem projeto'));
  const projects = [...projectSet].map(name => {
    const taskMatches = task => (String(task?.projeto || '').trim() || 'Sem projeto') === name;
    const completed = completedInMonth.filter(taskMatches);
    const created = createdInMonth.filter(taskMatches);
    const active = state.tasks.filter(task => operatorIds.has(task.responsavel_id) && !task.arquivada_em && task.status !== 'concluida' && taskMatches(task));
    const projectEntries = monthTimes.filter(entry => taskMatches(state.tasks.find(task => task.id === entry.tarefa_id)));
    const actualHours = projectEntries.reduce((sum, entry) => sum + entryMinutesInsideMonth(entry, start, end), 0) / 60;
    const estimatedHours = completed.reduce((sum, task) => sum + sizeWeight(task), 0);
    return { name, created: created.length, completed: completed.length, actualHours, estimatedHours, hours: actualHours, active: active.length, overdue: active.filter(isOverdue).length, immediates: completed.filter(task => task.prioridade === 'imediata').length };
  }).sort((a, b) => b.completed - a.completed || b.actualHours - a.actualHours || a.name.localeCompare(b.name, 'pt-BR'));
  const completedWithDeadline = completedInMonth.filter(task => taskDue(task) && task.concluida_em);
  const totalOnTime = completedWithDeadline.filter(task => new Date(task.concluida_em) <= new Date(taskDue(task))).length;
  return {
    version: '3.4', label, rows, projects,
    totalCompleted: rows.reduce((sum, row) => sum + row.completed, 0),
    totalActualHours: rows.reduce((sum, row) => sum + row.actualHours, 0),
    totalEstimatedHours: rows.reduce((sum, row) => sum + row.estimatedHours, 0),
    totalHours: rows.reduce((sum, row) => sum + row.actualHours, 0),
    totalCreated: rows.reduce((sum, row) => sum + row.created, 0),
    teamOnTimeRate: completedWithDeadline.length ? Math.round(totalOnTime / completedWithDeadline.length * 100) : null
  };
}

function renderMonthlyReport() {
  const value = $('monthlyReportMonth').value || monthInputValue();
  const closure = closureForMonth(value);
  const report = closure?.dados || buildMonthlyReport(value);
  state.monthlyReportData = report;
  const closedBy = collaborator(closure?.fechado_por)?.nome || 'gestor';
  if ($('monthlySnapshotStatus')) {
    $('monthlySnapshotStatus').classList.toggle('hidden', !closure);
    $('monthlySnapshotStatus').innerHTML = closure ? `<i data-lucide="lock-keyhole"></i><div><strong>Mês fechado</strong><span>Este relatório está congelado desde ${formatDateTime(closure.fechado_em)} por ${escapeHtml(closedBy)}. Alterações posteriores não mudam estes números.</span></div>` : '';
  }
  $('monthlySnapshotBtn')?.classList.toggle('hidden', Boolean(closure));
  $('monthlyReopenBtn')?.classList.toggle('hidden', !closure);
  const projectsHTML = report.projects?.length ? `<section class="monthly-project-section"><div class="monthly-section-title"><div><span class="eyebrow">Projetos</span><h4>Onde o esforço do mês foi aplicado</h4></div><span>${report.projects.length} projeto${report.projects.length === 1 ? '' : 's'}</span></div><div class="monthly-project-grid">${report.projects.map(project => `<article class="monthly-project-card ${project.name === 'Sem projeto' ? 'unclassified' : ''}"><div class="monthly-project-card-head"><span><i data-lucide="folder-kanban"></i></span><div><strong>${escapeHtml(project.name)}</strong><small>${project.created} recebida(s) · ${project.completed} concluída(s)</small></div></div><div class="monthly-project-stats"><span><strong>${formatHours(project.actualHours || 0)}</strong><small>reais</small></span><span><strong>${formatHours(project.estimatedHours || 0)}</strong><small>estimadas</small></span><span class="${project.overdue ? 'danger' : ''}"><strong>${project.overdue}</strong><small>atrasadas</small></span><span><strong>${project.immediates}</strong><small>imediatas</small></span></div></article>`).join('')}</div></section>` : '<section class="monthly-project-section"><div class="empty-state"><i data-lucide="folder-kanban"></i>Nenhum projeto com atividade neste mês.</div></section>';
  const totalActual = report.totalActualHours ?? report.totalHours ?? 0;
  const totalEstimated = report.totalEstimatedHours ?? 0;
  $('monthlyReportContent').innerHTML = `<div class="monthly-report-hero"><div><span class="eyebrow light">${escapeHtml(report.label)}</span><h3>Performance operacional da equipe</h3><p>Gestores ficam fora da comparação. O relatório mostra volume, prazo, ciclo, transferências e agora compara horas reais com as estimadas.</p></div><div class="monthly-report-totals"><span><strong>${report.totalCompleted}</strong>concluídas</span><span><strong>${formatHours(totalActual)}</strong>horas reais</span><span><strong>${formatHours(totalEstimated)}</strong>estimadas</span><span><strong>${report.teamOnTimeRate === null ? '—' : report.teamOnTimeRate + '%'}</strong>no prazo</span></div></div>${projectsHTML}<section class="monthly-people-section"><div class="monthly-section-title"><div><span class="eyebrow">Equipe</span><h4>Performance por colaborador</h4></div></div><div class="monthly-report-table v34"><div class="monthly-report-row head"><span>Colaborador</span><span>Recebidas</span><span>Concluídas</span><span>Real</span><span>Estimado</span><span>No prazo</span><span>Ciclo</span><span>Ativas</span><span>Atrasadas</span><span>Transferências</span></div>${(report.rows || []).map((row, i) => `<div class="monthly-report-row"><span class="monthly-person">${avatarHTML(row.person, 'sm')}<span><strong>${escapeHtml(row.person.nome)}</strong><small>${escapeHtml(row.person.cargo || 'Marketing')} · #${i + 1}${row.immediates ? ` · ${row.immediates} imediata(s)` : ''}</small></span></span><strong>${row.created}</strong><strong>${row.completed}</strong><strong>${formatHours(row.actualHours ?? row.hours ?? 0)}</strong><strong>${formatHours(row.estimatedHours ?? 0)}</strong><strong>${row.onTimeRate === null ? '—' : row.onTimeRate + '%'}</strong><strong>${row.avgCycle === null ? '—' : row.avgCycle.toFixed(1).replace('.', ',') + 'd'}</strong><strong>${row.active}</strong><strong class="${row.overdue ? 'danger' : ''}">${row.overdue}</strong><span>${row.transfersIn} receb. · ${row.transfersOut} env.</span></div>`).join('') || '<div class="empty-state">Nenhum colaborador operacional encontrado.</div>'}</div></section>`;
  refreshIcons();
}

async function saveMonthlySnapshot() {
  if (!isManager()) return;
  const value = $('monthlyReportMonth').value || monthInputValue();
  if (!confirm(`Fechar ${monthBounds(value).label}? O relatório ficará congelado até um gestor reabrir o mês.`)) return;
  setLoading(true);
  try {
    const report = buildMonthlyReport(value);
    const { error } = await db.rpc('salvar_fechamento_mensal', { p_mes: `${value}-01`, p_dados: report });
    if (error) throw error;
    await loadProductivityV4();
    renderMonthlyReport();
    toast('Mês fechado e relatório congelado.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

async function reopenMonthlySnapshot() {
  if (!isManager()) return;
  const value = $('monthlyReportMonth').value || monthInputValue();
  if (!confirm(`Reabrir ${monthBounds(value).label}? O relatório voltará a refletir os dados atuais.`)) return;
  setLoading(true);
  try {
    const { error } = await db.rpc('reabrir_fechamento_mensal', { p_mes: `${value}-01` });
    if (error) throw error;
    await loadProductivityV4();
    renderMonthlyReport();
    toast('Mês reaberto.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

function exportMonthlyReportCsv() {
  const report = state.monthlyReportData || buildMonthlyReport($('monthlyReportMonth').value);
  const lines = [
    ['COLABORADORES'],
    ['Colaborador','Cargo','Recebidas','Concluídas','Horas reais','Horas estimadas','No prazo (%)','Ciclo médio (dias)','Imediatas concluídas','Ativas agora','Atrasadas agora','Transferências recebidas','Transferências enviadas'],
    ...(report.rows || []).map(row => [row.person.nome,row.person.cargo || '',row.created,row.completed,row.actualHours ?? row.hours ?? 0,row.estimatedHours ?? '',row.onTimeRate ?? '',row.avgCycle === null ? '' : row.avgCycle.toFixed(1),row.immediates,row.active,row.overdue,row.transfersIn,row.transfersOut]),
    [],
    ['PROJETOS'],
    ['Projeto','Recebidas','Concluídas','Horas reais','Horas estimadas','Ativas agora','Atrasadas agora','Imediatas concluídas'],
    ...(report.projects || []).map(project => [project.name,project.created,project.completed,project.actualHours ?? project.hours ?? 0,project.estimatedHours ?? '',project.active,project.overdue,project.immediates])
  ].map(row => row.map(csvCell).join(';'));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `relatorio-demandas-${$('monthlyReportMonth').value}.csv`; a.click(); URL.revokeObjectURL(url);
}

function printMonthlyReport() {
  const html = $('monthlyReportContent').innerHTML;
  const w = window.open('', '_blank', 'width=1400,height=900');
  if (!w) return toast('Permita pop-ups para imprimir o relatório.', 'error');
  w.document.write(`<!doctype html><html><head><title>Relatório mensal PMG Connect</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#17221b}.monthly-report-row{display:grid;grid-template-columns:2.2fr repeat(9,minmax(70px,1fr));gap:8px;padding:10px;border-bottom:1px solid #ddd;align-items:center;font-size:11px}.head{font-weight:bold;background:#f2f5f3}.avatar{display:none}.monthly-report-hero{padding:22px;background:#164b2d;color:white;margin-bottom:20px}.monthly-report-totals{display:flex;gap:30px}.monthly-report-totals span{display:grid}.monthly-project-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:15px 0}.monthly-project-card{border:1px solid #ddd;padding:12px;border-radius:10px}.monthly-project-stats{display:flex;gap:15px;margin-top:10px}.monthly-project-stats span{display:grid}.monthly-person small{display:block;color:#777}</style></head><body>${html}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 250);
}

function bindProductivityV4Events() {
  $('taskTemplateSelect')?.addEventListener('change', updateTaskTemplateActions);
  $('taskTemplateApplyBtn')?.addEventListener('click', applyTaskTemplate);
  $('taskTemplateSaveBtn')?.addEventListener('click', openSaveTaskTemplate);
  $('taskTemplateDeleteBtn')?.addEventListener('click', deleteSelectedTaskTemplate);
  $('taskTemplateForm')?.addEventListener('submit', saveTaskTemplate);
  $('monthlySnapshotBtn')?.addEventListener('click', saveMonthlySnapshot);
  $('monthlyReopenBtn')?.addEventListener('click', reopenMonthlySnapshot);

  document.addEventListener('click', event => {
    const checklist = event.target.closest('[data-checklist-toggle]');
    if (checklist) { toggleChecklistItem(Number(checklist.dataset.checklistToggle)); return; }
    const start = event.target.closest('[data-task-time-start]');
    if (start) { startTaskTimer(start.dataset.taskTimeStart); return; }
    const stop = event.target.closest('[data-task-time-stop]');
    if (stop) { stopTaskTimer(stop.dataset.taskTimeStop); return; }
  });
}

// Injeta os novos painéis sem duplicar a lógica já estável do drawer.
const renderTaskDrawerV33 = renderTaskDrawer;
renderTaskDrawer = function renderTaskDrawerV34() {
  renderTaskDrawerV33();
  injectProductivityTaskPanels();
};



/* =========================================================
   PMG CONNECT V3.5 — GESTÃO INTELIGENTE
   Meu Dia, Projetos, Automações, Capacidade, níveis de alerta,
   busca por comandos, relatório comparativo e evolução individual.
   ========================================================= */

function isMissingV5Schema(error) {
  return /projetos_marketing|automacoes_demanda|salvar_projeto_marketing|salvar_automacao_demanda|schema cache|does not exist/i.test(error?.message || error?.details || String(error || ''));
}

async function loadIntelligenceV5() {
  try {
    const [projects, automations] = await Promise.all([
      db.from('projetos_marketing').select('*').order('atualizado_em', { ascending: false }).limit(500),
      db.from('automacoes_demanda').select('*').order('atualizado_em', { ascending: false }).limit(500)
    ]);
    const firstError = projects.error || automations.error;
    if (firstError) throw firstError;
    state.projects = projects.data || [];
    state.automations = automations.data || [];
    state.intelligenceReady = true;
    await maybeProcessPeriodicAutomations();
  } catch (error) {
    if (!isMissingV5Schema(error)) console.warn('[v3.5]', error);
    state.projects = [];
    state.automations = [];
    state.intelligenceReady = false;
  }
}

async function maybeProcessPeriodicAutomations() {
  if (!state.intelligenceReady) return;
  const key = 'pmg:v35:automation-scan';
  const last = Number(localStorage.getItem(key) || 0);
  if (Date.now() - last < 15 * 60 * 1000) return;
  localStorage.setItem(key, String(Date.now()));
  try {
    await db.rpc('processar_automacoes_periodicas');
    await db.rpc('gerar_resumo_diario_demandas');
  } catch (error) { if (!isMissingV5Schema(error)) console.warn('[automacoes periodicas]', error); }
}

function renderV5SetupNotice(id, feature) {
  const el = $(id); if (!el) return;
  el.classList.toggle('hidden', state.intelligenceReady);
  if (!state.intelligenceReady) el.innerHTML = `<i data-lucide="database-zap"></i><div><strong>${feature} aguardando a migração V3.5</strong><span>O restante do PMG Connect continua funcionando. Execute <b>sql/05-GESTAO-INTELIGENTE-V3-5.sql</b> no Supabase para liberar gravação e automações.</span></div>`;
}

function renderSmartDay(mine) {
  const board = $('smartDayBoard'); if (!board) return;
  const active = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida');
  const evaluation = isManager() ? active.filter(task => task.status === 'revisao') : [];
  const unique = new Map([...mine, ...evaluation].map(task => [task.id, task]));
  const candidates = [...unique.values()];
  const used = new Set();
  const take = predicate => candidates.filter(task => !used.has(task.id) && predicate(task)).sort(taskSortByAttention).filter(task => { used.add(task.id); return true; });
  const now = take(task => task.prioridade === 'imediata' || isOverdue(task) || (isManager() && task.status === 'revisao'));
  const today = take(task => taskDueKey(task) === todayKey());
  const weekLimit = addDays(new Date(), 7).getTime();
  const week = take(task => { const due = taskDue(task); return due && new Date(due).getTime() <= weekLimit; });
  const later = take(() => true);
  const buckets = [
    ['agora', 'Agora', 'siren', now, 'Críticas, atrasadas e revisões'],
    ['hoje', 'Hoje', 'clock-3', today, 'Precisa sair ainda hoje'],
    ['semana', 'Esta semana', 'calendar-range', week, 'Próximos 7 dias'],
    ['depois', 'Pode esperar', 'layers-3', later, 'Sem pressão imediata']
  ];
  $('smartDayCount').textContent = `${candidates.length} ${candidates.length === 1 ? 'item' : 'itens'}`;
  board.innerHTML = buckets.map(([tone, title, icon, tasks, desc]) => `<section class="smart-day-column ${tone}"><header><span><i data-lucide="${icon}"></i></span><div><strong>${title}</strong><small>${desc}</small></div><b>${tasks.length}</b></header><div class="smart-day-items">${tasks.length ? tasks.slice(0, 7).map(smartDayTaskHTML).join('') : `<div class="smart-day-empty"><i data-lucide="circle-check"></i><span>Nada aqui</span></div>`}</div></section>`).join('');
  refreshIcons();
}

function smartDayTaskHTML(task) {
  const blocked = typeof taskIsBlocked === 'function' && taskIsBlocked(task.id);
  const person = collaborator(task.responsavel_id);
  return `<button type="button" class="smart-day-task ${isOverdue(task) ? 'late' : ''}" data-open-task="${task.id}"><i class="focus-priority ${task.prioridade}"></i><span><strong>${escapeHtml(task.titulo)}</strong><small>${blocked ? 'Bloqueada · ' : ''}${escapeHtml(task.projeto || person?.nome || 'Sem projeto')} · ${escapeHtml(dueLabel(task))}</small></span><i data-lucide="chevron-right"></i></button>`;
}

function forecastHours(personId, days) {
  const limit = addDays(new Date(), days).getTime();
  return state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida' && task.responsavel_id === personId).filter(task => {
    const due = taskDue(task); if (!due) return days >= 30;
    return new Date(due).getTime() <= limit;
  }).reduce((sum, task) => sum + sizeWeight(task), 0);
}
function forecastPercent(hours, days) {
  const capacity = TEAM_CAPACITY_HOURS * Math.max(1, days / 7);
  return Math.round(hours / capacity * 100);
}
function capacityTone(percent) { return percent >= 100 ? 'critical' : percent >= 80 ? 'attention' : percent >= 55 ? 'busy' : 'balanced'; }
function renderTeamCapacityForecast(stats) {
  const el = $('teamCapacityForecast'); if (!el || !isManager()) return;
  const people = stats.filter(item => item.person.role !== 'gestor').sort((a,b) => b.hours - a.hours || a.person.nome.localeCompare(b.person.nome,'pt-BR'));
  el.innerHTML = people.length ? people.map(item => {
    const ranges = [7,14,30].map(days => { const h=forecastHours(item.person.id, days), p=forecastPercent(h,days); return {days,h,p,tone:capacityTone(p)}; });
    return `<button type="button" class="capacity-person" data-open-person="${item.person.id}"><div class="capacity-person-head">${avatarHTML(item.person,'sm')}<span><strong>${escapeHtml(item.person.nome)}</strong><small>${escapeHtml(item.person.cargo || 'Marketing')}</small></span><i data-lucide="chevron-right"></i></div><div class="capacity-range-list">${ranges.map(r=>`<div class="capacity-range"><span><b>${r.days} dias</b><small>${formatHours(r.h)} · ${r.p}%</small></span><div class="capacity-bar"><i class="${r.tone}" style="width:${Math.min(100,r.p)}%"></i></div></div>`).join('')}</div></button>`;
  }).join('') : `<div class="empty-state"><i data-lucide="users-round"></i>Nenhum colaborador operacional encontrado.</div>`;
  refreshIcons();
}

function formatPlainDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return formatDate(value, { year: true });
  return `${match[3]}/${match[2]}/${match[1]}`;
}
function projectCatalog() {
  const registered = new Map(state.projects.map(project => [String(project.nome || '').trim().toLocaleLowerCase('pt-BR'), { ...project, registered: true }]));
  for (const name of projectNames()) {
    const key = name.toLocaleLowerCase('pt-BR');
    if (!registered.has(key)) registered.set(key, { id: `derived:${name}`, nome: name, objetivo: '', status: 'ativo', registered: false, responsavel_id: null, inicio_em: null, prazo_em: null });
  }
  return [...registered.values()].sort((a,b) => String(a.nome).localeCompare(String(b.nome),'pt-BR'));
}
function projectTasks(project) { const key=String(project?.nome||'').trim().toLocaleLowerCase('pt-BR'); return state.tasks.filter(task => String(task.projeto||'').trim().toLocaleLowerCase('pt-BR')===key && !task.arquivada_em); }
function timeEntryTotalMinutes(entry) {
  if (!entry) return 0;
  if (entry.fim_em && Number.isFinite(Number(entry.minutos)) && Number(entry.minutos) > 0) return Number(entry.minutos);
  const start = new Date(entry.inicio_em).getTime();
  const end = new Date(entry.fim_em || Date.now()).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / 60000) : 0;
}
function projectStats(project) {
  const tasks=projectTasks(project), completed=tasks.filter(t=>t.status==='concluida'), active=tasks.filter(t=>t.status!=='concluida'), overdue=active.filter(isOverdue);
  const estimated=tasks.reduce((s,t)=>s+sizeWeight(t),0);
  const taskIds=new Set(tasks.map(t=>t.id));
  const actual=state.timeEntries.filter(e=>taskIds.has(e.tarefa_id)).reduce((s,e)=>s+timeEntryTotalMinutes(e),0)/60;
  const progress=tasks.length?Math.round(completed.length/tasks.length*100):0;
  const blocked=active.filter(t=>typeof taskIsBlocked==='function'&&taskIsBlocked(t.id));
  return {tasks,completed,active,overdue,estimated,actual,progress,blocked};
}
function renderProjects() {
  const grid=$('projectGrid'); if(!grid)return;
  renderV5SetupNotice('projectSetupNotice','Projetos completos');
  let projects=projectCatalog();
  const q=(state.projectSearch||'').trim().toLowerCase(), status=state.projectStatusFilter||'';
  if(q) projects=projects.filter(p=>[p.nome,p.objetivo,collaborator(p.responsavel_id)?.nome].join(' ').toLowerCase().includes(q));
  if(status) projects=projects.filter(p=>(p.status||'ativo')===status);
  const statsAll=projects.map(p=>[p,projectStats(p)]);
  const activeCount=projectCatalog().filter(p=>(p.status||'ativo')==='ativo').length;
  const totalOpen=projectCatalog().reduce((s,p)=>s+projectStats(p).active.length,0);
  const totalOverdue=projectCatalog().reduce((s,p)=>s+projectStats(p).overdue.length,0);
  $('projectSummary').innerHTML=[teamSummaryCard('folder-kanban',projectCatalog().length,'Projetos'),teamSummaryCard('play-circle',activeCount,'Ativos'),teamSummaryCard('clipboard-list',totalOpen,'Demandas abertas'),teamSummaryCard('triangle-alert',totalOverdue,'Atrasadas',totalOverdue?'danger':'')].join('');
  grid.innerHTML=statsAll.length?statsAll.map(([p,s])=>projectCardHTML(p,s)).join(''):`<div class="team-empty"><i data-lucide="folder-search"></i><strong>Nenhum projeto encontrado</strong><span>Crie um projeto ou use o campo Projeto em uma demanda.</span></div>`;
  if(state.selectedProjectId){const p=projectCatalog().find(x=>x.id===state.selectedProjectId||x.nome===state.selectedProjectId); if(p)renderProjectDetail(p); else $('projectDetail').classList.add('hidden');}
  refreshIcons();
}
function projectCardHTML(project,stats){const owner=collaborator(project.responsavel_id);const status=project.status||'ativo';return `<article class="project-card status-${status}" data-open-project="${escapeHtml(project.id||project.nome)}"><div class="project-card-head"><span class="project-card-icon"><i data-lucide="folder-kanban"></i></span><div><span class="project-status ${status}">${status==='concluido'?'Concluído':status==='planejado'?'Planejado':status==='pausado'?'Pausado':'Ativo'}</span><h3>${escapeHtml(project.nome)}</h3><p>${escapeHtml(project.objetivo||'Projeto criado a partir das demandas existentes.')}</p></div><button class="icon-btn subtle manager-only" type="button" data-edit-project="${escapeHtml(project.id||'')}" ${project.registered?'':'disabled'} title="Editar projeto"><i data-lucide="pencil"></i></button></div><div class="project-progress"><span><strong>${stats.progress}%</strong><small>${stats.completed.length}/${stats.tasks.length} concluídas</small></span><div><i style="width:${stats.progress}%"></i></div></div><div class="project-card-metrics"><span><strong>${stats.active.length}</strong><small>abertas</small></span><span class="${stats.overdue.length?'danger':''}"><strong>${stats.overdue.length}</strong><small>atrasadas</small></span><span><strong>${formatHours(stats.actual)}</strong><small>reais</small></span><span><strong>${formatHours(stats.estimated)}</strong><small>estimadas</small></span></div><footer>${owner?avatarHTML(owner,'sm'):`<span class="project-owner-empty"><i data-lucide="user-round"></i></span>`}<span>${escapeHtml(owner?.nome||'Sem responsável principal')}</span><small>${project.prazo_em?`Prazo ${formatPlainDate(project.prazo_em)}`:'Sem prazo final'}</small></footer></article>`;}
function renderProjectDetail(project){const el=$('projectDetail');if(!el)return;const s=projectStats(project);const ordered=[...s.tasks].sort((a,b)=>new Date(taskDue(a)||'9999-12-31')-new Date(taskDue(b)||'9999-12-31'));const ids=new Set(ordered.map(t=>t.id));const edges=state.dependencies.filter(d=>ids.has(d.tarefa_id)&&ids.has(d.depende_de_tarefa_id));el.classList.remove('hidden');el.innerHTML=`<div class="project-detail-head"><div><span class="eyebrow">Timeline e dependências</span><h3>${escapeHtml(project.nome)}</h3><p>${escapeHtml(project.objetivo||'Acompanhe a sequência das entregas e onde o fluxo está bloqueado.')}</p></div><button class="icon-btn subtle" data-close-project-detail title="Fechar"><i data-lucide="x"></i></button></div><div class="project-timeline">${ordered.length?ordered.map((t,i)=>{const deps=edges.filter(d=>d.tarefa_id===t.id).map(d=>state.tasks.find(x=>x.id===d.depende_de_tarefa_id)).filter(Boolean);return `<button class="project-timeline-task ${t.status} ${isOverdue(t)?'late':''} ${taskIsBlocked(t.id)?'blocked':''}" data-open-task="${t.id}"><span class="project-timeline-index">${i+1}</span><div><strong>${escapeHtml(t.titulo)}</strong><small>${STATUS[t.status]?.label||t.status} · ${escapeHtml(dueLabel(t))}${deps.length?` · depende de ${deps.map(x=>x.titulo).join(', ')}`:''}</small></div><span class="priority-pill ${t.prioridade}">${PRIORITY[t.prioridade]}</span><i data-lucide="chevron-right"></i></button>`}).join(''):`<div class="empty-state"><i data-lucide="workflow"></i>Nenhuma demanda vinculada a este projeto.</div>`}</div>`;refreshIcons();}

function openProjectModal(project=null){if(!isManager())return;if(!state.intelligenceReady)return toast('Execute o SQL V3.5 no Supabase antes de cadastrar projetos.','error');$('projectForm').reset();$('projectId').value=project?.id||'';$('projectModalTitle').textContent=project?'Editar projeto':'Novo projeto';$('projectName').value=project?.nome||'';$('projectObjective').value=project?.objetivo||'';$('projectStatus').value=project?.status||'ativo';$('projectStart').value=String(project?.inicio_em||'').slice(0,10);$('projectDue').value=String(project?.prazo_em||'').slice(0,10);$('projectOwner').innerHTML=`<option value="">Sem responsável principal</option>${state.collaborators.map(p=>`<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}`;$('projectOwner').value=project?.responsavel_id||'';$('projectModal').classList.remove('hidden');refreshIcons();}
async function saveProject(event){event.preventDefault();if(!state.intelligenceReady)return;setLoading(true);try{const {error}=await db.rpc('salvar_projeto_marketing',{p_id:$('projectId').value||null,p_nome:$('projectName').value.trim(),p_objetivo:$('projectObjective').value.trim()||null,p_responsavel_id:$('projectOwner').value||null,p_inicio_em:$('projectStart').value||null,p_prazo_em:$('projectDue').value||null,p_status:$('projectStatus').value});if(error)throw error;closeModal('projectModal');await loadIntelligenceV5();await loadTasks();renderProjects();renderShell();toast('Projeto salvo.');}catch(error){toast(errorMessage(error),'error')}finally{setLoading(false)}}

const AUTOMATION_TRIGGER_LABELS={tarefa_criada:'Demanda criada',status_alterado:'Status alterado',prioridade_alterada:'Prioridade alterada',revisao:'Entrou em revisão',conclusao:'Concluída',prazo_24h:'Prazo em até 24h',atrasada:'Demanda atrasada',sem_movimentacao_3d:'3 dias sem movimentação'};
const AUTOMATION_DEST_LABELS={responsavel:'Responsável',criador:'Criador',gestores:'Gestores',equipe:'Toda a equipe'};
function renderAutomations(){const list=$('automationList');if(!list)return;renderV5SetupNotice('automationSetupNotice','Central de Automações');if(!isManager()){list.innerHTML='<div class="empty-state"><i data-lucide="lock-keyhole"></i>Somente gestores configuram automações.</div>';return}const active=state.automations.filter(a=>a.ativo).length;$('automationSummary').innerHTML=[teamSummaryCard('workflow',state.automations.length,'Regras criadas'),teamSummaryCard('toggle-right',active,'Ativas'),teamSummaryCard('bell-ring',state.automations.filter(a=>['critica','importante'].includes(a.nivel)).length,'Alertas prioritários')].join('');list.innerHTML=state.intelligenceReady?(state.automations.length?state.automations.map(automationCardHTML).join(''):`<div class="automation-empty card"><i data-lucide="workflow"></i><strong>Nenhuma automação criada</strong><span>Use um dos exemplos acima ou crie uma regra personalizada.</span></div>`):'';refreshIcons();}
function automationCardHTML(rule){const condition=rule.condicao_campo&&rule.condicao_campo!=='qualquer'?`${rule.condicao_campo} = ${rule.condicao_valor}`:'qualquer demanda';return `<article class="automation-card ${rule.ativo?'active':'disabled'} level-${rule.nivel||'normal'}"><div class="automation-card-main"><span class="automation-card-level ${rule.nivel||'normal'}"><i data-lucide="${rule.nivel==='critica'?'siren':rule.nivel==='importante'?'triangle-alert':rule.nivel==='informativa'?'info':'bell'}"></i></span><div><div class="automation-card-title"><strong>${escapeHtml(rule.nome)}</strong><span>${rule.ativo?'Ativa':'Pausada'}</span></div><p><b>SE</b> ${escapeHtml(AUTOMATION_TRIGGER_LABELS[rule.gatilho]||rule.gatilho)} <b>E</b> ${escapeHtml(condition)} <b>ENTÃO</b> notificar ${escapeHtml(AUTOMATION_DEST_LABELS[rule.acao_destino]||rule.acao_destino)}.</p><small>${escapeHtml(rule.mensagem||'Mensagem padrão do PMG Connect')}</small></div></div><div class="automation-card-actions"><button type="button" class="btn soft" data-toggle-automation="${rule.id}"><i data-lucide="${rule.ativo?'pause':'play'}"></i>${rule.ativo?'Pausar':'Ativar'}</button><button type="button" class="icon-btn subtle" data-edit-automation="${rule.id}"><i data-lucide="pencil"></i></button></div></article>`;}
function openAutomationModal(rule=null,template=null){if(!isManager())return;if(!state.intelligenceReady)return toast('Execute o SQL V3.5 no Supabase antes de criar automações.','error');$('automationForm').reset();$('automationId').value=rule?.id||'';$('automationModalTitle').textContent=rule?'Editar automação':'Nova automação';$('automationName').value=rule?.nome||'';$('automationTrigger').value=rule?.gatilho||'tarefa_criada';$('automationConditionField').value=rule?.condicao_campo||'qualquer';$('automationConditionValue').value=rule?.condicao_valor||'';$('automationDestination').value=rule?.acao_destino||'responsavel';$('automationLevel').value=rule?.nivel||'normal';$('automationMessage').value=rule?.mensagem||'';$('automationEnabled').checked=rule?.ativo!==false;$('automationDeleteBtn').classList.toggle('hidden',!rule);if(template)applyAutomationTemplate(template);$('automationModal').classList.remove('hidden');refreshIcons();}
function applyAutomationTemplate(template){const presets={imediata:{name:'Alerta de demanda imediata',trigger:'tarefa_criada',field:'prioridade',value:'imediata',dest:'responsavel',level:'critica',message:'Você recebeu uma demanda IMEDIATA. Abra agora e verifique o briefing.'},revisao:{name:'Revisão aguardando gestor',trigger:'revisao',field:'qualquer',value:'',dest:'gestores',level:'importante',message:'Uma demanda entrou em revisão e aguarda avaliação do gestor.'},prazo:{name:'Prazo em 24 horas',trigger:'prazo_24h',field:'qualquer',value:'',dest:'responsavel',level:'importante',message:'Esta demanda vence em até 24 horas. Revise o andamento e o prazo.'},parada:{name:'Demanda sem movimentação',trigger:'sem_movimentacao_3d',field:'qualquer',value:'',dest:'gestores',level:'importante',message:'Esta demanda está há pelo menos 3 dias sem movimentação.'}};const p=presets[template];if(!p)return;$('automationName').value=p.name;$('automationTrigger').value=p.trigger;$('automationConditionField').value=p.field;$('automationConditionValue').value=p.value;$('automationDestination').value=p.dest;$('automationLevel').value=p.level;$('automationMessage').value=p.message;}
async function saveAutomation(event){event.preventDefault();setLoading(true);try{const {error}=await db.rpc('salvar_automacao_demanda',{p_id:$('automationId').value||null,p_nome:$('automationName').value.trim(),p_gatilho:$('automationTrigger').value,p_condicao_campo:$('automationConditionField').value,p_condicao_valor:$('automationConditionValue').value.trim()||null,p_acao_destino:$('automationDestination').value,p_nivel:$('automationLevel').value,p_mensagem:$('automationMessage').value.trim()||null,p_ativo:$('automationEnabled').checked});if(error)throw error;closeModal('automationModal');await loadIntelligenceV5();renderAutomations();renderShell();toast('Automação salva.');}catch(error){toast(errorMessage(error),'error')}finally{setLoading(false)}}
async function toggleAutomation(id){const r=state.automations.find(x=>x.id===id);if(!r)return;setLoading(true);try{const {error}=await db.rpc('alternar_automacao_demanda',{p_id:id,p_ativo:!r.ativo});if(error)throw error;await loadIntelligenceV5();renderAutomations();renderShell();toast(!r.ativo?'Automação ativada.':'Automação pausada.');}catch(e){toast(errorMessage(e),'error')}finally{setLoading(false)}}
async function deleteAutomation(){const id=$('automationId').value;if(!id||!confirm('Excluir esta automação?'))return;setLoading(true);try{const {error}=await db.rpc('excluir_automacao_demanda',{p_id:id});if(error)throw error;closeModal('automationModal');await loadIntelligenceV5();renderAutomations();renderShell();toast('Automação excluída.');}catch(e){toast(errorMessage(e),'error')}finally{setLoading(false)}}

function notificationLevel(notification){
  if(notification?.nivel)return notification.nivel;
  const type=notification?.tipo||'';

  // Lembretes e compromissos precisam interromper a tela no horário programado.
  // Antes eles caíam como "normal", portanto iam apenas para o sino e nunca
  // entravam na fila de pop-ups invasivos.
  if(notification?.lembrete_id)return'importante';

  if(type==='demanda_imediata')return'critica';
  if(['prazo_proximo','prazo_atrasado','avaliacao_pendente','avaliacao_ajustes','transferencia'].includes(type))return'importante';
  if(['avaliacao_aprovada'].includes(type))return'informativa';
  return'normal';
}
const renderNotificationsV34=renderNotifications;
renderNotifications=function renderNotificationsV35(){const unread=state.notifications.filter(i=>!i.lida).length;$('notificationBadge').textContent=unread;$('notificationBadge').classList.toggle('hidden',unread===0);$('notificationList').innerHTML=state.notifications.length?state.notifications.map(notification=>{const title=notification.tarefa?.titulo||notification.lembrete?.titulo||'Atualização';const heading=notification.mensagem||(notification.lembrete_id?(notification.lembrete?.tipo==='compromisso'?'Compromisso próximo':'Lembrete programado'):NOTIFICATION_TEXT[notification.tipo]||'Atualização');const type=notification.tipo||'',level=notificationLevel(notification);const iconMap={demanda_imediata:'siren',comentario:'message-circle',transferencia:'arrow-right-left',avaliacao_pendente:'scan-eye',avaliacao_aprovada:'badge-check',avaliacao_ajustes:'undo-2',status_mudou:'refresh-cw'};const icon=notification.lembrete_id?(notification.lembrete?.tipo==='compromisso'?'calendar-clock':'alarm-clock'):iconMap[type]||(type.includes('prazo')?'calendar-clock':'clipboard-check');const actor=resolveNotificationActor(notification);const visual=actor?`<span class="notification-item-avatar">${avatarHTML(actor,'sm')}</span>`:`<span class="notification-item-icon"><i data-lucide="${icon}"></i></span>`;const task=notification.tarefa_id?state.tasks.find(i=>i.id===notification.tarefa_id):null;const context=task?`${PRIORITY[task.prioridade]||'Média'} · ${dueLabel(task)}`:relativeTime(notification.criado_em);return `<div class="notification-item ${notification.lida?'':'unread'} type-${type} level-${level}" data-notification-id="${notification.id}" data-task-id="${notification.tarefa_id||''}" data-reminder-id="${notification.lembrete_id||''}">${visual}<div class="notification-item-copy"><div class="notification-heading-row"><strong>${escapeHtml(heading)}</strong><span class="notification-level-pill ${level}">${level==='critica'?'Crítica':level==='importante'?'Importante':level==='informativa'?'Info':'Normal'}</span></div><p>${escapeHtml(title)}</p><span>${escapeHtml(context)} · ${relativeTime(notification.criado_em)}</span></div><i class="notification-item-arrow" data-lucide="chevron-right"></i></div>`}).join(''):`<div class="empty-state" style="margin:16px"><i data-lucide="bell-off"></i>Nenhuma notificação por aqui.</div>`;refreshIcons();}

const renderGlobalSearchV34=renderGlobalSearch;
function commandMatches(query,label,aliases=[]){const q=query.toLowerCase();return !q||[label,...aliases].some(v=>v.toLowerCase().includes(q)||q.includes(v.toLowerCase()));}
function commandResultHTML(command,icon,title,meta){return `<button class="search-result command-result" data-search-command="${command}"><span class="search-result-icon"><i data-lucide="${icon}"></i></span><span class="search-result-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(meta)}</span></span><kbd>Enter</kbd></button>`;}
renderGlobalSearch=function renderGlobalSearchV35(){const raw=$('globalSearchInput').value.trim(),query=raw.toLowerCase();const commands=[['nova-demanda','clipboard-plus','Criar nova demanda','Abre o cadastro de demanda',['criar demanda','nova demanda']],['atrasadas','triangle-alert','Ver demandas atrasadas','Abre Demandas filtrando atrasos',['atrasadas','atrasos']],['projetos','folder-kanban','Abrir Projetos','Progresso, timeline e dependências',['projeto','projetos']],['equipe','users-round','Abrir Equipe','Carga e capacidade da equipe',['equipe','carga']],['agenda','calendar-days','Abrir Agenda','Minha agenda e equipe',['agenda','calendario']],['academia','presentation','Abrir Academia PMG','Reservas e treinamentos',['academia']],['automacoes','workflow','Abrir Automações','Regras SE → ENTÃO',['automacao','automações','automacoes']]].filter(c=>c[0]!=='automacoes'||isManager()).filter(c=>commandMatches(query,c[2],c[4]));const tasks=query?state.tasks.filter(task=>[task.titulo,task.descricao,task.projeto,...(task.tags||[])].join(' ').toLowerCase().includes(query)).slice(0,7):[];const reminders=query?state.reminders.filter(item=>[item.titulo,item.descricao].join(' ').toLowerCase().includes(query)).slice(0,5):[];const people=query?state.collaborators.filter(p=>[p.nome,p.cargo].join(' ').toLowerCase().includes(query)).slice(0,5):[];const projects=query?projectCatalog().filter(p=>[p.nome,p.objetivo].join(' ').toLowerCase().includes(query)).slice(0,5):[];$('globalSearchResults').innerHTML=`${commands.length?`<div class="search-group-label">Comandos rápidos</div>${commands.slice(0,6).map(c=>commandResultHTML(c[0],c[1],c[2],c[3])).join('')}`:''}${tasks.length?`<div class="search-group-label">Demandas</div>${tasks.map(taskSearchResultHTML).join('')}`:''}${projects.length?`<div class="search-group-label">Projetos</div>${projects.map(p=>searchResultHTML('project',p.id||p.nome,p.nome,`${projectStats(p).progress}% concluído · ${projectStats(p).active.length} abertas`,'folder-kanban')).join('')}`:''}${people.length?`<div class="search-group-label">Pessoas</div>${people.map(p=>searchResultHTML('person',p.id,p.nome,p.cargo||'Marketing','user-round')).join('')}`:''}${reminders.length?`<div class="search-group-label">Agenda</div>${reminders.map(item=>searchResultHTML('reminder',item.id,item.titulo,`${item.tipo==='compromisso'?'Compromisso':'Lembrete'} · ${formatDateTime(item.inicio_em)}`,item.tipo==='compromisso'?'calendar-clock':'bell')).join('')}`:''}${!commands.length&&!tasks.length&&!reminders.length&&!people.length&&!projects.length?`<div class="empty-state" style="margin:8px"><i data-lucide="search-x"></i>Nenhum resultado encontrado.</div>`:''}`;refreshIcons();}
function runSearchCommand(command){closeSearch();if(command==='nova-demanda')return openQuickAdd('demanda');if(command==='atrasadas')return applySmartFilter('atrasadas');if(['projetos','equipe','agenda','academia','automacoes'].includes(command))return switchView(command);}

function monthValueShift(value,offset){const [y,m]=String(value).split('-').map(Number),d=new Date(y,m-1+offset,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function pctDelta(current,previous){if(previous===0)return current===0?0:null;return Math.round((current-previous)/previous*100);}
function average(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
const buildMonthlyReportV34=buildMonthlyReport;
buildMonthlyReport=function buildMonthlyReportV35(value){const report=buildMonthlyReportV34(value);report.version='3.5';report.rows=(report.rows||[]).map(row=>{const bounds=monthBounds(value);const completed=state.tasks.filter(t=>t.responsavel_id===row.person.id&&t.status==='concluida'&&new Date(t.concluida_em||t.atualizado_em)>=bounds.start&&new Date(t.concluida_em||t.atualizado_em)<bounds.end);const rework=completed.reduce((s,t)=>s+Number(t.retrabalhos||0),0);const accuracy=row.estimatedHours>0&&row.actualHours>0?Math.max(0,Math.round(100-Math.abs(row.actualHours-row.estimatedHours)/row.estimatedHours*100)):null;return{...row,rework,accuracy}}).sort((a,b)=>a.person.nome.localeCompare(b.person.nome,'pt-BR'));report.totalRework=report.rows.reduce((s,r)=>s+r.rework,0);const acc=report.rows.map(r=>r.accuracy).filter(v=>v!==null);report.estimateAccuracy=acc.length?Math.round(acc.reduce((a,b)=>a+b,0)/acc.length):null;const cycles=report.rows.map(r=>r.avgCycle).filter(v=>v!==null);report.teamAvgCycle=average(cycles);report.totalTransfers=report.rows.reduce((s,r)=>s+r.transfersIn+r.transfersOut,0)/2;const previous=buildMonthlyReportV34(monthValueShift(value,-1));report.comparison={previousLabel:previous.label,completed:pctDelta(report.totalCompleted,previous.totalCompleted),created:pctDelta(report.totalCreated,previous.totalCreated),hours:pctDelta(report.totalActualHours,previous.totalActualHours),onTime:report.teamOnTimeRate!==null&&previous.teamOnTimeRate!==null?report.teamOnTimeRate-previous.teamOnTimeRate:null};return report;}
function deltaHTML(value,suffix='%'){if(value===null||value===undefined)return'<span class="monthly-delta neutral">sem base</span>';const tone=value>0?'up':value<0?'down':'neutral';return`<span class="monthly-delta ${tone}"><i data-lucide="${value>0?'trending-up':value<0?'trending-down':'minus'}"></i>${value>0?'+':''}${value}${suffix}</span>`;}
const renderMonthlyReportV34=renderMonthlyReport;
renderMonthlyReport=function renderMonthlyReportV35(){renderMonthlyReportV34();const report=state.monthlyReportData;if(!report)return;const hero=$('monthlyReportContent')?.querySelector('.monthly-report-hero');if(!hero)return;const attention=[];if((report.teamOnTimeRate??100)<85)attention.push(`Pontualidade em ${report.teamOnTimeRate}%`);if(report.totalRework>0)attention.push(`${report.totalRework} ciclo(s) de retrabalho`);if((report.estimateAccuracy??100)<75)attention.push(`Precisão das estimativas em ${report.estimateAccuracy}%`);if((report.totalTransfers||0)>=5)attention.push(`${Math.round(report.totalTransfers)} transferências no mês`);const compare=document.createElement('section');compare.className='monthly-comparison';compare.innerHTML=`<div class="monthly-section-title"><div><span class="eyebrow">Comparação</span><h4>Em relação a ${escapeHtml(report.comparison?.previousLabel||'mês anterior')}</h4></div></div><div class="monthly-comparison-grid"><div><span>Concluídas</span><strong>${report.totalCompleted}</strong>${deltaHTML(report.comparison?.completed)}</div><div><span>Demandas recebidas</span><strong>${report.totalCreated}</strong>${deltaHTML(report.comparison?.created)}</div><div><span>Horas reais</span><strong>${formatHours(report.totalActualHours||0)}</strong>${deltaHTML(report.comparison?.hours)}</div><div><span>No prazo</span><strong>${report.teamOnTimeRate===null?'—':report.teamOnTimeRate+'%'}</strong>${deltaHTML(report.comparison?.onTime,' p.p.')}</div><div><span>Estimativa x real</span><strong>${report.estimateAccuracy===null?'—':report.estimateAccuracy+'%'}</strong><small>precisão média</small></div><div><span>Retrabalho</span><strong>${report.totalRework||0}</strong><small>retornos para ajustes</small></div></div><div class="monthly-attention ${attention.length?'has-alerts':'clean'}"><i data-lucide="${attention.length?'scan-search':'circle-check-big'}"></i><div><strong>${attention.length?'O que merece atenção':'Mês operacionalmente saudável'}</strong><span>${attention.length?escapeHtml(attention.join(' · ')):'Nenhum sinal relevante de prazo, retrabalho ou estimativa fora da faixa definida.'}</span></div></div>`;hero.insertAdjacentElement('afterend',compare);const rankMarkers=$('monthlyReportContent').querySelectorAll('.monthly-person small');rankMarkers.forEach(el=>{el.textContent=el.textContent.replace(/\s·\s#\d+/,'')});refreshIcons();}

function personMonthMetrics(personId,offset){const now=new Date(),base=new Date(now.getFullYear(),now.getMonth()+offset,1),value=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}`,bounds=monthBounds(value);const completed=state.tasks.filter(t=>t.responsavel_id===personId&&t.status==='concluida'&&new Date(t.concluida_em||t.atualizado_em)>=bounds.start&&new Date(t.concluida_em||t.atualizado_em)<bounds.end);const deadline=completed.filter(t=>taskDue(t)&&t.concluida_em),onTime=deadline.filter(t=>new Date(t.concluida_em)<=new Date(taskDue(t))).length;const entries=state.timeEntries.filter(e=>e.colaborador_id===personId&&new Date(e.inicio_em)<bounds.end&&new Date(e.fim_em||Date.now())>=bounds.start);const hours=entries.reduce((s,e)=>s+entryMinutesInsideMonth(e,bounds.start,bounds.end),0)/60;return{label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(base).replace('.',''),completed:completed.length,onTime:deadline.length?Math.round(onTime/deadline.length*100):null,rework:completed.reduce((s,t)=>s+Number(t.retrabalhos||0),0),hours};}
function performanceEvolutionHTML(person){if(person.role==='gestor')return'';const months=[-2,-1,0].map(o=>personMonthMetrics(person.id,o));const maxCompleted=Math.max(1,...months.map(m=>m.completed));return `<section class="person-drawer-section person-evolution"><div class="person-section-head"><div><span class="eyebrow">Evolução pessoal</span><h3>Últimos 3 meses</h3></div><span>Sem ranking</span></div><div class="evolution-chart">${months.map(m=>`<div class="evolution-month"><div class="evolution-bar"><i style="height:${Math.max(8,Math.round(m.completed/maxCompleted*100))}%"></i></div><strong>${m.completed}</strong><span>${escapeHtml(m.label)}</span></div>`).join('')}</div><div class="evolution-metrics">${months.map(m=>`<div><span>${escapeHtml(m.label)}</span><strong>${m.onTime===null?'—':m.onTime+'%'}</strong><small>no prazo</small><b>${formatHours(m.hours)} · ${m.rework} ajuste(s)</b></div>`).join('')}</div></section>`;}
const renderPersonDrawerV34=renderPersonDrawer;
renderPersonDrawer=function renderPersonDrawerV35(person){renderPersonDrawerV34(person);const actions=$('personDrawerContent')?.querySelector('.person-drawer-actions');if(actions){actions.insertAdjacentHTML('beforebegin',performanceEvolutionHTML(person));refreshIcons();}}

function bindIntelligenceV5Events(){
  $('projectNewBtn')?.addEventListener('click',()=>openProjectModal());
  $('projectNewDemandBtn')?.addEventListener('click',()=>openQuickAdd('demanda',{project:state.selectedProjectId?projectCatalog().find(p=>p.id===state.selectedProjectId)?.nome||'':''}));
  $('projectSearch')?.addEventListener('input',debounce(event=>{state.projectSearch=event.target.value;renderProjects()},120));
  $('projectStatusFilter')?.addEventListener('change',event=>{state.projectStatusFilter=event.target.value;renderProjects()});
  $('projectForm')?.addEventListener('submit',saveProject);
  $('automationNewBtn')?.addEventListener('click',()=>openAutomationModal());
  $('automationForm')?.addEventListener('submit',saveAutomation);
  $('automationDeleteBtn')?.addEventListener('click',deleteAutomation);
  document.addEventListener('click',event=>{
    const projectOpen=event.target.closest('[data-open-project]');if(projectOpen&&!event.target.closest('[data-edit-project]')){state.selectedProjectId=projectOpen.dataset.openProject;renderProjects();$('projectDetail')?.scrollIntoView({behavior:state.accessibility.reduceMotion?'auto':'smooth',block:'start'});return;}
    const editProject=event.target.closest('[data-edit-project]');if(editProject&&!editProject.disabled){const p=state.projects.find(x=>x.id===editProject.dataset.editProject);if(p)openProjectModal(p);return;}
    const closeProject=event.target.closest('[data-close-project-detail]');if(closeProject){state.selectedProjectId=null;$('projectDetail')?.classList.add('hidden');return;}
    const editAuto=event.target.closest('[data-edit-automation]');if(editAuto){const r=state.automations.find(x=>x.id===editAuto.dataset.editAutomation);if(r)openAutomationModal(r);return;}
    const toggleAuto=event.target.closest('[data-toggle-automation]');if(toggleAuto){toggleAutomation(toggleAuto.dataset.toggleAutomation);return;}
    const template=event.target.closest('[data-automation-template]');if(template){openAutomationModal(null,template.dataset.automationTemplate);return;}
    const command=event.target.closest('[data-search-command]');if(command){runSearchCommand(command.dataset.searchCommand);return;}
    const searchProject=event.target.closest('[data-search-project]');if(searchProject){closeSearch();state.selectedProjectId=searchProject.dataset.searchProject;switchView('projetos');renderProjects();return;}
    const searchPerson=event.target.closest('[data-search-person]');if(searchPerson){closeSearch();if(isManager())openPerson(searchPerson.dataset.searchPerson);else{switchView('equipe');}return;}
  });
  $('globalSearchInput')?.addEventListener('keydown',event=>{if(event.key==='Enter'){const first=$('globalSearchResults')?.querySelector('[data-search-command], [data-search-task], [data-search-project], [data-search-person], [data-search-reminder]');if(first){event.preventDefault();first.click();}}});
}

bindEvents(); bindProductivityV4Events(); bindIntelligenceV5Events(); initOverlayStability(); refreshIcons(); bootstrap();
