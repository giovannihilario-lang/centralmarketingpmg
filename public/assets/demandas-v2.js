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
  selectedDate: dateKey(new Date()), pushSubscription: null
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
  if (person?.foto_url) return `<div class="${cls}"><img src="${escapeHtml(person.foto_url)}" alt="${escapeHtml(person.nome)}" onerror="this.parentElement.textContent='${initials(person.nome)}'"></div>`;
  return `<div class="${cls}">${initials(person?.nome)}</div>`;
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
  if (!state.me.perfil_configurado) openProfile(true);
  await handleUrlActions();
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
  $('activityFeed').innerHTML = items.length ? items.map(activity => `<div class="activity-item">${avatarHTML(activity.ator, 'sm')}<div class="activity-copy"><strong>${escapeHtml(activity.ator?.nome || 'Sistema')}</strong> ${escapeHtml(ACTIVITY_TEXT[activity.tipo] || 'atualizou')} <strong>${escapeHtml(activity.tarefa?.titulo || 'uma demanda')}</strong><span>${relativeTime(activity.criado_em)}</span></div></div>`).join('')
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
  $('selectedDayItems').innerHTML = items.length ? items.map(entry => `<div class="day-item" data-open-${entry.kind === 'task' ? 'task' : 'reminder'}="${entry.id}"><div class="day-item-head"><i class="day-item-type ${entry.kind}"></i><small>${formatTime(entry.time)} · ${entry.kind === 'task' ? 'Demanda' : entry.kind === 'meeting' ? 'Compromisso' : 'Lembrete'}</small></div><strong>${escapeHtml(entry.title)}</strong></div>`).join('')
    : `<div class="empty-state"><i data-lucide="calendar-x-2"></i>Nenhum item neste dia.</div>`;
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
  renderBoard(); renderTaskList();
}
function populateAssigneeSelects() {
  const options = `<option value="">Todos os responsáveis</option><option value="none">Sem responsável</option>${state.collaborators.map(person => `<option value="${person.id}">${escapeHtml(person.nome)}</option>`).join('')}`;
  const select = $('taskAssigneeFilter'); if (select) { const value = select.value; select.innerHTML = options; select.value = value; }
  ['itemAssignee', 'editTaskAssignee'].forEach(id => { const el = $(id); if (!el) return; const value = el.value; el.innerHTML = `<option value="">Sem responsável</option>${state.collaborators.map(person => `<option value="${person.id}">${escapeHtml(person.nome)}</option>`).join('')}`; el.value = value; });
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
    <div class="task-card-footer"><span class="task-due ${dueClass(task)}"><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span><div class="task-card-person">${avatarHTML(person, 'sm')}<span>${escapeHtml(person?.nome || 'Sem responsável')}</span></div></div>
  </article>`;
}
function renderTaskList() {
  const tasks = filteredTasks();
  $('taskRows').innerHTML = tasks.length ? tasks.map(task => { const person = collaborator(task.responsavel_id); return `<div class="task-row" data-open-task="${task.id}">
    <div class="task-row-title"><i class="priority-line" style="background:${task.prioridade === 'urgente' ? 'var(--red)' : task.prioridade === 'alta' ? 'var(--amber)' : task.prioridade === 'baixa' ? 'var(--blue)' : 'var(--green-300)'}"></i><div><strong>${escapeHtml(task.titulo)}</strong><small>${escapeHtml((task.tags || []).join(' · ') || 'Sem tags')}</small></div></div>
    <div class="task-row-person">${avatarHTML(person, 'sm')}<span>${escapeHtml(person?.nome || 'Sem responsável')}</span></div><span class="table-pill ${dueClass(task)}">${escapeHtml(dueLabel(task))}</span><span class="table-pill">${STATUS[task.status]?.label}</span><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span></div>`; }).join('')
    : `<div class="empty-state" style="margin:15px"><i data-lucide="search-x"></i>Nenhuma demanda encontrada.</div>`;
}
function bindTaskDrag() {
  $$('.task-card[draggable="true"]').forEach(card => {
    card.ondragstart = event => { event.dataTransfer.setData('text/plain', card.dataset.taskId); card.classList.add('dragging'); };
    card.ondragend = () => card.classList.remove('dragging');
  });
}

function renderEquipe() {
  const active = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida');
  const totalHours = active.reduce((sum, task) => sum + sizeWeight(task), 0); const overdue = active.filter(isOverdue).length;
  const busyPeople = state.collaborators.filter(person => active.filter(task => task.responsavel_id === person.id).reduce((sum, task) => sum + sizeWeight(task), 0) >= 18).length;
  const unassigned = active.filter(task => !task.responsavel_id).length;
  const cards = [
    ['users', state.collaborators.length, 'Pessoas ativas'], ['clock-4', `${Math.round(totalHours)}h`, 'Carga estimada'],
    ['triangle-alert', overdue, 'Demandas atrasadas'], ['user-round-x', unassigned, 'Sem responsável']
  ];
  $('teamSummary').innerHTML = cards.map(([icon, value, label]) => `<div class="team-summary-card"><span class="team-summary-icon"><i data-lucide="${icon}"></i></span><div><strong>${value}</strong><span>${label}</span></div></div>`).join('');
  $('teamGrid').innerHTML = state.collaborators.map(person => personCardHTML(person, active, busyPeople)).join('');
}
function personCardHTML(person, activeTasks) {
  const tasks = activeTasks.filter(task => task.responsavel_id === person.id); const overdue = tasks.filter(isOverdue).length;
  const weekEnd = addDays(new Date(), 7); const week = tasks.filter(task => { const due = taskDue(task); return due && new Date(due) <= weekEnd; }).length;
  const hours = tasks.reduce((sum, task) => sum + sizeWeight(task), 0); const percentage = Math.min(100, Math.round((hours / 24) * 100));
  const next = [...tasks].filter(task => taskDue(task)).sort((a, b) => new Date(taskDue(a)) - new Date(taskDue(b)))[0];
  return `<article class="person-card"><div class="person-head">${avatarHTML(person, 'md')}<div class="person-copy"><strong>${escapeHtml(person.nome)}</strong><span>${escapeHtml(person.cargo || 'Marketing')}</span></div>${person.role === 'gestor' ? '<span class="role-chip">Gestor</span>' : ''}</div>
    <div class="person-metrics"><div class="person-metric"><strong>${tasks.length}</strong><span>Em aberto</span></div><div class="person-metric"><strong>${overdue}</strong><span>Atrasadas</span></div><div class="person-metric"><strong>${week}</strong><span>Esta semana</span></div></div>
    <div class="workload-label"><span>Carga estimada</span><span>${Math.round(hours)}h · ${percentage}%</span></div><div class="workload-track"><i class="${percentage >= 80 ? 'high' : ''}" style="width:${percentage}%"></i></div>
    <div class="person-next"><span>Próxima entrega</span><strong>${next ? `${escapeHtml(next.titulo)} · ${escapeHtml(dueLabel(next))}` : 'Nenhuma entrega com prazo'}</strong></div></article>`;
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
  setQuickType(type); $('quickAddForm').reset(); setQuickType(type);
  const today = preset.date || todayKey();
  $('itemTitle').value = preset.title || ''; $('itemDescription').value = preset.description || '';
  $('itemDueDate').value = preset.date || ''; $('itemDueTime').value = preset.time || '17:00';
  $('reminderDate').value = today; $('reminderTime').value = preset.time || '09:00';
  $('meetingEndDate').value = today; $('meetingEndTime').value = preset.endTime || '10:00';
  $('reminderVisibility').value = isManager() ? (preset.visibility || 'pessoal') : 'pessoal';
  if (preset.reminder) fillReminderForm(preset.reminder);
  $('quickAddModal').classList.remove('hidden'); setTimeout(() => $('itemTitle').focus(), 60); refreshIcons();
}
function setQuickType(type) {
  state.quickType = type; $('itemType').value = type;
  $$('[data-item-type]').forEach(btn => btn.classList.toggle('active', btn.dataset.itemType === type));
  $('demandFields').classList.toggle('hidden', type !== 'demanda'); $('reminderFields').classList.toggle('hidden', type === 'demanda');
  $('meetingEndFields').classList.toggle('hidden', type !== 'compromisso');
  $('visibilityField').classList.toggle('hidden', !isManager());
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
function closeModal(id) { $(id).classList.add('hidden'); if (id === 'quickAddModal') state.editingReminderId = null; }

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
  const task = state.selectedTask; if (!task) return; const person = collaborator(task.responsavel_id);
  $('taskDrawerKicker').textContent = `Demanda #${task.id.slice(0, 5).toUpperCase()}`; $('taskDrawerTitle').textContent = task.titulo;
  const canChangeStatus = isManager() || task.responsavel_id === state.me.id || task.criado_por === state.me.id;
  $('taskDrawerContent').innerHTML = `<div class="detail-banner"><p>${escapeHtml(task.descricao || 'Esta demanda ainda não possui descrição.')}</p>${(task.tags || []).length ? `<div class="detail-tags">${task.tags.map(tag => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}</div>
    <div class="detail-grid"><div class="detail-field"><label>Status</label>${canChangeStatus && !task.arquivada_em ? `<select id="drawerTaskStatus">${Object.entries(STATUS).map(([key, item]) => `<option value="${key}" ${task.status === key ? 'selected' : ''}>${item.label}</option>`).join('')}</select>` : `<strong>${STATUS[task.status]?.label}</strong>`}</div>
    <div class="detail-field"><label>Responsável</label>${isManager() && !task.arquivada_em ? `<select id="drawerTaskAssignee"><option value="">Sem responsável</option>${state.collaborators.map(item => `<option value="${item.id}" ${task.responsavel_id === item.id ? 'selected' : ''}>${escapeHtml(item.nome)}</option>`).join('')}</select>` : `<strong>${escapeHtml(person?.nome || 'Sem responsável')}</strong>`}</div>
    <div class="detail-field"><label>Prazo</label><strong class="${dueClass(task)}">${escapeHtml(dueLabel(task))}</strong></div><div class="detail-field"><label>Esforço</label><strong>${SIZE[task.tamanho] || 'Média'}${task.estimativa_horas ? ` · ${Number(task.estimativa_horas)}h` : ''}</strong></div></div>
    <section class="detail-section"><div class="detail-section-head"><h3>Comentários</h3><span>${state.comments.length}</span></div><div class="comment-list">${renderComments()}</div>${!task.arquivada_em ? `<form id="drawerCommentForm" class="comment-form"><textarea id="drawerCommentText" required placeholder="Escreva um comentário..."></textarea><button type="submit"><i data-lucide="send"></i></button></form>` : ''}</section>
    <section class="detail-section"><div class="detail-section-head"><h3>Histórico</h3><span>${state.taskActivities.length} registros</span></div><div class="activity-timeline">${renderTaskActivities()}</div></section>
    <div class="drawer-footer-actions">${isManager() && !task.arquivada_em ? `<button id="editTaskBtn" class="btn secondary"><i data-lucide="pencil"></i>Editar</button><button id="archiveTaskBtn" class="btn danger-soft"><i data-lucide="archive"></i>Arquivar</button>` : ''}${isManager() && task.arquivada_em ? `<button id="restoreTaskBtn" class="btn primary"><i data-lucide="archive-restore"></i>Restaurar</button>` : ''}</div>`;
  bindTaskDrawerEvents(); refreshIcons();
}
function renderComments() {
  return state.comments.length ? state.comments.map(comment => `<div class="comment">${avatarHTML(comment.colaborador, 'sm')}<div class="comment-bubble"><div class="comment-meta"><strong>${escapeHtml(comment.colaborador?.nome || 'Colaborador')}</strong><span>${formatDateTime(comment.criado_em)}</span></div><p>${escapeHtml(comment.texto)}</p></div></div>`).join('') : `<div class="empty-state">Sem comentários ainda.</div>`;
}
function renderTaskActivities() {
  return state.taskActivities.length ? state.taskActivities.map(activity => `<div class="activity-log"><span class="activity-log-icon"><i data-lucide="${activity.tipo === 'comentario' ? 'message-circle' : activity.tipo === 'status' ? 'refresh-cw' : activity.tipo === 'atribuida' ? 'user-round-check' : 'activity'}"></i></span><div><p><strong>${escapeHtml(activity.ator?.nome || 'Sistema')}</strong> ${escapeHtml(ACTIVITY_TEXT[activity.tipo] || 'atualizou esta demanda')}</p><span>${formatDateTime(activity.criado_em)}</span></div></div>`).join('') : `<div class="empty-state">O histórico começará a aparecer nas próximas alterações.</div>`;
}
function bindTaskDrawerEvents() {
  $('drawerTaskStatus')?.addEventListener('change', event => updateTaskStatus(state.selectedTask.id, event.target.value));
  $('drawerTaskAssignee')?.addEventListener('change', event => updateTaskAssignee(state.selectedTask.id, event.target.value || null));
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
  event.preventDefault(); setLoading(true); try { const { data, error } = await db.rpc('atualizar_meu_perfil', { p_nome: $('profileName').value.trim(), p_cargo: $('profileJob').value.trim() || null }); if (error) throw error; state.me = data; $('profileModal').dataset.required = '0'; closeModal('profileModal'); await loadCollaborators(); renderAll(); toast('Perfil atualizado.'); } catch (error) { toast(errorMessage(error), 'error'); } finally { setLoading(false); }
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
  $('globalSearchResults').innerHTML = `${tasks.length ? `<div class="search-group-label">Demandas</div>${tasks.map(task => searchResultHTML('task', task.id, task.titulo, `${STATUS[task.status]?.label} · ${dueLabel(task)}`, 'clipboard-check')).join('')}` : ''}${reminders.length ? `<div class="search-group-label">Agenda</div>${reminders.map(item => searchResultHTML('reminder', item.id, item.titulo, `${item.tipo === 'compromisso' ? 'Compromisso' : 'Lembrete'} · ${formatDateTime(item.inicio_em)}`, item.tipo === 'compromisso' ? 'calendar-clock' : 'bell')).join('')}` : ''}${!tasks.length && !reminders.length ? `<div class="empty-state" style="margin:8px"><i data-lucide="search-x"></i>Nenhum resultado encontrado.</div>` : ''}`; refreshIcons();
}
function searchResultHTML(type, id, title, meta, icon) { return `<button class="search-result" data-search-${type}="${id}"><span class="search-result-icon"><i data-lucide="${icon}"></i></span><span class="search-result-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(meta)}</span></span><i data-lucide="arrow-up-right"></i></button>`; }
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
  $('drawerBackdrop').addEventListener('click', () => { closeDrawer('taskDrawer'); closeDrawer('notificationDrawer'); });
  $('notificationBtn').addEventListener('click', () => openDrawer('notificationDrawer')); $('markAllReadBtn').addEventListener('click', markAllRead);
  $('notificationSettingsBtn').addEventListener('click', () => { closeDrawer('notificationDrawer'); $('notificationSettingsModal').classList.remove('hidden'); updatePushStatus(); });
  $('openNotificationSettings').addEventListener('click', () => { $('notificationSettingsModal').classList.remove('hidden'); updatePushStatus(); });
  $('enablePushBtn').addEventListener('click', enablePush); $('disablePushBtn').addEventListener('click', disablePush); $('testPushBtn').addEventListener('click', testPush);
  $('profileBtn').addEventListener('click', () => openProfile(false));
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
    const task = event.target.closest('[data-open-task]'); if (task) openTask(task.dataset.openTask);
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
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape') { closeSearch(); $$('.modal-layer:not(.hidden)').forEach(modal => { if (modal.id !== 'profileModal' || modal.dataset.required !== '1') closeModal(modal.id); }); closeDrawer('taskDrawer'); closeDrawer('notificationDrawer'); }
  });
}
async function markNotificationAndOpen(element) {
  const id = element.dataset.notificationId; const { error } = await db.rpc('marcar_notificacao_lida', { p_id: id }); if (!error) { const found = state.notifications.find(item => item.id === id); if (found) found.lida = true; renderNotifications(); }
  closeDrawer('notificationDrawer'); if (element.dataset.taskId) openTask(element.dataset.taskId); else if (element.dataset.reminderId) openReminder(element.dataset.reminderId);
}

bindEvents(); refreshIcons(); bootstrap();
