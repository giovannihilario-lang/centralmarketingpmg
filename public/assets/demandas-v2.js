/* PMG Connect — Central de Demandas V2 */
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
const PRIORITY = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const SIZE = { rapida: 'Rápida', media: 'Média', grande: 'Grande' };
const RECURRENCE = { nenhuma: 'Não repete', diaria: 'Diariamente', semanal: 'Semanalmente', mensal: 'Mensalmente', anual: 'Anualmente' };
const NOTIFICATION_TEXT = {
  nova_tarefa: 'Você recebeu uma nova demanda',
  prazo_proximo: 'Uma demanda está perto do prazo',
  prazo_atrasado: 'Uma demanda está atrasada',
  prazo_alterado: 'O prazo de uma demanda mudou',
  comentario: 'Há um novo comentário',
  status_mudou: 'O status de uma demanda mudou',
  lembrete: 'Está na hora do seu lembrete'
};
const ACTIVITY_TEXT = {
  criada: 'criou a demanda', editada: 'editou a demanda', status: 'alterou o status de',
  atribuida: 'alterou o responsável de', comentario: 'comentou em', arquivada: 'arquivou', restaurada: 'restaurou'
};
const ACTIVITY_ICON = {
  criada: 'clipboard-plus', editada: 'pencil', status: 'refresh-cw', atribuida: 'user-round-cog',
  comentario: 'message-circle', arquivada: 'archive', restaurada: 'archive-restore'
};
const PRIORITY_ORDER = { urgente: 0, alta: 1, media: 2, baixa: 3 };
const VIEW_META = {
  hoje: ['Sua rotina', 'Hoje'], agenda: ['Planejamento', 'Agenda'],
  demandas: ['Fluxo de trabalho', 'Demandas'], equipe: ['Capacidade do setor', 'Equipe']
};

const state = {
  session: null, me: null, collaborators: [], tasks: [], reminders: [], notifications: [], activities: [],
  view: 'hoje', taskView: 'board', smartFilter: '', selectedTask: null, selectedReminder: null,
  comments: [], taskActivities: [], realtime: null, loading: 0, quickType: 'demanda',
  quickCaptureType: 'lembrete', editingReminderId: null, calendarCursor: startOfMonth(new Date()),
  selectedDate: dateKey(new Date()), pushSubscription: null,
  teamSearch: '', teamSort: 'risk', teamRiskOnly: false, selectedPersonId: null, personActivities: [],
  assigneePicker: { selectId: null, previewId: null, taskId: null, search: '' }, onboardingStep: 0
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
  if (/lembretes|atividades_tarefa|criar_tarefa_v2|relation .* does not exist/i.test(message)) {
    return 'A migração Demandas V2 ainda não foi executada no Supabase.';
  }
  return message;
}
function isManager() { return state.me?.role === 'gestor'; }
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
  revisao: 'Pronta para conferência',
  concluida: 'Entrega finalizada'
};
const STATUS_ACTION = {
  nova: { next: 'andamento', label: 'Iniciar demanda', icon: 'play' },
  andamento: { next: 'revisao', label: 'Enviar para revisão', icon: 'scan-eye' },
  revisao: { next: 'concluida', label: 'Concluir demanda', icon: 'circle-check-big' },
  concluida: { next: 'andamento', label: 'Reabrir demanda', icon: 'rotate-ccw' }
};

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
  const people = state.collaborators
    .filter(person => !query || [person.nome, person.cargo, person.role].join(' ').toLowerCase().includes(query))
    .map(person => ({ person, stats: assigneeStats(person) }))
    .sort((a, b) => {
      const selectedDiff = Number(b.person.id === currentId) - Number(a.person.id === currentId);
      const riskDiff = (TEAM_RISK[a.stats.risk]?.score || 0) - (TEAM_RISK[b.stats.risk]?.score || 0);
      return selectedDiff || riskDiff || a.stats.hours - b.stats.hours || String(a.person.nome || '').localeCompare(String(b.person.nome || ''), 'pt-BR');
    });

  $('assigneePickerContext').innerHTML = `<i data-lucide="info"></i><span>${people.length} pessoa${people.length === 1 ? '' : 's'} encontrada${people.length === 1 ? '' : 's'}. Carga calculada pelas demandas abertas e estimativas registradas.</span>`;
  const noneOption = !query || 'sem responsável'.includes(query)
    ? `<button type="button" class="assignee-option none ${currentId === '' ? 'selected' : ''}" data-assignee-choice=""><span class="assignee-option-avatar">${avatarHTML(null, 'md')}</span><span class="assignee-option-copy"><strong>Sem responsável</strong><small>Deixar na fila para atribuir depois</small></span><span class="assignee-option-state"><i data-lucide="${currentId === '' ? 'check' : 'chevron-right'}"></i></span></button>`
    : '';
  $('assigneePickerList').innerHTML = noneOption + (people.length ? people.map(({ person, stats }) => {
    const risk = teamRiskLabel(stats);
    return `<button type="button" class="assignee-option risk-${stats.risk} ${currentId === person.id ? 'selected' : ''}" data-assignee-choice="${person.id}">
      <span class="assignee-option-avatar">${avatarStatusHTML(person, stats, 'md')}</span>
      <span class="assignee-option-copy"><strong>${escapeHtml(person.nome)}</strong><small>${escapeHtml(person.cargo || 'Marketing')}</small><em>${escapeHtml(assigneeLoadText(stats))}</em></span>
      <span class="assignee-option-load"><b>${Math.round(stats.hours)}h</b><small>${risk.label}</small><i class="assignee-load-track"><span style="width:${Math.min(100, stats.utilization || 0)}%"></span></i></span>
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
    const disabled = !canChangeStatus || Boolean(task.arquivada_em) || current;
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
function priorityWeight(task) { return ({ urgente: 4, alta: 3, media: 2, baixa: 1 })[task.prioridade] || 2; }
function sizeWeight(task) { return Number(task.estimativa_horas) || ({ rapida: 1, media: 2.5, grande: 5 })[task.tamanho] || 2.5; }

async function bootstrap() {
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
}
async function loadAll() {
  await Promise.all([loadCollaborators(), loadTasks(), loadReminders(), loadNotifications(), loadActivities()]);
}
async function loadCollaborators() {
  const { data, error } = await db.from('colaboradores').select('id,nome,foto_url,cargo,role,ativo,perfil_configurado,criado_em,atualizado_em').eq('ativo', true).order('nome');
  if (error) throw error; state.collaborators = data || [];
  const current = state.collaborators.find(person => person.id === state.me?.id); if (current) state.me = current;
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
  renderShell(); renderToday(); renderAgenda(); renderDemandas(); renderEquipe(); renderNotifications(); refreshIcons();
}
function renderShell() {
  $('sideUserAvatar').innerHTML = avatarHTML(state.me, 'sm');
  $('sideUserName').textContent = state.me?.nome || 'Colaborador'; $('sideUserRole').textContent = state.me?.role || 'colaborador';
  renderUserMenu();
  $$('.manager-only').forEach(el => el.classList.toggle('hidden', !isManager()));
  const activeTasks = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida');
  const mine = activeTasks.filter(task => task.responsavel_id === state.me?.id);
  $('navTaskCount').textContent = activeTasks.length;
  $('navTodayCount').textContent = mine.filter(task => taskDueKey(task) === todayKey() || isOverdue(task)).length;
  $('navTodayCount').classList.toggle('hidden', Number($('navTodayCount').textContent) === 0);
  const [eyebrow, title] = VIEW_META[state.view]; $('pageEyebrow').textContent = eyebrow; $('pageTitle').textContent = title;
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

function renderAgenda() {
  const cursor = state.calendarCursor;
  $('calendarMonthLabel').textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(cursor);
  renderSelectedDayHeader();
  const first = startOfMonth(cursor); const start = addDays(first, -first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i); const key = dateKey(date);
    const events = calendarItemsForDate(key); const outside = date.getMonth() !== cursor.getMonth();
    cells.push(`<button class="calendar-day ${outside ? 'outside' : ''} ${key === todayKey() ? 'today' : ''} ${key === state.selectedDate ? 'selected' : ''}" data-calendar-date="${key}">
      <span class="day-number">${date.getDate()}</span><div class="calendar-events">${events.slice(0, 3).map(item => `<span class="calendar-event ${item.kind}" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>`).join('')}${events.length > 3 ? `<span class="more-events">+${events.length - 3}</span>` : ''}</div></button>`);
  }
  $('calendarGrid').innerHTML = cells.join(''); renderSelectedDayItems();
}
function calendarItemsForDate(key) {
  const tasks = state.tasks.filter(task => !task.arquivada_em && taskDueKey(task) === key).map(task => ({ kind: 'task', id: task.id, title: task.titulo, time: taskDue(task), item: task }));
  const reminders = state.reminders.filter(reminder => !reminder.concluido_em && dateKey(reminderEffectiveTime(reminder)) === key).map(reminder => ({ kind: reminder.tipo === 'compromisso' ? 'meeting' : 'reminder', id: reminder.id, title: reminder.titulo, time: reminderEffectiveTime(reminder), item: reminder }));
  return [...tasks, ...reminders].sort((a, b) => new Date(a.time) - new Date(b.time));
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
    return `<div class="day-item enriched" data-open-${entry.kind === 'task' ? 'task' : 'reminder'}="${entry.id}">${visual}<div class="day-item-main"><div class="day-item-head"><i class="day-item-type ${entry.kind}"></i><small>${formatTime(entry.time)} · ${entry.kind === 'task' ? 'Demanda' : entry.kind === 'meeting' ? 'Compromisso' : 'Lembrete'}</small></div><strong>${escapeHtml(entry.title)}</strong>${entry.kind === 'task' ? `<span>${escapeHtml(taskPerson?.nome || 'Sem responsável')}</span>` : ''}</div></div>`;
  }).join('') : `<div class="empty-state"><i data-lucide="calendar-x-2"></i>Nenhum item neste dia.</div>`;
}

function filteredTasks() {
  const search = $('taskSearch')?.value.trim().toLowerCase() || '';
  const assignee = $('taskAssigneeFilter')?.value || ''; const priority = $('taskPriorityFilter')?.value || '';
  const archive = $('taskArchiveFilter')?.value || 'ativas'; const now = new Date(); const weekEnd = addDays(now, 7);
  return state.tasks.filter(task => {
    const blob = [task.titulo, task.descricao, ...(task.tags || [])].join(' ').toLowerCase();
    if (search && !blob.includes(search)) return false;
    if (assignee && (assignee === 'none' ? Boolean(task.responsavel_id) : task.responsavel_id !== assignee)) return false;
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
function renderDemandas() {
  populateAssigneeSelects();
  $('taskBoard').classList.toggle('hidden', state.taskView !== 'board'); $('taskListView').classList.toggle('hidden', state.taskView !== 'list');
  $$('[data-task-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.taskView === state.taskView));
  const labels = { atrasadas: 'Mostrando demandas atrasadas', hoje: 'Mostrando demandas para hoje', semana: 'Mostrando os próximos 7 dias', minhas: 'Mostrando minhas demandas' };
  $('taskSmartFilterBar').classList.toggle('hidden', !state.smartFilter); $('smartFilterLabel').textContent = labels[state.smartFilter] || '';
  renderTaskAvatarFilters(); renderBoard(); renderTaskList();
}
function populateAssigneeSelects() {
  const options = `<option value="">Todos os responsáveis</option><option value="none">Sem responsável</option>${state.collaborators.map(person => `<option value="${person.id}">${escapeHtml(person.nome)}</option>`).join('')}`;
  const select = $('taskAssigneeFilter'); if (select) { const value = select.value; select.innerHTML = options; select.value = value; }
  ['itemAssignee', 'editTaskAssignee'].forEach(id => { const el = $(id); if (!el) return; const value = el.value; el.innerHTML = `<option value="">Sem responsável</option>${state.collaborators.map(person => `<option value="${person.id}">${escapeHtml(person.nome)}</option>`).join('')}`; el.value = value; });
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
    <div class="task-card-top"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span><span class="size-pill">${SIZE[task.tamanho] || 'Média'}</span>${task.arquivada_em ? '<span class="archived-pill">Arquivada</span>' : ''}<span class="task-card-id">#${task.id.slice(0, 5).toUpperCase()}</span></div>
    <h3>${escapeHtml(task.titulo)}</h3>${task.descricao ? `<p>${escapeHtml(task.descricao)}</p>` : ''}
    ${(task.tags || []).length ? `<div class="task-tags">${task.tags.slice(0, 4).map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <div class="task-progress-meta"><span>${task.estimativa_horas ? `${Number(task.estimativa_horas)}h estimadas` : 'Sem estimativa'}</span><span>${STATUS[task.status]?.label}</span></div>
    <div class="task-card-footer"><span class="task-due ${dueClass(task)}"><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span><div class="task-card-person">${taskAvatarHTML(person, task, 'sm')}<span>${escapeHtml(person?.nome || 'Sem responsável')}</span></div></div>
  </article>`;
}
function renderTaskList() {
  const tasks = filteredTasks();
  $('taskRows').innerHTML = tasks.length ? tasks.map(task => { const person = collaborator(task.responsavel_id); return `<div class="task-row" data-open-task="${task.id}">
    <div class="task-row-title"><i class="priority-line" style="background:${task.prioridade === 'urgente' ? 'var(--red)' : task.prioridade === 'alta' ? 'var(--amber)' : task.prioridade === 'baixa' ? 'var(--blue)' : 'var(--green-300)'}"></i><div><strong>${escapeHtml(task.titulo)}</strong><small>${escapeHtml((task.tags || []).join(' · ') || 'Sem tags')}</small></div></div>
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
  const urgent = active.filter(task => task.prioridade === 'urgente');
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

  $('teamSummary').innerHTML = manager
    ? [
        teamSummaryCard('users-round', state.collaborators.length, 'Pessoas ativas'),
        teamSummaryCard('clipboard-list', active.length, 'Demandas em aberto'),
        teamSummaryCard('clock-4', `${Math.round(totalHours)}h`, 'Carga estimada'),
        teamSummaryCard('triangle-alert', overdue.length, 'Demandas atrasadas', overdue.length ? 'danger' : ''),
        teamSummaryCard('calendar-range', dueWeek.length, 'Vencem em 7 dias'),
        teamSummaryCard('badge-check', completed30.length, 'Concluídas em 30 dias')
      ].join('')
    : [
        teamSummaryCard('users-round', state.collaborators.length, 'Pessoas no setor'),
        teamSummaryCard('clipboard-list', active.length, 'Demandas em andamento'),
        teamSummaryCard('calendar-range', dueWeek.length, 'Entregas da semana'),
        teamSummaryCard('badge-check', completed30.length, 'Concluídas em 30 dias')
      ].join('');

  if (manager) renderTeamInsights(stats, active, unassigned);

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
  return ({ criada: 'plus', editada: 'pencil', status: 'refresh-cw', atribuida: 'user-round-cog', comentario: 'message-circle', arquivada: 'archive', restaurada: 'archive-restore' })[type] || 'activity';
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
    const icon = notification.lembrete_id ? (notification.lembrete?.tipo === 'compromisso' ? 'calendar-clock' : 'alarm-clock') : notification.tipo === 'comentario' ? 'message-circle' : notification.tipo.includes('prazo') ? 'calendar-clock' : 'clipboard-check';
    return `<div class="notification-item ${notification.lida ? '' : 'unread'}" data-notification-id="${notification.id}" data-task-id="${notification.tarefa_id || ''}" data-reminder-id="${notification.lembrete_id || ''}"><span class="notification-item-icon"><i data-lucide="${icon}"></i></span><div class="notification-item-copy"><strong>${escapeHtml(heading)}</strong><p>${escapeHtml(title)}</p><span>${relativeTime(notification.criado_em)}</span></div></div>`;
  }).join('') : `<div class="empty-state" style="margin:16px"><i data-lucide="bell-off"></i>Nenhuma notificação por aqui.</div>`;
}

function switchView(view) {
  state.view = view; renderShell();
  if (view === 'agenda') renderAgenda(); if (view === 'demandas') renderDemandas(); if (view === 'equipe') renderEquipe();
  window.scrollTo({ top: 0, behavior: 'smooth' }); closeMobileSidebar(); refreshIcons();
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
    $('itemAssignee').value = preset.assigneeId || '';
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
  if (type === 'demanda') { populateAssigneeSelects(); syncTaskFormVisuals('item'); }
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
  const { error } = await db.rpc('criar_tarefa_v2', {
    p_titulo: $('itemTitle').value.trim(), p_descricao: $('itemDescription').value.trim() || null,
    p_prioridade: $('itemPriority').value, p_responsavel_id: $('itemAssignee').value || null,
    p_prazo_em: dueAt, p_lembrar_em: remindAt, p_tags: tags,
    p_tamanho: $('itemSize').value, p_estimativa_horas: $('itemEstimate').value ? Number($('itemEstimate').value) : null
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
  const personStats = person ? assigneeStats(person) : null;
  $('taskDrawerKicker').textContent = `Demanda #${task.id.slice(0, 5).toUpperCase()}`; $('taskDrawerTitle').textContent = task.titulo;
  const canChangeStatus = isManager() || task.responsavel_id === state.me.id || task.criado_por === state.me.id;
  const nextAction = STATUS_ACTION[task.status] || STATUS_ACTION.nova;
  const canAssign = isManager() && !task.arquivada_em;
  $('taskDrawerContent').innerHTML = `
    <section class="task-overview-hero">
      <div class="task-people-flow">
        <div class="task-person-identity"><span>${avatarHTML(creator, 'md')}</span><div><small>Criada por</small><strong>${escapeHtml(creator?.nome || 'Sistema')}</strong></div></div>
        <i data-lucide="arrow-right"></i>
        <div class="task-person-identity assigned"><span>${taskAvatarHTML(person, task, 'md')}</span><div><small>Responsável</small><strong>${escapeHtml(person?.nome || 'Sem responsável')}</strong></div></div>
      </div>
      <div class="task-overview-meta"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span><span class="size-pill">${SIZE[task.tamanho] || 'Média'}</span><span class="task-overview-due ${dueClass(task)}"><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span></div>
      <p>${escapeHtml(task.descricao || 'Esta demanda ainda não possui descrição.')}</p>
      ${(task.tags || []).length ? `<div class="detail-tags">${task.tags.map(tag => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    </section>

    <section class="task-status-section">
      <div class="task-section-heading"><div><span class="eyebrow">Fluxo</span><h3>Status da demanda</h3></div><span class="current-status-label ${task.status}"><i data-lucide="${STATUS[task.status]?.icon || 'circle-dot'}"></i>${STATUS[task.status]?.label || task.status}</span></div>
      <div class="status-flow">${statusFlowHTML(task, canChangeStatus)}</div>
      ${canChangeStatus && !task.arquivada_em ? `<button id="drawerNextStatusBtn" type="button" class="status-primary-action ${task.status}" data-next-status="${nextAction.next}"><i data-lucide="${nextAction.icon}"></i><span><strong>${nextAction.label}</strong><small>${STATUS_HELP[nextAction.next]}</small></span><i data-lucide="arrow-right"></i></button>` : ''}
    </section>

    <section class="task-assignee-section">
      <div class="task-section-heading"><div><span class="eyebrow">Responsabilidade</span><h3>Quem está com esta demanda</h3></div>${canAssign ? '<span class="section-hint">Clique para alterar</span>' : ''}</div>
      <button id="drawerAssigneePickerBtn" type="button" class="drawer-assignee-card ${canAssign ? 'editable' : ''}" ${canAssign ? '' : 'disabled'}>
        <span class="drawer-assignee-avatar">${person ? avatarStatusHTML(person, personStats, 'lg') : avatarHTML(null, 'lg')}</span>
        <span class="drawer-assignee-copy"><strong>${escapeHtml(person?.nome || 'Sem responsável')}</strong><small>${escapeHtml(person?.cargo || 'Aguardando atribuição')}</small><em>${escapeHtml(person ? assigneeLoadText(personStats) : 'A demanda ainda não pertence a ninguém.')}</em></span>
        ${canAssign ? '<span class="drawer-assignee-change"><span>Alterar responsável</span><i data-lucide="chevron-right"></i></span>' : ''}
      </button>
    </section>

    <section class="task-detail-summary">
      <div><span><i data-lucide="calendar-days"></i>Prazo</span><strong class="${dueClass(task)}">${escapeHtml(dueLabel(task))}</strong></div>
      <div><span><i data-lucide="gauge"></i>Esforço</span><strong>${SIZE[task.tamanho] || 'Média'}${task.estimativa_horas ? ` · ${Number(task.estimativa_horas)}h` : ''}</strong></div>
      <div><span><i data-lucide="flag"></i>Prioridade</span><strong>${PRIORITY[task.prioridade]}</strong></div>
      <div><span><i data-lucide="activity"></i>Atualizada</span><strong>${relativeTime(task.atualizado_em)}</strong></div>
    </section>

    <section class="detail-section"><div class="detail-section-head"><h3>Comentários</h3><span>${state.comments.length}</span></div><div class="comment-list">${renderComments()}</div>${!task.arquivada_em ? `<form id="drawerCommentForm" class="comment-form"><textarea id="drawerCommentText" required placeholder="Escreva um comentário..."></textarea><button type="submit"><i data-lucide="send"></i></button></form>` : ''}</section>
    <section class="detail-section"><div class="detail-section-head"><h3>Histórico</h3><span>${state.taskActivities.length} registros</span></div><div class="activity-timeline">${renderTaskActivities()}</div></section>
    <div class="drawer-footer-actions">${isManager() && !task.arquivada_em ? `<button id="editTaskBtn" class="btn secondary"><i data-lucide="pencil"></i>Editar detalhes</button><button id="archiveTaskBtn" class="btn danger-soft"><i data-lucide="archive"></i>Arquivar</button>` : ''}${isManager() && task.arquivada_em ? `<button id="restoreTaskBtn" class="btn primary"><i data-lucide="archive-restore"></i>Restaurar</button>` : ''}</div>`;
  bindTaskDrawerEvents(); refreshIcons();
}
function renderComments() {
  return state.comments.length ? state.comments.map(comment => `<div class="comment">${activityAvatarHTML(comment.colaborador, 'comentario', 'sm')}<div class="comment-bubble"><div class="comment-meta"><strong>${escapeHtml(comment.colaborador?.nome || 'Colaborador')}</strong><span>${formatDateTime(comment.criado_em)}</span></div><p>${escapeHtml(comment.texto)}</p></div></div>`).join('') : `<div class="empty-state">Sem comentários ainda.</div>`;
}
function renderTaskActivities() {
  return state.taskActivities.length ? state.taskActivities.map(activity => `<div class="activity-log"><span class="activity-log-icon"><i data-lucide="${activity.tipo === 'comentario' ? 'message-circle' : activity.tipo === 'status' ? 'refresh-cw' : activity.tipo === 'atribuida' ? 'user-round-check' : 'activity'}"></i></span><div><p><strong>${escapeHtml(activity.ator?.nome || 'Sistema')}</strong> ${escapeHtml(ACTIVITY_TEXT[activity.tipo] || 'atualizou esta demanda')}</p><span>${formatDateTime(activity.criado_em)}</span></div></div>`).join('') : `<div class="empty-state">O histórico começará a aparecer nas próximas alterações.</div>`;
}
function bindTaskDrawerEvents() {
  $$('#taskDrawerContent [data-task-status]').forEach(button => button.addEventListener('click', () => {
    if (!button.disabled && button.dataset.taskStatus !== state.selectedTask?.status) updateTaskStatus(state.selectedTask.id, button.dataset.taskStatus);
  }));
  $('drawerNextStatusBtn')?.addEventListener('click', event => updateTaskStatus(state.selectedTask.id, event.currentTarget.dataset.nextStatus));
  $('drawerAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ taskId: state.selectedTask.id, title: 'Alterar responsável' }));
  $('drawerCommentForm')?.addEventListener('submit', addComment);
  $('editTaskBtn')?.addEventListener('click', openEditTask);
  $('archiveTaskBtn')?.addEventListener('click', archiveTask);
  $('restoreTaskBtn')?.addEventListener('click', restoreTask);
}
function openEditTask() {
  const task = state.selectedTask; if (!task) return; const due = splitDateTime(taskDue(task));
  $('editTaskId').value = task.id; $('editTaskTitle').value = task.titulo; $('editTaskDescription').value = task.descricao || '';
  populateAssigneeSelects(); $('editTaskAssignee').value = task.responsavel_id || ''; $('editTaskPriority').value = task.prioridade;
  $('editTaskSize').value = task.tamanho || 'media'; $('editTaskDueDate').value = due.date; $('editTaskDueTime').value = due.time || '17:00';
  $('editTaskEstimate').value = task.estimativa_horas || ''; $('editTaskTags').value = (task.tags || []).join(', ');
  const reminderOffset = task.lembrar_em && taskDue(task) ? Math.round((new Date(taskDue(task)) - new Date(task.lembrar_em)) / 60000) : '';
  $('editTaskReminderOffset').value = ['0', '10', '30', '60', '1440'].includes(String(reminderOffset)) ? String(reminderOffset) : '';
  syncTaskFormVisuals('editTask');
  $('editTaskModal').classList.remove('hidden'); refreshIcons();
}
async function saveEditedTask(event) {
  event.preventDefault(); setLoading(true);
  try {
    const date = $('editTaskDueDate').value; const dueAt = date ? localDateTime(date, $('editTaskDueTime').value || '17:00') : null;
    const offset = $('editTaskReminderOffset').value; const remindAt = dueAt && offset !== '' ? new Date(new Date(dueAt).getTime() - Number(offset) * 60000).toISOString() : null;
    const { error } = await db.rpc('editar_tarefa_v2', {
      p_tarefa_id: $('editTaskId').value, p_titulo: $('editTaskTitle').value.trim(), p_descricao: $('editTaskDescription').value.trim() || null,
      p_prioridade: $('editTaskPriority').value, p_responsavel_id: $('editTaskAssignee').value || null, p_prazo_em: dueAt,
      p_lembrar_em: remindAt, p_tags: $('editTaskTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
      p_tamanho: $('editTaskSize').value, p_estimativa_horas: $('editTaskEstimate').value ? Number($('editTaskEstimate').value) : null
    });
    if (error) throw error; closeModal('editTaskModal'); await refreshData(); await openTask($('editTaskId').value); await dispatchPendingPush(); toast('Demanda atualizada.');
  } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
}
async function updateTaskStatus(taskId, status) {
  setLoading(true); try { const { error } = await db.rpc('atualizar_status', { p_tarefa_id: taskId, p_status: status }); if (error) throw error; await refreshData(); if (!$('taskDrawer').classList.contains('hidden')) await openTask(taskId); await dispatchPendingPush(); toast('Status atualizado.'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
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

function setupRealtime() {
  if (state.realtime) db.removeChannel(state.realtime);
  const refreshDebounced = debounce(async () => { try { await loadAll(); renderAll(); } catch (error) { console.warn('[realtime refresh]', error); } }, 350);
  state.realtime = db.channel(`demandas-v2-${state.me.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefas' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lembretes' }, refreshDebounced)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comentarios' }, refreshDebounced)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atividades_tarefa' }, refreshDebounced)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `colaborador_id=eq.${state.me.id}` }, async () => { await loadNotifications(); renderNotifications(); await dispatchPendingPush(); refreshIcons(); })
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
  const tasks = state.tasks.filter(task => [task.titulo, task.descricao, ...(task.tags || [])].join(' ').toLowerCase().includes(query)).slice(0, 8);
  const reminders = state.reminders.filter(item => [item.titulo, item.descricao].join(' ').toLowerCase().includes(query)).slice(0, 8);
  $('globalSearchResults').innerHTML = `${tasks.length ? `<div class="search-group-label">Demandas</div>${tasks.map(task => taskSearchResultHTML(task)).join('')}` : ''}${reminders.length ? `<div class="search-group-label">Agenda</div>${reminders.map(item => searchResultHTML('reminder', item.id, item.titulo, `${item.tipo === 'compromisso' ? 'Compromisso' : 'Lembrete'} · ${formatDateTime(item.inicio_em)}`, item.tipo === 'compromisso' ? 'calendar-clock' : 'bell')).join('')}` : ''}${!tasks.length && !reminders.length ? `<div class="empty-state" style="margin:8px"><i data-lucide="search-x"></i>Nenhum resultado encontrado.</div>` : ''}`; refreshIcons();
}
function searchResultHTML(type, id, title, meta, icon) { return `<button class="search-result" data-search-${type}="${id}"><span class="search-result-icon"><i data-lucide="${icon}"></i></span><span class="search-result-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(meta)}</span></span><i data-lucide="arrow-up-right"></i></button>`; }
function taskSearchResultHTML(task) { const person = collaborator(task.responsavel_id); return `<button class="search-result task-search-result" data-search-task="${task.id}"><span class="search-result-avatar">${taskAvatarHTML(person, task, 'sm')}</span><span class="search-result-copy"><strong>${escapeHtml(task.titulo)}</strong><span>${escapeHtml(person?.nome || 'Sem responsável')} · ${escapeHtml(STATUS[task.status]?.label || task.status)} · ${escapeHtml(dueLabel(task))}</span></span><i data-lucide="arrow-up-right"></i></button>`; }
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
const ONBOARDING_VERSION = '2026-08-demandas-v2-detalhado';

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
    <div class="onboarding-option-demo"><i class="urgent"></i><div><strong>Prioridade alta</strong><small>Precisa de atenção antes das tarefas normais</small></div></div>
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

function onboardingStatusDemo(active = 'andamento', action = 'Enviar para revisão') {
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
  return `<div class="onboarding-complete"><div class="onboarding-complete-icon"><i data-lucide="${manager ? 'clipboard-check' : 'badge-check'}"></i></div><strong>${manager ? 'Sua gestão começa aqui' : 'Sua rotina está pronta'}</strong><span>${manager ? 'Crie a primeira demanda com briefing, responsável e prazo claros.' : 'Abra suas demandas, atualize o status e registre impedimentos no próprio item.'}</span></div>`;
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
        ['badge-check', 'Validar e encerrar', 'Uma entrega só deve ser concluída depois da revisão ou confirmação necessária.']
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
      description: 'O status indica em que ponto a demanda está. O responsável normalmente move o trabalho conforme executa. O gestor acompanha, remove impedimentos e pode corrigir o fluxo quando necessário, sem transformar cada mudança em uma cerimônia corporativa.',
      points: [
        ['circle-dot-dashed', 'Nova', 'A demanda foi criada e ainda não começou. Briefing e responsabilidade devem estar definidos.'],
        ['loader-circle', 'Em andamento', 'O responsável iniciou a execução e o trabalho está ativo.'],
        ['scan-eye', 'Em revisão', 'A entrega está pronta para análise, aprovação ou ajustes finais.'],
        ['circle-check-big', 'Concluída', 'O resultado foi aceito e o ciclo foi encerrado. Se houver nova necessidade, reabra ou crie outra demanda.']
      ],
      tip: ['hand', 'Evite antecipar status', 'Não marque como concluída apenas para limpar o painel. O histórico precisa representar o trabalho de verdade.'],
      demo: onboardingStatusDemo('revisao', 'Validar entrega')
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
        ['circle-check-big', 'Conclua após validar', 'Encerrar confirma que a entrega foi aceita e alimenta os indicadores.'],
        ['rotate-ccw', 'Reabra quando necessário', 'Se houver mudança relevante ou erro após a conclusão, devolva a demanda ao fluxo correto.']
      ],
      tip: ['history', 'Tudo fica registrado', 'Comentários, responsáveis e mudanças de status formam o histórico da demanda.'],
      demo: onboardingReviewDemo()
    },
    {
      icon: 'calendar-days', eyebrow: 'Planejamento', title: 'Use agenda, prazos e alertas para reduzir cobranças manuais',
      description: 'A Agenda reúne demandas, compromissos e lembretes. Prazos aparecem automaticamente; lembretes podem ser pessoais ou da equipe conforme a permissão. Ative as notificações no navegador para receber avisos neste computador.',
      points: [
        ['calendar-range', 'Visão mensal', 'Abra um dia para conferir tudo que vence ou acontece naquela data.'],
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
        ['workflow', 'Atualize o status', 'Mova a demanda quando iniciar, enviar para revisão ou concluir.'],
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
        ['badge-alert', 'Entenda a prioridade', 'Urgente interrompe prioridades; alta exige atenção; média e baixa seguem o fluxo normal.'],
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
        ['scan-eye', 'Enviar para revisão', 'Quando a entrega estiver pronta para validação, mova para Em revisão e registre observações.'],
        ['circle-check-big', 'Concluir', 'Finalize somente quando o resultado tiver sido aceito ou quando o fluxo não exigir revisão.'],
        ['rotate-ccw', 'Reabrir', 'Caso surja ajuste relevante após conclusão, devolva a demanda ao estágio adequado.']
      ],
      tip: ['timer-reset', 'Status desatualizado gera ruído', 'Não deixe “Nova” quando já começou nem “Em andamento” quando está aguardando revisão.'],
      demo: onboardingStatusDemo('andamento', 'Enviar para revisão')
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
        ['badge-check', 'Conclua com responsabilidade', 'Verifique se a entrega está pronta e se observações finais foram registradas.'],
        ['shield-alert', 'Não esconda atrasos', 'Atualize o item e sinalize o risco; status correto ajuda a equipe a reagir.']
      ],
      tip: ['refresh-cw', 'Atualização mínima saudável', 'Ao iniciar, bloquear, enviar para revisão ou concluir, atualize o status ou deixe um comentário.'],
      demo: onboardingTaskDetailDemo()
    },
    {
      icon: 'badge-check', eyebrow: 'Checklist do colaborador', title: 'Você está pronto para assumir suas primeiras demandas',
      description: 'Quando uma demanda for atribuída a você, ela aparecerá em Hoje e em Minhas demandas. Leia o briefing, organize o prazo, inicie o trabalho, registre impedimentos e envie para revisão quando estiver pronto. Esse fluxo simples evita boa parte do caos artesanal que empresas chamam de alinhamento.',
      points: [
        ['check', 'Entendi a entrega', 'Sei qual resultado é esperado, quais materiais existem e quem valida.'],
        ['check', 'Planejei o prazo', 'Considerei esforço, dependências e outras demandas da minha fila.'],
        ['check', 'Vou atualizar o fluxo', 'Mudarei o status e registrarei bloqueios no momento adequado.'],
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
}

function moveOnboarding(direction) {
  const steps = getOnboardingSteps();
  const next = state.onboardingStep + direction;
  if (next >= steps.length) return closeOnboarding(true);
  state.onboardingStep = Math.max(0, next);
  renderOnboardingStep();
}

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
  $('authForm').addEventListener('submit', async event => {
    event.preventDefault(); $('authError').classList.add('hidden'); setLoading(true);
    try { await initializeSupabaseClient(); const { data, error } = await db.auth.signInWithPassword({ email: $('authEmail').value.trim(), password: $('authPassword').value }); if (error) throw error; state.session = data.session; await initializeUser(); }
    catch (error) { $('authError').textContent = errorMessage(error); $('authError').classList.remove('hidden'); }
    finally { setLoading(false); }
  });
  $$('.nav-item[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('[data-goto]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.goto)));
  $$('[data-quick-type]').forEach(button => button.addEventListener('click', () => openQuickAdd(button.dataset.quickType)));
  $('quickAddBtn').addEventListener('click', () => openQuickAdd(isManager() ? 'demanda' : 'lembrete'));
  $('newTaskPageBtn').addEventListener('click', () => openQuickAdd('demanda'));
  $$('[data-item-type]').forEach(button => button.addEventListener('click', () => { if (!button.disabled) setQuickType(button.dataset.itemType); }));
  $('quickAddForm').addEventListener('submit', saveQuickItem); $('editTaskForm').addEventListener('submit', saveEditedTask); $('profileForm').addEventListener('submit', saveProfile);
  $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => { const modal = $(button.dataset.closeModal); if (modal.id === 'profileModal' && modal.dataset.required === '1') return; closeModal(modal.id); }));
  $$('[data-close-drawer]').forEach(button => button.addEventListener('click', () => closeDrawer(button.dataset.closeDrawer)));
  $('drawerBackdrop').addEventListener('click', () => { closeDrawer('taskDrawer'); closeDrawer('personDrawer'); closeDrawer('notificationDrawer'); });
  $('notificationBtn').addEventListener('click', () => openDrawer('notificationDrawer')); $('markAllReadBtn').addEventListener('click', markAllRead);
  $('notificationSettingsBtn').addEventListener('click', () => { closeDrawer('notificationDrawer'); $('notificationSettingsModal').classList.remove('hidden'); updatePushStatus(); });
  $('openNotificationSettings').addEventListener('click', () => { $('notificationSettingsModal').classList.remove('hidden'); updatePushStatus(); });
  $('enablePushBtn').addEventListener('click', enablePush); $('disablePushBtn').addEventListener('click', disablePush); $('testPushBtn').addEventListener('click', testPush);
  $('profileBtn').addEventListener('click', () => openProfile(false));
  $('itemAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ selectId: 'itemAssignee', previewId: 'itemAssigneePreview', title: 'Selecionar responsável' }));
  $('editTaskAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ selectId: 'editTaskAssignee', previewId: 'editTaskAssigneePreview', title: 'Alterar responsável' }));
  $('assigneePickerSearch')?.addEventListener('input', debounce(event => { state.assigneePicker.search = event.target.value; renderAssigneePicker(); }, 100));
  $('userMenuTrigger')?.addEventListener('click', toggleUserMenu);
  $('userMenuProfileBtn')?.addEventListener('click', () => { closeUserMenu(); openProfile(false); });
  $('userMenuTasksBtn')?.addEventListener('click', () => { closeUserMenu(); applySmartFilter('minhas'); });
  $('userMenuAgendaBtn')?.addEventListener('click', () => { closeUserMenu(); switchView('agenda'); });
  $('userMenuTutorialBtn')?.addEventListener('click', () => { closeUserMenu(); maybeOpenOnboarding(true); });
  $('onboardingCloseBtn')?.addEventListener('click', () => closeOnboarding(true));
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
  ['taskSearch', 'taskAssigneeFilter', 'taskPriorityFilter', 'taskArchiveFilter'].forEach(id => $(id).addEventListener(id === 'taskSearch' ? 'input' : 'change', debounce(renderDemandas, 120)));
  $('taskViewToggle').addEventListener('click', event => { const button = event.target.closest('[data-task-view]'); if (!button) return; state.taskView = button.dataset.taskView; renderDemandas(); refreshIcons(); });
  $('calendarPrev').addEventListener('click', () => { state.calendarCursor = addMonths(state.calendarCursor, -1); renderAgenda(); refreshIcons(); });
  $('calendarNext').addEventListener('click', () => { state.calendarCursor = addMonths(state.calendarCursor, 1); renderAgenda(); refreshIcons(); });
  $('agendaTodayBtn').addEventListener('click', () => { state.calendarCursor = startOfMonth(new Date()); state.selectedDate = todayKey(); renderAgenda(); refreshIcons(); });
  $('addOnSelectedDay').addEventListener('click', () => openQuickAdd('lembrete', { date: state.selectedDate }));
  $('openSidebarBtn').addEventListener('click', openMobileSidebar); $('closeSidebarBtn').addEventListener('click', closeMobileSidebar); $('sidebarBackdrop').addEventListener('click', closeMobileSidebar);
  document.addEventListener('click', event => {
    if (!$('userMenuWrapper')?.contains(event.target)) closeUserMenu();
    const choice = event.target.closest('[data-choice-target]');
    if (choice) { const select = $(choice.dataset.choiceTarget); if (select) { select.value = choice.dataset.choiceValue; syncChoiceCards(choice.dataset.choiceTarget); } return; }
    const assigneeChoice = event.target.closest('[data-assignee-choice]');
    if (assigneeChoice) { chooseAssignee(assigneeChoice.dataset.assigneeChoice); return; }
    const avatarFilter = event.target.closest('[data-avatar-filter]');
    if (avatarFilter) { $('taskAssigneeFilter').value = avatarFilter.dataset.avatarFilter; renderDemandas(); return; }
    const person = event.target.closest('[data-open-person]'); if (person) openPerson(person.dataset.openPerson);
    const showTasks = event.target.closest('[data-person-show-tasks]'); if (showTasks) showPersonTasks(showTasks.dataset.personShowTasks);
    const createFor = event.target.closest('[data-person-create-task]'); if (createFor) { const personId = createFor.dataset.personCreateTask; closeDrawer('personDrawer'); openQuickAdd('demanda', { assigneeId: personId }); }
    const task = event.target.closest('[data-open-task]'); if (task) { if (!$('personDrawer').classList.contains('hidden')) closeDrawer('personDrawer'); openTask(task.dataset.openTask); }
    const reminder = event.target.closest('[data-open-reminder]'); if (reminder) openReminder(reminder.dataset.openReminder);
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
    if (!$('onboardingModal')?.classList.contains('hidden')) {
      if (event.key === 'Escape') { event.preventDefault(); closeOnboarding(true); return; }
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

bindEvents(); refreshIcons(); bootstrap();
