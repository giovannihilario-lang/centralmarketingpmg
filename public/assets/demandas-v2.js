/* PMG Connect — Central de Demandas V3.8.5 / Base íntegra V3.7.4 + UX V3.8.1 + autoria robusta V3.8.5 */
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
  session: null, me: null, collaborators: [], tasks: [], taskAssignees: [], recurringAssignees: [], multiAssigneeReady: false, authorshipReviews: [], authorshipConfirmations: [], taskExecutors: [], authorshipReady: false, evaluationExecutorIds: [], authorshipPostponed: new Set(), reminders: [], notifications: [], activities: [],
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

state.authorshipBackendVersionV385 = '';
state.authorshipLastErrorV385 = null;
state.suppliersV1B = [];
state.supplierLinksReadyV1B = false;
state.supplierFilterV1B = '';
state.supplierLinkWarningV1B = '';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const markdownSafeUrlV377 = value => {
  const raw = String(value || '').trim();
  if (/^(https?:\/\/|mailto:)/i.test(raw)) return raw;
  if (/^\/(?!\/)/.test(raw)) return raw;
  return '';
};
function markdownInlineV377(value) {
  let source = String(value ?? '');
  const tokens = [];
  const hold = html => {
    const token = `MDTOKENV377${tokens.length}TOKEN`;
    tokens.push(html);
    return token;
  };

  source = source.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  source = source.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const safe = markdownSafeUrlV377(url);
    if (!safe) return `${label} (${url})`;
    const external = /^https?:\/\//i.test(safe);
    return hold(`<a href="${escapeHtml(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`);
  });

  source = escapeHtml(source);
  source = source
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, '$1<em>$2</em>');

  tokens.forEach((html, index) => {
    source = source.replace(`MDTOKENV377${index}TOKEN`, html);
  });
  return source;
}
function renderMarkdownV377(value) {
  const source = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return '';
  const lines = source.split('\n');
  const output = [];
  let list = null;
  let code = false;
  let codeLines = [];

  const closeList = () => {
    if (!list) return;
    output.push(`</${list}>`);
    list = null;
  };
  const openList = type => {
    if (list === type) return;
    closeList();
    list = type;
    output.push(`<${type}>`);
  };

  lines.forEach(line => {
    const fence = line.match(/^\s*```/);
    if (fence) {
      closeList();
      if (code) {
        output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
      }
      code = !code;
      return;
    }
    if (code) {
      codeLines.push(line);
      return;
    }

    if (!line.trim()) {
      closeList();
      return;
    }

    let match;
    if ((match = line.match(/^\s*(#{1,3})\s+(.+)$/))) {
      closeList();
      const level = Math.min(3, match[1].length);
      output.push(`<h${level}>${markdownInlineV377(match[2])}</h${level}>`);
      return;
    }
    if ((match = line.match(/^\s*>\s?(.*)$/))) {
      closeList();
      output.push(`<blockquote>${markdownInlineV377(match[1])}</blockquote>`);
      return;
    }
    if ((match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/))) {
      openList('ul');
      const checked = /x/i.test(match[1]);
      output.push(`<li class="md-check"><input type="checkbox" disabled ${checked ? 'checked' : ''}><span>${markdownInlineV377(match[2])}</span></li>`);
      return;
    }
    if ((match = line.match(/^\s*[-*+]\s+(.+)$/))) {
      openList('ul');
      output.push(`<li>${markdownInlineV377(match[1])}</li>`);
      return;
    }
    if ((match = line.match(/^\s*\d+\.\s+(.+)$/))) {
      openList('ol');
      output.push(`<li>${markdownInlineV377(match[1])}</li>`);
      return;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      closeList();
      output.push('<hr>');
      return;
    }

    closeList();
    output.push(`<p>${markdownInlineV377(line)}</p>`);
  });

  closeList();
  if (code) output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return output.join('');
}
function markdownPlainTextV377(value) {
  return String(value ?? '')
    .replace(/```([\s\S]*?)```/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[~*_`]/g, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function markdownWrapV377(textarea, before, after = before, placeholder = 'texto') {
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const selected = textarea.value.slice(start, end) || placeholder;
  textarea.setRangeText(`${before}${selected}${after}`, start, end, 'select');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}
function markdownPrefixV377(textarea, prefix, ordered = false) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const blockStart = textarea.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextBreak = textarea.value.indexOf('\n', end);
  const blockEnd = nextBreak === -1 ? textarea.value.length : nextBreak;
  const lines = textarea.value.slice(blockStart, blockEnd).split('\n');
  const replaced = lines.map((line, index) => `${ordered ? `${index + 1}. ` : prefix}${line}`).join('\n');
  textarea.setRangeText(replaced, blockStart, blockEnd, 'select');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}
function markdownActionV377(textarea, action) {
  if (action === 'bold') return markdownWrapV377(textarea, '**', '**', 'negrito');
  if (action === 'italic') return markdownWrapV377(textarea, '*', '*', 'itálico');
  if (action === 'strike') return markdownWrapV377(textarea, '~~', '~~', 'riscado');
  if (action === 'code') return markdownWrapV377(textarea, '`', '`', 'código');
  if (action === 'link') return markdownWrapV377(textarea, '[', '](https://)', 'texto do link');
  if (action === 'heading') return markdownPrefixV377(textarea, '## ');
  if (action === 'bullet') return markdownPrefixV377(textarea, '- ');
  if (action === 'number') return markdownPrefixV377(textarea, '', true);
  if (action === 'check') return markdownPrefixV377(textarea, '- [ ] ');
  if (action === 'quote') return markdownPrefixV377(textarea, '> ');
}
function enhanceMarkdownTextareaV377(textarea, options = {}) {
  if (!textarea || textarea.dataset.markdownV377 === '1') return;
  textarea.dataset.markdownV377 = '1';
  textarea.classList.add('markdown-source');

  const shell = document.createElement('div');
  shell.className = `markdown-editor-v377${options.compact ? ' compact' : ''}`;
  textarea.parentNode.insertBefore(shell, textarea);
  shell.appendChild(textarea);

  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-toolbar-v377';
  toolbar.innerHTML = `<span class="markdown-badge-v377"><i data-lucide="pilcrow"></i>Markdown</span>
    <div class="markdown-tools-v377">
      <button type="button" data-md-action="bold" title="Negrito (Ctrl+B)"><strong>B</strong></button>
      <button type="button" data-md-action="italic" title="Itálico (Ctrl+I)"><em>I</em></button>
      <button type="button" data-md-action="strike" title="Riscado"><s>S</s></button>
      <button type="button" data-md-action="heading" title="Subtítulo"><i data-lucide="heading-2"></i></button>
      <button type="button" data-md-action="bullet" title="Lista"><i data-lucide="list"></i></button>
      <button type="button" data-md-action="number" title="Lista numerada"><i data-lucide="list-ordered"></i></button>
      <button type="button" data-md-action="check" title="Checklist"><i data-lucide="list-checks"></i></button>
      <button type="button" data-md-action="quote" title="Citação"><i data-lucide="text-quote"></i></button>
      <button type="button" data-md-action="code" title="Código"><i data-lucide="code-2"></i></button>
      <button type="button" data-md-action="link" title="Link (Ctrl+K)"><i data-lucide="link-2"></i></button>
      <button type="button" class="markdown-preview-toggle-v377" data-md-preview title="Visualizar Markdown"><i data-lucide="eye"></i><span>Visualizar</span></button>
    </div>`;
  shell.insertBefore(toolbar, textarea);

  const preview = document.createElement('div');
  preview.className = 'markdown-preview-v377 markdown-body-v377 hidden';
  shell.appendChild(preview);

  const hint = document.createElement('div');
  hint.className = 'markdown-hint-v377';
  hint.innerHTML = '<span>**negrito** · - [ ] checklist · [link](https://...)</span><span>HTML é bloqueado por segurança</span>';
  shell.appendChild(hint);

  const refreshPreview = () => {
    preview.innerHTML = renderMarkdownV377(textarea.value) || '<p class="md-empty-v377">Nada para visualizar ainda.</p>';
  };
  const togglePreview = () => {
    const on = !shell.classList.contains('is-previewing');
    shell.classList.toggle('is-previewing', on);
    textarea.classList.toggle('hidden', on);
    preview.classList.toggle('hidden', !on);
    const btn = toolbar.querySelector('[data-md-preview]');
    if (btn) btn.innerHTML = on ? '<i data-lucide="pencil"></i><span>Editar</span>' : '<i data-lucide="eye"></i><span>Visualizar</span>';
    if (on) refreshPreview();
    refreshIcons();
  };

  toolbar.addEventListener('click', event => {
    const previewButton = event.target.closest('[data-md-preview]');
    if (previewButton) return togglePreview();
    const button = event.target.closest('[data-md-action]');
    if (!button) return;
    markdownActionV377(textarea, button.dataset.mdAction);
  });
  textarea.addEventListener('input', () => {
    if (shell.classList.contains('is-previewing')) refreshPreview();
  });
  textarea.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b') { event.preventDefault(); markdownActionV377(textarea, 'bold'); }
    if (key === 'i') { event.preventDefault(); markdownActionV377(textarea, 'italic'); }
    if (key === 'k') { event.preventDefault(); markdownActionV377(textarea, 'link'); }
  });
}
function setupMarkdownEditorsV377() {
  ['itemDescription','editTaskDescription','recurrenceEditDescription','evaluationNote','projectObjective'].forEach(id => enhanceMarkdownTextareaV377($(id)));
  refreshIcons();
}

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
  const stack = $('toastStack');
  if (!stack) return;
  const signature = `${type}:${String(message || '')}`;
  const existing = [...stack.querySelectorAll('.toast')].find(item => item.dataset.toastSignature === signature);
  if (existing) {
    existing.classList.remove('toast-repeat-pulse');
    void existing.offsetWidth;
    existing.classList.add('toast-repeat-pulse');
    return;
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.dataset.toastSignature = signature;
  el.innerHTML = `<i data-lucide="${type === 'error' ? 'circle-alert' : 'circle-check'}"></i><span>${escapeHtml(message)}</span>`;
  stack.appendChild(el); refreshIcons();
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, 3400);
  setTimeout(() => el.remove(), 3750);
}
function errorMessage(error) {
  const message = error?.message || error?.details || String(error || 'Erro inesperado');
  const code = String(error?.code || '');
  const authorshipRef = /solicitar_confirmacao_autoria_v1|responder_confirmacao_autoria_v1|pmg_autoria_snapshot_v385|tarefa_autoria_revisoes|tarefa_autoria_confirmacoes|tarefa_executores/i.test(message);
  const authorshipMissing = authorshipRef && (['PGRST202','PGRST205','42P01','42883'].includes(code) || /could not find the function|does not exist|schema cache/i.test(message));
  if (authorshipMissing) return `O recurso de autoria compartilhada não respondeu (${code || 'sem código'}). Atualize a página; se persistir, envie o erro técnico do console.`;
  if (authorshipRef && code === '42501') return 'Sua sessão não recebeu permissão para a autoria compartilhada. Saia do PMG Connect, entre novamente e atualize a página.';
  if (/definir_responsaveis_tarefa_modo_v1|definir_responsaveis_recorrencia_modo_v1|modo_responsabilidade|primeiro_cumprir/i.test(message)) return `O recurso de múltiplos responsáveis não respondeu: ${message}`;
  if (/tarefa_responsaveis|definir_responsaveis_tarefa_v1|demanda_recorrente_responsaveis/i.test(message)) return `O recurso de responsáveis não respondeu: ${message}`;
  if (/alterar_urgencia_tarefa_v1/i.test(message)) return `Não foi possível alterar a urgência: ${message}`;
  if (/demandas_recorrentes|recorrencia_id|processar_recorrencias_demanda|converter_tarefa_em_recorrente|transferir_demanda_recorrente/i.test(message)) return `O recurso de recorrências não respondeu: ${message}`;
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
    const active = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida' && taskHasAssignee(task, person.id));
    return { active, overdue: active.filter(isOverdue), dueToday: active.filter(task => !isDeadlinePausedV379(task) && taskDueKey(task) === todayKey()), hours: active.reduce((sum, task) => sum + sizeWeight(task), 0), utilization: 0, risk: 'balanced' };
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
  syncChoiceCards(isEdit ? 'editTaskResponsibilityMode' : 'itemResponsibilityMode');
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

function formAssigneeJsonId(selectId) {
  return ({ itemAssignee: 'itemAssigneesJson', editTaskAssignee: 'editTaskAssigneesJson', recurrenceEditAssignee: 'recurrenceEditAssigneesJson' })[selectId] || null;
}
function parseAssigneeJson(id) {
  if (!id || !$(id)) return [];
  try { const raw = JSON.parse($(id).value || '[]'); return [...new Set((Array.isArray(raw) ? raw : []).filter(Boolean))]; }
  catch (_) { return []; }
}
function setAssigneeJson(id, ids) { if ($(id)) $(id).value = JSON.stringify([...new Set((ids || []).filter(Boolean))]); }
function openAssigneePicker({ selectId = null, previewId = null, jsonInputId = null, taskId = null, recurrenceId = null, multi = false, title = 'Selecionar responsáveis' } = {}) {
  const resolvedJsonId = jsonInputId || formAssigneeJsonId(selectId);
  let selectedIds = [];
  if (taskId) selectedIds = taskAssigneeIds(state.tasks.find(task => task.id === taskId));
  else if (recurrenceId) selectedIds = seriesAssigneeIds(recurrenceSeriesById(recurrenceId));
  else if (multi) selectedIds = parseAssigneeJson(resolvedJsonId);
  else if (selectId && $(selectId)?.value) selectedIds = [$(selectId).value];
  state.assigneePicker = { selectId, previewId, jsonInputId: resolvedJsonId, taskId, recurrenceId, multi, selectedIds, search: '' };
  $('assigneePickerTitle').textContent = title;
  if ($('assigneePickerDescription')) $('assigneePickerDescription').textContent = multi
    ? 'Selecione uma ou mais pessoas. Todos enxergam a demanda, recebem os alertas e podem movimentar o trabalho.'
    : 'Consulte a carga atual e escolha a pessoa mais adequada para a demanda.';
  $('assigneePickerSearch').value = '';
  $('assigneePickerApplyBtn')?.classList.toggle('hidden', !multi);
  renderAssigneePicker();
  $('assigneePickerModal').classList.remove('hidden');
  setTimeout(() => $('assigneePickerSearch').focus(), 60);
  refreshIcons();
}
function renderAssigneePicker() {
  const picker = state.assigneePicker || {};
  const query = (picker.search || '').trim().toLowerCase();
  const selectedIds = [...new Set((picker.selectedIds || []).filter(Boolean))];
  const currentId = selectedIds[0] || '';
  const transferTask = picker.taskId ? state.tasks.find(task => task.id === picker.taskId) : null;
  const people = state.collaborators
    .filter(person => !query || [person.nome, person.cargo, person.role].join(' ').toLowerCase().includes(query))
    .map(person => {
      const stats = assigneeStats(person);
      const already = selectedIds.includes(person.id);
      const extra = transferTask && !already ? taskEffortShare(transferTask, Math.max(1, selectedIds.length + 1)) : 0;
      const projectedHours = Math.max(0, stats.hours + extra);
      const projectedUtilization = Math.round(projectedHours / TEAM_CAPACITY_HOURS * 100);
      return { person, stats, projectedHours, projectedUtilization, extra, already };
    })
    .sort((a, b) => Number(b.already) - Number(a.already) || (TEAM_RISK[a.stats.risk]?.score || 0) - (TEAM_RISK[b.stats.risk]?.score || 0) || a.stats.hours - b.stats.hours || String(a.person.nome || '').localeCompare(String(b.person.nome || ''), 'pt-BR'));
  if ($('assigneePickerSelectionSummary')) $('assigneePickerSelectionSummary').textContent = selectedIds.length ? `${selectedIds.length} responsável${selectedIds.length === 1 ? '' : 'is'} selecionado${selectedIds.length === 1 ? '' : 's'}` : 'Nenhuma pessoa selecionada';
  $('assigneePickerContext').innerHTML = `<i data-lucide="${picker.multi ? 'users-round' : 'info'}"></i><span>${picker.multi ? `${selectedIds.length} selecionado${selectedIds.length === 1 ? '' : 's'}. O primeiro da lista será a referência principal; todos os demais têm acesso operacional igual.` : `${people.length} pessoa${people.length === 1 ? '' : 's'} encontrada${people.length === 1 ? '' : 's'}.`}</span>`;
  const clearOption = picker.multi && (!query || 'sem responsável'.includes(query))
    ? `<button type="button" class="assignee-option none ${selectedIds.length === 0 ? 'selected' : ''}" data-assignee-clear="true"><span class="assignee-option-avatar">${avatarHTML(null, 'md')}</span><span class="assignee-option-copy"><strong>Sem responsáveis</strong><small>Limpar todas as pessoas selecionadas</small></span><span class="assignee-option-state"><i data-lucide="${selectedIds.length === 0 ? 'check' : 'x'}"></i></span></button>`
    : (!picker.multi && (!query || 'sem responsável'.includes(query)) ? `<button type="button" class="assignee-option none ${currentId === '' ? 'selected' : ''}" data-assignee-choice=""><span class="assignee-option-avatar">${avatarHTML(null, 'md')}</span><span class="assignee-option-copy"><strong>Sem responsável</strong><small>Deixar na fila para atribuir depois</small></span><span class="assignee-option-state"><i data-lucide="${currentId === '' ? 'check' : 'chevron-right'}"></i></span></button>` : '');
  $('assigneePickerList').innerHTML = clearOption + (people.length ? people.map(({ person, stats, projectedHours, projectedUtilization, extra, already }) => {
    const risk = teamRiskLabel(stats);
    const order = selectedIds.indexOf(person.id);
    return `<button type="button" class="assignee-option risk-${stats.risk} ${already ? 'selected multi-selected' : ''}" data-assignee-choice="${person.id}">
      <span class="assignee-option-avatar">${avatarStatusHTML(person, stats, 'md')}</span>
      <span class="assignee-option-copy"><strong>${escapeHtml(person.nome)}${order === 0 && picker.multi ? ' <em class="primary-assignee-tag">principal</em>' : ''}</strong><small>${escapeHtml(person.cargo || 'Marketing')}</small><em>${escapeHtml(assigneeLoadText(stats))}${extra ? ` · com esta demanda: ${formatHours(projectedHours)}` : ''}</em></span>
      <span class="assignee-option-load"><b>${Math.round(stats.hours)}h</b><small>${extra ? `${projectedUtilization}% projetado` : risk.label}</small><i class="assignee-load-track"><span style="width:${Math.min(100, extra ? projectedUtilization : (stats.utilization || 0))}%"></span></i></span>
      <span class="assignee-option-state multi-state"><i data-lucide="${already ? 'check' : picker.multi ? 'plus' : 'chevron-right'}"></i></span>
    </button>`;
  }).join('') : `<div class="assignee-picker-empty"><i data-lucide="user-search"></i><strong>Ninguém encontrado</strong><span>Tente outro nome ou cargo.</span></div>`);
  refreshIcons();
}
async function chooseAssignee(personId) {
  const picker = state.assigneePicker || {};
  if (picker.multi) {
    const ids = [...new Set((picker.selectedIds || []).filter(Boolean))];
    if (personId) {
      const index = ids.indexOf(personId);
      if (index >= 0) ids.splice(index, 1); else ids.push(personId);
    }
    picker.selectedIds = ids;
    state.assigneePicker = picker;
    renderAssigneePicker();
    return;
  }
  closeModal('assigneePickerModal');
  if (picker.taskId) { await updateTaskAssignee(picker.taskId, personId || null); return; }
  const select = $(picker.selectId); if (!select) return;
  select.value = personId || '';
  renderAssigneePreview(picker.selectId, picker.previewId);
}
async function applyAssigneePickerSelection() {
  const picker = { ...(state.assigneePicker || {}) };
  const ids = [...new Set((picker.selectedIds || []).filter(Boolean))];
  if (picker.taskId) { closeModal('assigneePickerModal'); await updateTaskAssigneesV37(picker.taskId, ids); return; }
  if (picker.recurrenceId) { closeModal('assigneePickerModal'); await updateRecurringAssigneesV37(picker.recurrenceId, ids); return; }
  const select = $(picker.selectId);
  if (select) select.value = ids[0] || '';
  setAssigneeJson(picker.jsonInputId, ids);
  renderAssigneePreview(picker.selectId, picker.previewId);
  closeModal('assigneePickerModal');
}
function statusFlowHTML(task, canChangeStatus) {
  const currentIndex = STATUS_ORDER.indexOf(task.status);
  return STATUS_ORDER.map((status, index) => {
    const meta = STATUS[status];
    const current = status === task.status;
    const passed = currentIndex >= 0 && index < currentIndex;
    let disabled = !canChangeStatus || Boolean(task.arquivada_em) || current;
    const claimMode = !isManager() && taskAssigneeIds(task).length === 0 && task.prioridade === 'imediata' && task.alerta_para_todos;
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
function isDeadlinePausedV379(task) { return Boolean(task && task.status === 'revisao'); }
function isOverdue(task) { const due = taskDue(task); return Boolean(due && !isDeadlinePausedV379(task) && new Date(due) < new Date() && task.status !== 'concluida'); }
function dueLabel(task) {
  const due = taskDue(task);
  if (isDeadlinePausedV379(task)) return due ? `Prazo pausado · ${formatDate(due)}` : 'Prazo pausado · Em revisão';
  if (!due) return 'Sem prazo';
  const key = dateKey(due), today = todayKey();
  if (isOverdue(task)) return `Atrasada · ${formatDate(due)}`;
  if (key === today) return `Hoje, ${formatTime(due)}`;
  if (key === dateKey(addDays(new Date(), 1))) return `Amanhã, ${formatTime(due)}`;
  return `${formatDate(due)} · ${formatTime(due)}`;
}
function dueClass(task) { if (isDeadlinePausedV379(task)) return 'paused'; return isOverdue(task) ? 'late' : taskDueKey(task) === todayKey() ? 'today' : ''; }
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
  renderAll();
  window.PMGDemandasWave2 = { client:db, profile:state.me, session:state.session, toast:(message,type)=>toast(message,type) };
  window.dispatchEvent(new CustomEvent('pmg-demandas-ready'));
  setupRealtime(); await updatePushStatus();
  const needsProfile = !state.me.perfil_configurado;
  if (needsProfile) openProfile(true);
  await handleUrlActions();
  if (!needsProfile) setTimeout(() => maybeOpenOnboarding(), 420);
  setTimeout(() => queueUnreadIntrusiveNotifications(), 900);
  setTimeout(() => maybeShowAuthorshipConfirmationV372(), 1250);
  setTimeout(async () => {
    if (state.authorshipReady) return;
    await loadAuthorshipV372();
    if (state.authorshipReady) {
      renderAll();
      maybeShowAuthorshipConfirmationV372();
    }
  }, 2200);
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
  const mine = activeTasks.filter(task => taskHasAssignee(task, state.me?.id));
  $('navTaskCount').textContent = activeTasks.length;
  $('navTodayCount').textContent = mine.filter(task => !isDeadlinePausedV379(task) && taskDueKey(task) === todayKey() || isOverdue(task)).length;
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
  const mine = active.filter(task => taskHasAssignee(task, state.me?.id));
  const overdue = mine.filter(isOverdue);
  const todayTasks = mine.filter(task => !isDeadlinePausedV379(task) && taskDueKey(task) === todayKey());
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
  if (type === 'task') return taskHasAssignee(taskOrReminder, filter);
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
    return taskHasAssignee(task, state.me?.id);
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
    return teamMode ? agendaPersonMatches(task, 'task') : taskHasAssignee(task, state.me?.id);
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
    return `<div class="day-item enriched ${entry.kind === 'task' && entry.item.prioridade === 'imediata' ? 'immediate' : ''}" data-open-${entry.kind === 'task' ? 'task' : 'reminder'}="${entry.id}">${visual}<div class="day-item-main"><div class="day-item-head"><i class="day-item-type ${entry.kind}"></i><small>${formatTime(entry.time)} · ${entry.kind === 'task' ? 'Demanda' : entry.kind === 'meeting' ? 'Compromisso' : 'Lembrete'}</small></div><strong>${escapeHtml(entry.title)}</strong>${entry.kind === 'task' ? `<span>${escapeHtml(taskAssigneeShortNames(entry.item))}</span>${project}` : ''}</div></div>`;
  }).join('') : `<div class="empty-state"><i data-lucide="calendar-x-2"></i>Nenhum item neste dia.</div>`;
}

function filteredTasks() {
  const search = $('taskSearch')?.value.trim().toLowerCase() || '';
  const assignee = $('taskAssigneeFilter')?.value || ''; const project = $('taskProjectFilter')?.value || ''; const priority = $('taskPriorityFilter')?.value || '';
  const archive = $('taskArchiveFilter')?.value || 'ativas'; const now = new Date(); const weekEnd = addDays(now, 7);
  return state.tasks.filter(task => {
    const blob = [task.titulo, task.descricao, ...(task.tags || [])].join(' ').toLowerCase();
    if (search && !blob.includes(search)) return false;
    if (assignee && (assignee === 'none' ? taskAssigneeIds(task).length > 0 : !taskHasAssignee(task, assignee))) return false;
    if (project && String(task.projeto || '') !== project) return false;
    if (priority && task.prioridade !== priority) return false;
    if (archive === 'ativas' && task.arquivada_em) return false;
    if (archive === 'arquivadas' && !task.arquivada_em) return false;
    if (state.smartFilter === 'atrasadas' && !isOverdue(task)) return false;
    if (state.smartFilter === 'hoje' && (isDeadlinePausedV379(task) || taskDueKey(task) !== todayKey())) return false;
    if (state.smartFilter === 'semana') { const due = taskDue(task); if (isDeadlinePausedV379(task) || !due || new Date(due) < now || new Date(due) > weekEnd) return false; }
    if (state.smartFilter === 'minhas' && !taskHasAssignee(task, state.me?.id)) return false;
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
  const countFor = personId => active.filter(task => taskHasAssignee(task, personId)).length;
  const unassigned = active.filter(task => taskAssigneeIds(task).length === 0).length;
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
  const canMove = !task.arquivada_em && (isManager() || taskHasAssignee(task, state.me?.id) || task.criado_por === state.me?.id);
  return `<article class="task-card" data-open-task="${task.id}" data-task-id="${task.id}" data-priority="${task.prioridade}" draggable="${canMove}">
    <div class="task-card-top"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span><span class="size-pill">${SIZE[task.tamanho] || 'Média'}</span>${responsibilityModeBadgeHTMLV371(task)}${task.projeto ? `<span class="project-pill"><i data-lucide="folder-kanban"></i>${escapeHtml(task.projeto)}</span>` : ''}${task.arquivada_em ? '<span class="archived-pill">Arquivada</span>' : ''}<span class="task-card-id">#${task.id.slice(0, 5).toUpperCase()}</span></div>
    <h3>${escapeHtml(task.titulo)}</h3>${task.descricao ? `<p>${escapeHtml(markdownPlainTextV377(task.descricao))}</p>` : ''}
    ${(task.tags || []).length ? `<div class="task-tags">${task.tags.slice(0, 4).map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <div class="task-progress-meta"><span>${task.estimativa_horas ? `${Number(task.estimativa_horas)}h estimadas` : 'Sem estimativa'}</span><span>${STATUS[task.status]?.label}</span></div>
    <div class="task-card-footer"><span class="task-due ${dueClass(task)}"><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span><div class="task-card-person multi">${taskAssigneeAvatarGroupHTML(task, 'sm', 3)}<span>${escapeHtml(taskAssigneeShortNames(task))}</span></div></div>
  </article>`;
}
function renderTaskList() {
  const tasks = filteredTasks();
  $('taskRows').innerHTML = tasks.length ? tasks.map(task => { const person = collaborator(task.responsavel_id); return `<div class="task-row" data-open-task="${task.id}">
    <div class="task-row-title"><i class="priority-line" style="background:${task.prioridade === 'urgente' ? 'var(--red)' : task.prioridade === 'alta' ? 'var(--amber)' : task.prioridade === 'baixa' ? 'var(--blue)' : 'var(--green-300)'}"></i><div><strong>${escapeHtml(task.titulo)}</strong><small>${escapeHtml([task.projeto ? `Projeto: ${task.projeto}` : '', (task.tags || []).join(' · ')].filter(Boolean).join(' · ') || 'Sem projeto ou tags')}</small></div></div>
    <div class="task-row-person multi">${taskAssigneeAvatarGroupHTML(task, 'sm', 3)}<span>${escapeHtml(taskAssigneeShortNames(task))}</span></div><span class="table-pill ${dueClass(task)}">${escapeHtml(dueLabel(task))}</span><span class="table-pill">${STATUS[task.status]?.label}</span><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span></div>`; }).join('')
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
  const assigned = state.tasks.filter(task => !task.arquivada_em && taskHasAssignee(task, person.id));
  const active = assigned.filter(task => task.status !== 'concluida');
  const completed30 = assigned.filter(task => task.status === 'concluida' && isWithinDays(task.concluida_em || task.atualizado_em, 30));
  const completed7 = completed30.filter(task => isWithinDays(task.concluida_em || task.atualizado_em, 7));
  const overdue = active.filter(isOverdue);
  const dueToday = active.filter(task => !isDeadlinePausedV379(task) && taskDueKey(task) === todayKey());
  const weekEnd = addDays(new Date(), 7);
  const dueWeek = active.filter(task => {
    const due = taskDue(task);
    return due && new Date(due) >= new Date() && new Date(due) <= weekEnd;
  });
  const urgent = active.filter(task => ['imediata', 'urgente'].includes(task.prioridade));
  const hours = active.reduce((sum, task) => sum + taskEffortShare(task), 0);
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
  const unassigned = active.filter(task => taskAssigneeIds(task).length === 0);
  let stats = state.collaborators.map(teamPersonStats);
  renderTeamAvatarStrip(stats, manager);

  $('teamPageEyebrow').textContent = manager ? 'Painel gerencial' : 'Colaboração do setor';
  $('teamPageDescription').textContent = manager
    ? 'Acompanhe carga, prioridades, entregas e movimentações de cada pessoa.'
    : 'Veja a disponibilidade estimada do setor e quem está cuidando de cada frente.';
  $('teamUpdatedAt').textContent = `Atualizado ${relativeTime(new Date().toISOString())}`;

  const operationalPeople = state.collaborators.filter(person => person.role !== 'gestor');
  const busyPeople = operationalPeople.filter(person => active.some(task => taskHasAssignee(task, person.id))).length;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const peopleCompletedMonth = operationalPeople.filter(person => state.tasks.some(task => taskHasAssignee(task, person.id) && task.status === 'concluida' && new Date(task.concluida_em || task.atualizado_em) >= monthStart)).length;
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
    $('itemAssignee').value = preset.assigneeId || ''; setAssigneeJson('itemAssigneesJson', preset.assigneeIds || (preset.assigneeId ? [preset.assigneeId] : []));
    if ($('itemProject')) $('itemProject').value = preset.project || '';
    if ($('itemChecklist')) $('itemChecklist').value = '';
    $('itemPriority').value = preset.priority || 'media';
    $('itemSize').value = preset.size || 'media';
    if ($('itemResponsibilityMode')) $('itemResponsibilityMode').value = preset.responsibilityMode || 'compartilhada';
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
  event.preventDefault();
  if (saveQuickItem.inFlight) return;
  saveQuickItem.inFlight = true;
  state.supplierLinkWarningV1B = '';
  setLoading(true);
  const wasEditing = Boolean(state.editingReminderId);
  try {
    if (state.quickType === 'demanda') await createTaskV2();
    else if (state.editingReminderId) await updateReminderV2();
    else await createReminderV2();
    closeModal('quickAddModal'); await Promise.all([loadTasks(), loadReminders(), loadNotifications(), loadActivities()]); renderAll();
    await dispatchPendingPush();
    if (state.supplierLinkWarningV1B) toast(state.supplierLinkWarningV1B, 'error');
    else toast(wasEditing ? 'Item atualizado.' : 'Item criado com sucesso.');
  } catch (error) { console.error(error); toast(errorMessage(error), 'error'); }
  finally {
    saveQuickItem.inFlight = false;
    setLoading(false);
  }
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
  const assigneeIds = selectedFormAssigneeIdsV37('item');
  const responsibilityMode = $('itemResponsibilityMode')?.value || 'compartilhada';
  if (responsibilityMode === 'primeiro_cumprir' && assigneeIds.length < 2) throw new Error('No modo Primeiro a cumprir, selecione pelo menos duas pessoas candidatas.');
  if (priority === 'imediata' && !assigneeIds.length && !alertAll) throw new Error('Escolha pelo menos um responsável para a demanda imediata ou envie o alerta para toda a equipe.');
  const { data: taskId, error } = await db.rpc('criar_tarefa_v4', {
    p_titulo: $('itemTitle').value.trim(), p_descricao: $('itemDescription').value.trim() || null,
    p_prioridade: priority, p_responsavel_id: responsibilityMode === 'primeiro_cumprir' ? null : (assigneeIds[0] || null),
    p_prazo_em: dueAt, p_lembrar_em: remindAt, p_tags: tags,
    p_tamanho: $('itemSize').value, p_estimativa_horas: $('itemEstimate').value ? Number($('itemEstimate').value) : null,
    p_alerta_para_todos: alertAll, p_projeto: $('itemProject')?.value.trim() || null,
    p_checklist: checklist, p_dependencias: dependencies
  });
  if (error) throw error;
  if (taskId && state.multiAssigneeReady) {
    const { error: assigneeError } = await db.rpc('definir_responsaveis_tarefa_modo_v1', {
      p_tarefa_id: taskId,
      p_responsaveis: assigneeIds,
      p_modo: responsibilityMode
    });
    if (assigneeError) throw assigneeError;
  }
  return taskId;
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

/* =========================================================
   PMG CONNECT V3.7.8 — FEEDBACK DE TEMPO DE REVISÃO
   ========================================================= */
function reviewManagerV378(task) {
  if (!task) return null;
  const explicit = collaborator(task.revisao_gestor_responsavel_id);
  if (explicit?.role === 'gestor') return explicit;
  const creator = collaborator(task.criado_por);
  if (creator?.role === 'gestor') return creator;
  const evaluator = collaborator(task.avaliado_por);
  if (evaluator?.role === 'gestor') return evaluator;
  return null;
}

function businessSecondsBetweenV378(startValue, endValue = new Date()) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;

  // Expediente usado no feedback: segunda a sexta, 08:00–18:00.
  // Feriados não são descontados nesta versão.
  let total = 0;
  const cursor = new Date(start);
  cursor.setHours(0,0,0,0);
  const lastDay = new Date(end);
  lastDay.setHours(0,0,0,0);

  while (cursor <= lastDay) {
    const weekday = cursor.getDay();
    if (weekday >= 1 && weekday <= 5) {
      const workStart = new Date(cursor);
      workStart.setHours(8,0,0,0);
      const workEnd = new Date(cursor);
      workEnd.setHours(18,0,0,0);

      const segmentStart = new Date(Math.max(start.getTime(), workStart.getTime()));
      const segmentEnd = new Date(Math.min(end.getTime(), workEnd.getTime()));
      if (segmentEnd > segmentStart) total += Math.floor((segmentEnd - segmentStart) / 1000);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(0, total);
}

function durationLabelV378(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(value / 36000); // 10h úteis por dia
  const hours = Math.floor((value % 36000) / 3600);
  const minutes = Math.floor((value % 3600) / 60);

  if (days > 0) return `${days}d útil${days === 1 ? '' : 'eis'}${hours ? ` ${hours}h` : ''}`;
  if (hours > 0) return `${hours}h${minutes ? ` ${minutes}min` : ''}`;
  return `${Math.max(0, minutes)}min`;
}

function elapsedClockLabelV378(startValue, endValue = new Date()) {
  const start = new Date(startValue), end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  return durationLabelV378(Math.floor(Math.max(0, end - start) / 1000));
}

function currentReviewBusinessSecondsV378(task) {
  if (!task || task.status !== 'revisao') return 0;
  const started = task.revisao_iniciada_em || task.atualizado_em;
  return businessSecondsBetweenV378(started, new Date());
}

function lastReviewBusinessSecondsV378(task) {
  if (!task) return 0;
  if (task.revisao_ultima_iniciada_em && task.revisao_ultima_finalizada_em) {
    return businessSecondsBetweenV378(task.revisao_ultima_iniciada_em, task.revisao_ultima_finalizada_em);
  }
  return Number(task.revisao_ultima_duracao_segundos || 0);
}

function reviewFeedbackPanelV378(task) {
  if (!task) return '';
  const manager = reviewManagerV378(task);
  const managerName = manager?.nome || 'Gestor responsável';

  if (task.status === 'revisao') {
    const started = task.revisao_iniciada_em || task.atualizado_em;
    const useful = currentReviewBusinessSecondsV378(task);
    const usefulLabel = durationLabelV378(useful);
    const clockLabel = elapsedClockLabelV378(started, new Date());
    const mine = Boolean(manager && state.me?.id === manager.id);

    let title;
    let text;
    if (mine) {
      title = `Esta revisão está com você há ${usefulLabel}`;
      text = 'O colaborador já entregou a demanda e o tempo de execução dele está parado enquanto aguarda sua validação.';
    } else if (manager) {
      title = `${firstName(managerName)} está com esta demanda para revisar há ${usefulLabel}`;
      text = isManager()
        ? `Gestor responsável pela revisão: ${managerName}.`
        : `Sua entrega está aguardando a validação de ${managerName}.`;
    } else {
      title = `Esta demanda está aguardando revisão há ${usefulLabel}`;
      text = 'Ainda não foi possível identificar um gestor responsável específico para esta revisão.';
    }

    return `<section class="review-time-feedback-v378 waiting">
      <span class="review-time-icon-v378"><i data-lucide="${mine ? 'timer' : 'hourglass'}"></i></span>
      <div class="review-time-copy-v378">
        <span class="eyebrow">Tempo de revisão</span>
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(text)}</small>
        <div class="review-time-meta-v378">
          <span><i data-lucide="briefcase-business"></i>${escapeHtml(usefulLabel)} de expediente</span>
          <span title="Tempo corrido desde o envio"><i data-lucide="clock-3"></i>${escapeHtml(clockLabel)} corridos</span>
          ${task.revisao_quantidade ? `<span><i data-lucide="repeat-2"></i>${Number(task.revisao_quantidade)}ª passagem em revisão</span>` : ''}
        </div>
      </div>
      <b>AGUARDANDO</b>
    </section>`;
  }

  if (task.revisao_ultima_finalizada_em && task.revisao_ultima_iniciada_em) {
    const seconds = lastReviewBusinessSecondsV378(task);
    const label = durationLabelV378(seconds);
    const clockLabel = elapsedClockLabelV378(task.revisao_ultima_iniciada_em, task.revisao_ultima_finalizada_em);
    const reviewer = collaborator(task.avaliado_por) || manager;
    const reviewerName = reviewer?.nome || managerName;
    const outcome = task.avaliacao_status === 'ajustes'
      ? 'devolveu a demanda para ajustes'
      : task.avaliacao_status === 'aprovada'
        ? 'aprovou a conclusão'
        : 'encerrou a revisão';

    return `<section class="review-time-feedback-v378 finished">
      <span class="review-time-icon-v378"><i data-lucide="history"></i></span>
      <div class="review-time-copy-v378">
        <span class="eyebrow">Feedback da última revisão</span>
        <strong>${escapeHtml(reviewerName)} ${escapeHtml(outcome)} após ${escapeHtml(label)} de expediente.</strong>
        <small>Esse tempo fica registrado para separar tempo de execução do colaborador e tempo aguardando validação da gestão.</small>
        <div class="review-time-meta-v378">
          <span><i data-lucide="briefcase-business"></i>${escapeHtml(label)} úteis</span>
          <span><i data-lucide="clock-3"></i>${escapeHtml(clockLabel)} corridos</span>
          ${task.revisao_total_segundos != null ? `<span><i data-lucide="sigma"></i>${escapeHtml(durationLabelV378(Number(task.revisao_total_segundos || 0)))} corridos acumulados</span>` : ''}
        </div>
      </div>
      <b>REGISTRADO</b>
    </section>`;
  }

  return '';
}

function reviewAlertTextV378(task) {
  const manager = reviewManagerV378(task);
  const elapsed = durationLabelV378(currentReviewBusinessSecondsV378(task));
  if (manager?.id === state.me?.id) return `Aguardando sua revisão há ${elapsed} de expediente`;
  return manager ? `Aguardando ${firstName(manager.nome)} há ${elapsed} de expediente` : `Aguardando revisão há ${elapsed} de expediente`;
}

function renderTaskDrawer() {
  const task = state.selectedTask; if (!task) return;
  const person = collaborator(task.responsavel_id);
  const responsiblePeople = taskAssigneePeople(task);
  const creator = collaborator(task.criado_por);
  const evaluator = collaborator(task.avaliado_por);
  const personStats = person ? assigneeStats(person) : null;
  $('taskDrawerKicker').textContent = `Demanda #${task.id.slice(0, 5).toUpperCase()}`; $('taskDrawerTitle').textContent = task.titulo;
  const canClaimImmediate = taskAssigneeIds(task).length === 0 && task.prioridade === 'imediata' && task.alerta_para_todos && task.status === 'nova';
  const canClaimRace = taskRaceIsOpenV371(task) && taskHasAssignee(task, state.me.id);
  const canClaimTask = canClaimImmediate || canClaimRace;
  const canChangeStatus = isManager() || taskHasAssignee(task, state.me.id) || canClaimImmediate;
  const nextAction = statusActionForTask(task);
  const canAssign = isManager() && !task.arquivada_em && task.status !== 'concluida';
  const immediate = task.prioridade === 'imediata';
  const evaluationPending = task.status === 'revisao';
  const evaluationFeedback = task.avaliacao_status === 'ajustes' && task.avaliacao_observacao;
  const evaluationApproved = task.avaliacao_status === 'aprovada';
  const reviewTimePanel = reviewFeedbackPanelV378(task);
  const reviewDeadlinePausePanel = isDeadlinePausedV379(task) ? `<section class="review-deadline-pause-v379"><span><i data-lucide="pause"></i></span><div><span class="eyebrow">Prazo congelado</span><strong>Esta demanda não está atrasada enquanto aguarda revisão.</strong><small>${taskDue(task) ? `Prazo original: ${escapeHtml(formatDate(taskDue(task)))}. ` : ''}Se o gestor devolver para ajustes, o sistema devolve ao prazo exatamente o período que ficou em revisão.</small></div><b>PAUSADO</b></section>` : '';

  const evaluationPanel = evaluationPanelHTMLV372(task, evaluator);

  const nextActionMarkup = canChangeStatus && !task.arquivada_em && nextAction
    ? `<button id="drawerNextStatusBtn" type="button" class="status-primary-action ${task.status} ${nextAction.next === '__avaliar__' ? 'evaluation' : ''}" data-next-status="${nextAction.next}"><i data-lucide="${nextAction.icon}"></i><span><strong>${canClaimTask ? 'Assumir e iniciar agora' : nextAction.label}</strong><small>${canClaimRace ? 'Você está entre os candidatos. Quem iniciar primeiro assume esta demanda sozinho.' : canClaimImmediate ? 'Ao iniciar, esta demanda passa a ficar sob sua responsabilidade.' : nextAction.next === '__avaliar__' ? 'Revise o material e decida se pode ser encerrado' : STATUS_HELP[nextAction.next]}</small></span><i data-lucide="arrow-right"></i></button>`
    : evaluationPending && !isManager()
      ? `<div class="status-waiting-note"><i data-lucide="clock-3"></i><span><strong>Aguardando avaliação</strong><small>Você não precisa alterar o status enquanto o gestor revisa.</small></span></div>`
      : '';

  const raceOpen = taskRaceIsOpenV371(task);
  const raceClaimed = taskIsFirstToCompleteV371(task) && Boolean(task.responsavel_id);
  const raceWinner = raceClaimed ? collaborator(task.responsavel_id) : null;

  $('taskDrawerContent').innerHTML = `
    ${taskIsFirstToCompleteV371(task) ? `<div class="task-race-banner ${raceClaimed ? 'claimed' : ''}"><span><i data-lucide="${raceClaimed ? 'flag-triangle-right' : 'flag'}"></i></span><div><strong>${raceClaimed ? `Demanda assumida por ${escapeHtml(raceWinner?.nome || 'um responsável')}` : 'PRIMEIRO A CUMPRIR'}</strong><small>${raceClaimed ? 'A corrida terminou. A carga completa e a execução desta ocorrência ficaram com quem iniciou primeiro.' : `${taskAssigneeIds(task).length} candidato${taskAssigneeIds(task).length === 1 ? '' : 's'} pode${taskAssigneeIds(task).length === 1 ? '' : 'm'} assumir. O primeiro a clicar em Iniciar fica com a tarefa e os demais deixam de ser responsáveis por esta ocorrência.`}</small></div><b>${raceClaimed ? 'ASSUMIDA' : 'EM DISPUTA'}</b></div>` : ''}
    ${immediate ? `<div class="task-immediate-strip"><span class="task-immediate-siren"><i data-lucide="siren"></i></span><div><strong>DEMANDA IMEDIATA</strong><span>Este item deve interromper as prioridades normais e ser tratado agora.${task.alerta_para_todos ? ' O alerta foi enviado para toda a equipe.' : ''}</span></div><span class="task-immediate-pulse">AGORA</span></div>` : ''}
    <section class="task-overview-hero ${immediate ? 'immediate' : ''}">
      <div class="task-people-flow">
        <div class="task-person-identity"><span>${avatarHTML(creator, 'md')}</span><div><small>Criada por</small><strong>${escapeHtml(creator?.nome || 'Sistema')}</strong></div></div>
        <i data-lucide="arrow-right"></i>
        <div class="task-person-identity assigned multi"><span>${taskAssigneeAvatarGroupHTML(task, 'md', 4)}</span><div><small>Responsáveis</small><strong>${escapeHtml(taskAssigneeNames(task))}</strong></div></div>
      </div>
      <div class="task-overview-meta"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span><span class="size-pill">${SIZE[task.tamanho] || 'Média'}</span>${task.alerta_para_todos ? '<span class="team-alert-pill"><i data-lucide="users-round"></i>Alerta para toda a equipe</span>' : ''}<span class="task-overview-due ${dueClass(task)}"><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span></div>
      <div class="markdown-body-v377 markdown-body-inverse-v377">${renderMarkdownV377(task.descricao || 'Esta demanda ainda não possui descrição.')}</div>
      ${(task.tags || []).length ? `<div class="detail-tags">${task.tags.map(tag => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    </section>

    ${reviewDeadlinePausePanel}
    ${reviewTimePanel}
    ${evaluationPanel}

    <section class="task-status-section">
      <div class="task-section-heading"><div><span class="eyebrow">Fluxo</span><h3>Status da demanda</h3></div><span class="current-status-label ${task.status}"><i data-lucide="${STATUS[task.status]?.icon || 'circle-dot'}"></i>${STATUS[task.status]?.label || task.status}</span></div>
      <div class="status-flow">${statusFlowHTML(task, canChangeStatus)}</div>
      ${nextActionMarkup}
    </section>

    <section class="task-assignee-section">
      <div class="task-section-heading"><div><span class="eyebrow">${taskIsFirstToCompleteV371(task) ? (raceClaimed ? 'Primeiro a cumprir · assumida' : 'Primeiro a cumprir') : 'Responsabilidade compartilhada'}</span><h3>${taskIsFirstToCompleteV371(task) ? (raceClaimed ? 'Quem assumiu esta demanda' : 'Quem pode assumir esta demanda') : 'Quem está com esta demanda'}</h3></div>${canAssign ? `<span class="section-hint">${taskIsFirstToCompleteV371(task) ? 'Candidatos podem ser alterados antes do início' : 'Uma demanda pode ter várias pessoas'}</span>` : ''}</div>
      <button id="drawerAssigneePickerBtn" type="button" class="drawer-assignee-card multi ${canAssign && (!taskIsFirstToCompleteV371(task) || task.status === 'nova') ? 'editable' : ''}" ${canAssign && (!taskIsFirstToCompleteV371(task) || task.status === 'nova') ? '' : 'disabled'}>
        <span class="drawer-assignee-avatar">${taskAssigneeAvatarGroupHTML(task, 'lg', 4)}</span>
        <span class="drawer-assignee-copy"><strong>${escapeHtml(taskAssigneeNames(task))}</strong><small>${taskIsFirstToCompleteV371(task) ? (raceClaimed ? 'Responsável vencedor da ocorrência' : `${responsiblePeople.length} candidato${responsiblePeople.length === 1 ? '' : 's'} disponível${responsiblePeople.length === 1 ? '' : 'is'}`) : responsiblePeople.length ? `${responsiblePeople.length} responsável${responsiblePeople.length === 1 ? '' : 'is'} · ${escapeHtml(person?.nome || responsiblePeople[0]?.nome || '')} é a referência principal` : 'Aguardando atribuição'}</small><em>${taskIsFirstToCompleteV371(task) ? (raceClaimed ? 'Somente quem assumiu fica responsável pela execução e recebe a carga completa desta ocorrência.' : 'Todos os candidatos enxergam a demanda; quem iniciar primeiro assume e remove a tarefa da fila dos demais.') : responsiblePeople.length ? 'Todos os responsáveis podem movimentar a demanda e recebem os alertas relacionados ao trabalho.' : 'A demanda ainda não possui responsáveis.'}</em></span>
        ${canAssign && (!taskIsFirstToCompleteV371(task) || task.status === 'nova') ? '<span class="drawer-assignee-change"><span>Gerenciar pessoas</span><i data-lucide="users-round"></i></span>' : ''}
      </button>
      ${responsiblePeople.length ? `<div class="drawer-assignee-team-list">${responsiblePeople.map((member,index) => `<div class="drawer-assignee-team-row">${avatarHTML(member,'sm')}<span><strong>${escapeHtml(member.nome)}</strong><small>${taskIsFirstToCompleteV371(task) ? (raceClaimed ? 'Responsável da ocorrência' : 'Candidato · quem iniciar primeiro assume') : `${index === 0 ? 'Responsável principal' : 'Corresponsável'} · ${escapeHtml(member.cargo || 'Marketing')}`}</small></span>${taskIsFirstToCompleteV371(task) ? `<b>${raceClaimed ? 'Assumiu' : 'Candidato'}</b>` : index === 0 ? '<b>Principal</b>' : '<b>Equipe</b>'}</div>`).join('')}</div>` : ''}
    </section>

    ${isManager() && !task.arquivada_em && task.status !== 'concluida' ? `
    <section class="task-manager-priority-section ${task.prioridade}">
      <div class="task-section-heading">
        <div><span class="eyebrow">Gestão</span><h3>Urgência da demanda</h3></div>
        <span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span>
      </div>
      <div class="task-manager-priority-body">
        <span class="task-manager-priority-icon"><i data-lucide="${task.prioridade === 'imediata' ? 'alarm-smoke' : task.prioridade === 'urgente' ? 'siren' : task.prioridade === 'alta' ? 'arrow-up' : task.prioridade === 'baixa' ? 'feather' : 'circle-dot'}"></i></span>
        <div>
          <strong>${task.prioridade === 'imediata' ? 'Precisa ser tratada agora' : task.prioridade === 'urgente' ? 'Resposta rápida necessária' : task.prioridade === 'alta' ? 'Demanda com atenção elevada' : task.prioridade === 'baixa' ? 'Pode aguardar no fluxo' : 'Fluxo normal de trabalho'}</strong>
          <small>Somente gestores podem mudar este nível.</small>
        </div>
        <button id="drawerPriorityManagerBtn" type="button" class="btn secondary"><i data-lucide="gauge"></i>Alterar urgência</button>
      </div>
    </section>` : ''}

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
  return state.comments.length ? state.comments.map(comment => `<div class="comment">${activityAvatarHTML(comment.colaborador, 'comentario', 'sm')}<div class="comment-bubble"><div class="comment-meta"><strong>${escapeHtml(comment.colaborador?.nome || 'Colaborador')}</strong><span>${formatDateTime(comment.criado_em)}</span></div><div class="markdown-body-v377 comment-markdown-v377">${renderMarkdownV377(comment.texto)}</div></div></div>`).join('') : `<div class="empty-state">Sem comentários ainda.</div>`;
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
      const result = activity.detalhes?.resultado;
      const approved = ['aprovada','aprovada_com_autoria'].includes(result);
      if (result === 'aguardando_confirmacao_autoria') {
        text = 'validou a entrega e solicitou confirmação de autoria';
        const ids = activity.detalhes?.executores || [];
        const names = ids.map(id => collaborator(id)?.nome).filter(Boolean).map(firstName);
        detail = names.length ? `Executores propostos: ${escapeHtml(names.join(', '))}` : 'Aguardando confirmação dos executores.';
      } else if (result === 'autoria_contestada') {
        text = 'registrou uma contestação de autoria';
        detail = escapeHtml(activity.detalhes?.observacao || 'A autoria precisa ser revista.');
      } else {
        text = approved ? 'aprovou a conclusão' : 'devolveu a demanda para ajustes';
        detail = activity.detalhes?.observacao ? escapeHtml(activity.detalhes.observacao) : (approved ? 'Entrega validada.' : 'Ajustes solicitados.');
      }
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
  $('drawerReviewAuthorshipBtn')?.addEventListener('click', () => openTaskEvaluation(state.selectedTask.id));
  $('drawerConfirmAuthorshipBtn')?.addEventListener('click', () => {
    const pending = myPendingAuthorshipConfirmationsV372().find(row => {
      const review = (state.authorshipReviews || []).find(item => item.id === row.revisao_id);
      return review?.tarefa_id === state.selectedTask.id;
    });
    if (pending) openAuthorshipConfirmationV372(pending);
  });
  $('drawerAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ taskId: state.selectedTask.id, multi: true, title: 'Gerenciar responsáveis' }));
  $('drawerPriorityManagerBtn')?.addEventListener('click', () => openPriorityManager(state.selectedTask.id));
  $('transferTaskBtn')?.addEventListener('click', () => openTransferTask(state.selectedTask.id));
  $('drawerCommentForm')?.addEventListener('submit', addComment);
  $('editTaskBtn')?.addEventListener('click', openEditTask);
  $('archiveTaskBtn')?.addEventListener('click', archiveTask);
  $('restoreTaskBtn')?.addEventListener('click', restoreTask);
}

function syncPriorityManagerUI() {
  const priority = $('priorityManagerValue')?.value || 'media';

  $$('[data-manager-priority]').forEach(button => {
    const selected = button.dataset.managerPriority === priority;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-checked', String(selected));
  });

  $('priorityManagerImmediateOptions')?.classList.toggle('hidden', priority !== 'imediata');

  const save = $('priorityManagerSaveBtn');
  if (save) {
    save.classList.toggle('danger-priority', priority === 'imediata');
    save.innerHTML = priority === 'imediata'
      ? '<i data-lucide="siren"></i>Aplicar urgência imediata'
      : '<i data-lucide="save"></i>Salvar urgência';
  }

  refreshIcons();
}

function openPriorityManager(taskId = state.selectedTask?.id) {
  if (!isManager()) return toast('Somente gestores podem alterar a urgência da demanda.', 'error');

  const task = state.tasks.find(item => item.id === taskId) || (state.selectedTask?.id === taskId ? state.selectedTask : null);
  if (!task) return toast('Demanda não encontrada.', 'error');
  if (task.arquivada_em) return toast('Restaure a demanda antes de alterar a urgência.', 'error');
  if (task.status === 'concluida') return toast('Demandas concluídas não precisam ter a urgência alterada.', 'error');

  $('priorityManagerTaskId').value = task.id;
  $('priorityManagerValue').value = task.prioridade || 'media';
  $('priorityManagerTaskTitle').textContent = task.titulo;
  $('priorityManagerCurrentLabel').textContent = `Urgência atual: ${PRIORITY[task.prioridade] || 'Média'}`;
  $('priorityManagerAlertAll').checked = Boolean(task.prioridade === 'imediata' && task.alerta_para_todos);
  $('priorityManagerApplySeries').checked = false;

  const recurring = Boolean(task.recorrencia_id);
  $('priorityManagerRecurrenceScope').classList.toggle('hidden', !recurring);

  syncPriorityManagerUI();
  $('priorityManagerModal').classList.remove('hidden');
  refreshIcons();
}

async function saveManagedPriority(event) {
  event.preventDefault();

  if (!isManager()) return toast('Somente gestores podem alterar a urgência.', 'error');

  const taskId = $('priorityManagerTaskId').value;
  const priority = $('priorityManagerValue').value;
  const task = state.tasks.find(item => item.id === taskId) || (state.selectedTask?.id === taskId ? state.selectedTask : null);
  if (!task) return toast('Demanda não encontrada.', 'error');

  const alertAll = priority === 'imediata' && Boolean($('priorityManagerAlertAll').checked);
  const applySeries = Boolean(task.recorrencia_id && $('priorityManagerApplySeries').checked);

  if (priority === 'imediata' && !task.responsavel_id && !alertAll) {
    return toast('Esta demanda não tem responsável. Para torná-la IMEDIATA, ative o alerta para toda a equipe ou atribua alguém primeiro.', 'error');
  }

  setLoading(true);
  try {
    const { data, error } = await db.rpc('alterar_urgencia_tarefa_v1', {
      p_tarefa_id: taskId,
      p_prioridade: priority,
      p_alerta_para_todos: alertAll,
      p_aplicar_recorrencia: applySeries
    });
    if (error) throw error;

    closeModal('priorityManagerModal');
    await refreshData();
    await openTask(taskId);
    await dispatchPendingPush();

    const suffix = applySeries ? ' e nas próximas ocorrências.' : '.';
    toast(`Urgência alterada para ${PRIORITY[priority] || priority}${suffix}`);
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    setLoading(false);
  }
}

function openEditTask() {
  const task = state.selectedTask; if (!task) return; const due = splitDateTime(taskDue(task));
  $('editTaskId').value = task.id; $('editTaskTitle').value = task.titulo; $('editTaskDescription').value = task.descricao || '';
  populateAssigneeSelects(); const editAssigneeIds = taskAssigneeIds(task); $('editTaskAssignee').value = editAssigneeIds[0] || ''; setAssigneeJson('editTaskAssigneesJson', editAssigneeIds); $('editTaskAssignee').dataset.originalValue = task.responsavel_id || ''; $('editTaskPriority').value = task.prioridade;
  if ($('editTaskResponsibilityMode')) {
    $('editTaskResponsibilityMode').value = taskResponsibilityModeV371(task);
    const locked = task.status !== 'nova';
    $$('[data-choice-target="editTaskResponsibilityMode"]').forEach(button => button.disabled = locked);
    $('editTaskResponsibilityLock')?.classList.toggle('hidden', !locked);
  }
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
    const desiredAssignees = selectedFormAssigneeIdsV37('editTask');
    const desiredAssignee = desiredAssignees[0] || '';
    const originalTask = state.tasks.find(item => item.id === taskId);
    const currentResponsibilityMode = taskResponsibilityModeV371(originalTask);
    const desiredResponsibilityMode = $('editTaskResponsibilityMode')?.value || currentResponsibilityMode;
    if (originalTask?.status !== 'nova' && desiredResponsibilityMode !== currentResponsibilityMode) throw new Error('O modo de responsabilidade só pode ser trocado antes da execução começar.');
    if (originalTask?.status === 'nova' && desiredResponsibilityMode === 'primeiro_cumprir' && desiredAssignees.length < 2) throw new Error('No modo Primeiro a cumprir, selecione pelo menos duas pessoas candidatas.');
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
    if (state.multiAssigneeReady) {
      if (originalTask?.status === 'nova') {
        const { error: assigneeError } = await db.rpc('definir_responsaveis_tarefa_modo_v1', {
          p_tarefa_id: taskId,
          p_responsaveis: desiredAssignees,
          p_modo: desiredResponsibilityMode
        });
        if (assigneeError) throw assigneeError;
      } else if (currentResponsibilityMode === 'compartilhada') {
        const { error: assigneeError } = await db.rpc('definir_responsaveis_tarefa_v1', { p_tarefa_id: taskId, p_responsaveis: desiredAssignees });
        if (assigneeError) throw assigneeError;
      }
    } else if (desiredAssignee !== originalAssignee) {
      if (!desiredAssignee) throw new Error('Selecione pelo menos um responsável para a demanda.');
      const { error: transferError } = await db.rpc('transferir_tarefa', { p_tarefa_id: taskId, p_novo_responsavel_id: desiredAssignee, p_observacao: 'Responsável principal alterado durante a edição da demanda.' });
      if (transferError) throw transferError;
    }
    const supplierLinked = await linkSupplierToTaskV1B(taskId, $('editTaskSupplier')?.value || null);
    closeModal('editTaskModal'); await refreshData(); await openTask(taskId); await dispatchPendingPush();
    toast(supplierLinked ? 'Demanda atualizada.' : 'Demanda atualizada, mas o vínculo com fornecedor não pôde ser salvo.', supplierLinked ? undefined : 'error');
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
  if (isManager() && !managerPopupRelationshipV374(notification)) return;
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
  if ($('authorshipConfirmationModal') && !$('authorshipConfirmationModal').classList.contains('hidden')) return;

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


function managerPopupRelationshipV374(notification) {
  // A regra abaixo vale APENAS para gestores.
  // Colaboradores continuam recebendo alertas destinados a eles normalmente.
  if (!isManager()) return true;
  if (!notification || !state.me) return false;

  const meId = state.me.id;

  // Confirmação de autoria possui fluxo próprio e só existe quando este
  // gestor foi explicitamente escolhido como executor.
  if (String(notification.chave_deduplicacao || '').startsWith('autoria-confirmar')) {
    return (state.authorshipConfirmations || []).some(row =>
      row.colaborador_id === meId &&
      row.resposta === 'pendente' &&
      String(notification.chave_deduplicacao || '').includes(row.revisao_id)
    );
  }

  if (notification.tarefa_id) {
    const task = state.tasks.find(item => item.id === notification.tarefa_id);
    if (!task) return false; // para gestor, falha fechada: sem contexto, sem popup.

    const createdByMe = task.criado_por === meId;
    const assignedToMe = taskHasAssignee(task, meId);
    const finalExecutor = taskFinalExecutorIdsV372(task).includes(meId);
    const reviewedByMe = task.avaliado_por === meId;

    // Gestor só recebe overlay se realmente tiver vínculo com a demanda.
    return createdByMe || assignedToMe || finalExecutor || reviewedByMe;
  }

  if (notification.lembrete_id) {
    const reminder = state.reminders.find(item => item.id === notification.lembrete_id);
    if (!reminder) return false;
    return reminder.colaborador_id === meId || reminder.criado_por === meId;
  }

  // Notificações genéricas/broadcast sem uma demanda ou lembrete associado
  // continuam disponíveis na Central de Notificações, mas não sequestram
  // a tela do gestor com popup.
  return false;
}

function shouldShowIntrusivePopupV374(notification) {
  if (!notification || notification.lida) return false;
  if (!['critica','importante'].includes(notificationLevel(notification))) return false;
  return managerPopupRelationshipV374(notification);
}

function enqueueIntrusiveNotification(notification) {
  if (!notification?.id || notification.lida || intrusiveWasDismissed(notification.id)) return;
  if (!shouldShowIntrusivePopupV374(notification)) return;
  // A confirmação de autoria possui um popup próprio com Confirmar/Contestar.
  // Mantemos a notificação na central/push, mas evitamos dois overlays concorrentes.
  if (String(notification.chave_deduplicacao || '').startsWith('autoria-confirmar:')) {
    setTimeout(async () => { await loadAuthorshipV372(); maybeShowAuthorshipConfirmationV372(); }, 120);
    return;
  }
  if (!['critica','importante'].includes(notificationLevel(notification))) return;
  if (state.intrusiveActive?.id === notification.id || state.intrusiveShownIds.has(notification.id) || state.intrusiveQueue.some(item => item.id === notification.id)) return;
  state.intrusiveQueue.push(notification);
  maybeShowNextIntrusiveNotification();
}

function queueUnreadIntrusiveNotifications() {
  if (state.intrusiveBootstrapped) return;
  state.intrusiveBootstrapped = true;
  state.notifications.filter(item => shouldShowIntrusivePopupV374(item)).slice(0, 20).forEach(enqueueIntrusiveNotification);
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'demandas_recorrentes' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'demandas_recorrentes_ocorrencias' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefa_responsaveis' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'demanda_recorrente_responsaveis' }, refreshDebounced)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefa_autoria_revisoes' }, async () => {
      await loadAuthorshipV372(); renderAll(); setTimeout(maybeShowAuthorshipConfirmationV372, 180); refreshIcons();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefa_autoria_confirmacoes' }, async () => {
      await loadAuthorshipV372(); renderAll(); setTimeout(maybeShowAuthorshipConfirmationV372, 180); refreshIcons();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tarefa_executores' }, refreshDebounced)
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
  await loadAll(); renderAll(); refreshIcons(); setTimeout(maybeShowAuthorshipConfirmationV372, 180);
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
function taskSearchResultHTML(task) { return `<button class="search-result task-search-result" data-search-task="${task.id}"><span class="search-result-avatar multi">${taskAssigneeAvatarGroupHTML(task, 'sm', 3)}</span><span class="search-result-copy"><strong>${escapeHtml(task.titulo)}</strong><span>${task.projeto ? `${escapeHtml(task.projeto)} · ` : ''}${escapeHtml(taskAssigneeShortNames(task))} · ${escapeHtml(STATUS[task.status]?.label || task.status)} · ${escapeHtml(dueLabel(task))}</span></span><i data-lucide="arrow-up-right"></i></button>`; }
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
   PMG CONNECT V3.7.2 — AUTORIA DA ENTREGA
   ========================================================= */
function isMissingAuthorshipSchemaV372(error) {
  const text = String(error?.message || error?.details || error || '');
  const code = String(error?.code || '');
  return ['PGRST202','PGRST205','42P01','42883'].includes(code)
    || /could not find the function|does not exist|schema cache/i.test(text);
}
function authorshipSnapshotMissingV385(error) {
  const text = String(error?.message || error?.details || error || '');
  const code = String(error?.code || '');
  return ['PGRST202','42883'].includes(code)
    || (/pmg_autoria_snapshot_v385/i.test(text) && /could not find|does not exist|schema cache/i.test(text));
}
function applyAuthorshipSnapshotV385(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  state.authorshipReviews = Array.isArray(data.revisoes) ? data.revisoes : [];
  state.authorshipConfirmations = Array.isArray(data.confirmacoes) ? data.confirmacoes : [];
  state.taskExecutors = Array.isArray(data.executores) ? data.executores : [];
  state.authorshipReady = Boolean(data.ok !== false);
  state.authorshipBackendVersionV385 = String(data.versao || '3.8.5');
  state.authorshipLastErrorV385 = null;
}
async function loadAuthorshipV372() {
  state.authorshipLastErrorV385 = null;

  // V3.8.5: fonte preferencial. O snapshot é SECURITY DEFINER e não depende
  // dos SELECTs diretos do navegador, que eram a origem dos falsos avisos de
  // "execute o SQL" mesmo quando as tabelas já existiam no Supabase.
  try {
    const snapshot = await db.rpc('pmg_autoria_snapshot_v385');
    if (!snapshot.error && snapshot.data && snapshot.data.ok !== false) {
      applyAuthorshipSnapshotV385(snapshot.data);
      return;
    }
    if (snapshot.error && !authorshipSnapshotMissingV385(snapshot.error)) {
      console.warn('[autoria V3.8.5 snapshot]', snapshot.error);
    }
  } catch (snapshotError) {
    if (!authorshipSnapshotMissingV385(snapshotError)) console.warn('[autoria V3.8.5 snapshot]', snapshotError);
  }

  // Compatibilidade com bancos que já receberam o SQL 15, mas ainda não o 16.
  // Se isso funcionar, o módulo segue disponível e não bloqueia o usuário.
  try {
    const [reviewResult, confirmationResult, executorResult] = await Promise.all([
      db.from('tarefa_autoria_revisoes').select('*').order('criado_em', { ascending:false }).limit(1800),
      db.from('tarefa_autoria_confirmacoes').select('*').order('criado_em', { ascending:false }).limit(5000),
      db.from('tarefa_executores').select('*').order('confirmado_em', { ascending:false }).limit(5000)
    ]);
    const error = reviewResult.error || confirmationResult.error || executorResult.error;
    if (error) throw error;
    state.authorshipReviews = reviewResult.data || [];
    state.authorshipConfirmations = confirmationResult.data || [];
    state.taskExecutors = executorResult.data || [];
    state.authorshipReady = true;
    state.authorshipBackendVersionV385 = 'compat-15';
    return;
  } catch (error) {
    state.authorshipReviews = [];
    state.authorshipConfirmations = [];
    state.taskExecutors = [];
    state.authorshipReady = false;
    state.authorshipLastErrorV385 = error;
    console.warn('[autoria V3.8.5 indisponível]', error);
  }
}
function taskFinalExecutorIdsV372(taskOrId) {
  const taskId = typeof taskOrId === 'string' ? taskOrId : taskOrId?.id;
  if (!taskId) return [];
  return uniqueIdsV37((state.taskExecutors || []).filter(row => row.tarefa_id === taskId).map(row => row.colaborador_id));
}
function taskFinalExecutorsV372(taskOrId) {
  return taskFinalExecutorIdsV372(taskOrId).map(collaborator).filter(Boolean);
}
function taskAuthorshipReviewV372(taskId) {
  return (state.authorshipReviews || [])
    .filter(row => row.tarefa_id === taskId)
    .sort((a,b) => new Date(b.criado_em || 0) - new Date(a.criado_em || 0))[0] || null;
}
function authorshipReviewConfirmationsV372(reviewId) {
  return (state.authorshipConfirmations || [])
    .filter(row => row.revisao_id === reviewId)
    .sort((a,b) => String(a.criado_em || '').localeCompare(String(b.criado_em || '')));
}
function myPendingAuthorshipConfirmationsV372() {
  if (!state.me) return [];
  const activeReviewIds = new Set((state.authorshipReviews || []).filter(row => row.status === 'aguardando').map(row => row.id));
  return (state.authorshipConfirmations || [])
    .filter(row => row.colaborador_id === state.me.id && row.resposta === 'pendente' && activeReviewIds.has(row.revisao_id))
    .sort((a,b) => new Date(a.criado_em || 0) - new Date(b.criado_em || 0));
}
function taskTimeMinutesByPersonV372(taskId, personId) {
  return (state.timeEntries || [])
    .filter(entry => entry.tarefa_id === taskId && entry.colaborador_id === personId)
    .reduce((sum, entry) => {
      const start = new Date(entry.inicio_em).getTime();
      const end = new Date(entry.fim_em || Date.now()).getTime();
      return sum + Math.max(0, Math.round((end - start) / 60000));
    }, 0);
}
function formatMinutesV372(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  if (!value) return 'Sem tempo registrado';
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return hours ? `${hours}h${mins ? ` ${mins}min` : ''} registrados` : `${mins}min registrados`;
}
function suggestedExecutorIdsV372(task) {
  const timed = uniqueIdsV37((state.timeEntries || []).filter(entry => entry.tarefa_id === task.id && entry.colaborador_id).map(entry => entry.colaborador_id));
  if (timed.length) return timed;
  const lastReview = taskAuthorshipReviewV372(task.id);
  if (lastReview) {
    const previous = authorshipReviewConfirmationsV372(lastReview.id).map(row => row.colaborador_id);
    if (previous.length) return uniqueIdsV37(previous);
  }
  return taskAssigneeIds(task);
}
function renderEvaluationExecutorsV372() {
  const task = state.tasks.find(item => item.id === $('evaluationTaskId')?.value);
  const list = $('evaluationExecutorList');
  if (!task || !list) return;
  const query = ($('evaluationExecutorSearch')?.value || '').trim().toLowerCase();
  const selected = uniqueIdsV37(state.evaluationExecutorIds);
  const relevant = new Set(uniqueIdsV37([...taskAssigneeIds(task), ...(state.timeEntries || []).filter(entry => entry.tarefa_id === task.id).map(entry => entry.colaborador_id)]));
  const people = [...state.collaborators]
    .filter(person => !query || [person.nome,person.cargo].join(' ').toLowerCase().includes(query))
    .sort((a,b) => Number(relevant.has(b.id)) - Number(relevant.has(a.id)) || a.nome.localeCompare(b.nome,'pt-BR'));

  list.innerHTML = people.length ? people.map(person => {
    const isSelected = selected.includes(person.id);
    const minutes = taskTimeMinutesByPersonV372(task.id, person.id);
    const badges = [];
    if (taskAssigneeIds(task).includes(person.id)) badges.push('Responsável');
    if (minutes > 0) badges.push(formatMinutesV372(minutes));
    return `<button type="button" class="evaluation-executor-option ${isSelected ? 'selected' : ''}" data-evaluation-executor="${person.id}" aria-pressed="${isSelected}">
      ${avatarHTML(person,'sm')}
      <span class="evaluation-executor-option-copy"><strong>${escapeHtml(person.nome)}</strong><small>${escapeHtml(person.cargo || 'Marketing')}</small>${badges.length ? `<em>${escapeHtml(badges.join(' · '))}</em>` : ''}</span>
      <span class="evaluation-executor-check"><i data-lucide="check"></i></span>
    </button>`;
  }).join('') : `<div class="empty-state" style="grid-column:1/-1"><i data-lucide="user-search"></i>Nenhum colaborador encontrado.</div>`;

  const count = selected.length;
  if ($('evaluationExecutorSummary')) $('evaluationExecutorSummary').textContent = `${count} selecionado${count === 1 ? '' : 's'}`;
  refreshIcons();
}
function toggleEvaluationExecutorV372(personId) {
  const ids = uniqueIdsV37(state.evaluationExecutorIds);
  state.evaluationExecutorIds = ids.includes(personId) ? ids.filter(id => id !== personId) : [...ids, personId];
  renderEvaluationExecutorsV372();
}
function authorshipPeopleStatusHTMLV372(review) {
  if (!review) return '';
  const rows = authorshipReviewConfirmationsV372(review.id);
  return rows.map(row => {
    const person = collaborator(row.colaborador_id);
    return `<span class="authorship-status-person ${row.resposta}">${avatarHTML(person,'xs')}<span>${escapeHtml(firstName(person?.nome || 'Colaborador'))}</span><b>${row.resposta === 'confirmado' ? '✓' : row.resposta === 'contestado' ? '!' : '...'}</b></span>`;
  }).join('');
}
function evaluationPanelHTMLV372(task, evaluator) {
  const review = taskAuthorshipReviewV372(task.id);
  const rows = review ? authorshipReviewConfirmationsV372(review.id) : [];
  const confirmed = rows.filter(row => row.resposta === 'confirmado').length;
  const contested = rows.filter(row => row.resposta === 'contestado').length;
  const pending = rows.filter(row => row.resposta === 'pendente').length;
  const total = rows.length;
  const pct = total ? Math.round((confirmed / total) * 100) : 0;
  const myRow = rows.find(row => row.colaborador_id === state.me?.id);

  if (task.status === 'revisao' && task.avaliacao_status === 'confirmacao_autoria' && review) {
    if (isManager()) {
      return `<section class="authorship-status-panel pending">
        <div class="authorship-status-panel-head"><span><i data-lucide="users-round"></i></span><div><strong>Aguardando confirmação de autoria</strong><small>Você validou a entrega. A demanda será concluída quando todos os executores selecionados confirmarem.</small></div></div>
        <div class="authorship-progress"><div class="authorship-progress-track"><i style="width:${pct}%"></i></div><strong>${confirmed}/${total} confirmaram</strong></div>
        <div class="authorship-status-people">${authorshipPeopleStatusHTMLV372(review)}</div>
        <div class="authorship-status-actions"><button id="drawerReviewAuthorshipBtn" type="button" class="btn secondary"><i data-lucide="pencil"></i>Revisar nomes</button></div>
      </section>`;
    }
    if (myRow?.resposta === 'pendente') {
      return `<section class="authorship-status-panel pending">
        <div class="authorship-status-panel-head"><span><i data-lucide="badge-check"></i></span><div><strong>Sua confirmação é necessária</strong><small>O gestor registrou quem realizou a entrega. Confira os nomes para a demanda poder ser encerrada.</small></div></div>
        <div class="authorship-status-people">${authorshipPeopleStatusHTMLV372(review)}</div>
        <div class="authorship-status-actions"><button id="drawerConfirmAuthorshipBtn" type="button" class="btn primary"><i data-lucide="badge-check"></i>Confirmar autoria</button></div>
      </section>`;
    }
    return `<section class="authorship-status-panel">
      <div class="authorship-status-panel-head"><span><i data-lucide="hourglass"></i></span><div><strong>${myRow?.resposta === 'confirmado' ? 'Você já confirmou a autoria' : 'Autoria em confirmação'}</strong><small>${pending ? `Ainda faltam ${pending} confirmação${pending === 1 ? '' : 'ões'} para encerrar a demanda.` : 'Aguardando processamento da validação.'}</small></div></div>
      <div class="authorship-status-people">${authorshipPeopleStatusHTMLV372(review)}</div>
    </section>`;
  }

  if (task.status === 'revisao' && task.avaliacao_status === 'autoria_contestada' && review) {
    const contestedRows = rows.filter(row => row.resposta === 'contestado');
    const detail = contestedRows.map(row => {
      const person = collaborator(row.colaborador_id);
      return `${firstName(person?.nome || 'Colaborador')}: ${row.observacao || 'contestou a autoria'}`;
    }).join(' · ');
    if (isManager()) {
      return `<section class="authorship-status-panel contested">
        <div class="authorship-status-panel-head"><span><i data-lucide="message-square-warning"></i></span><div><strong>Autoria contestada</strong><small>${escapeHtml(detail || 'Um dos participantes discordou dos nomes registrados.')} Revise os executores e envie uma nova confirmação.</small></div></div>
        <div class="authorship-status-people">${authorshipPeopleStatusHTMLV372(review)}</div>
        <div class="authorship-status-actions"><button id="drawerReviewAuthorshipBtn" type="button" class="btn primary"><i data-lucide="users-round"></i>Revisar autoria</button></div>
      </section>`;
    }
    return `<section class="authorship-status-panel contested">
      <div class="authorship-status-panel-head"><span><i data-lucide="message-square-warning"></i></span><div><strong>Autoria em revisão</strong><small>Houve uma contestação e o gestor precisa revisar os nomes antes de concluir a demanda.</small></div></div>
    </section>`;
  }

  if (task.status === 'revisao') {
    return isManager()
      ? `<section class="manager-evaluation-panel"><div class="manager-evaluation-icon"><i data-lucide="scan-eye"></i></div><div><span class="eyebrow">Sua ação é necessária</span><h3>O colaborador solicitou a conclusão</h3><p>Confira o resultado e registre quem realmente realizou a entrega. Os executores confirmarão a autoria antes do encerramento.</p></div><div class="manager-evaluation-actions"><button id="drawerRejectEvaluationBtn" type="button" class="btn secondary"><i data-lucide="undo-2"></i>Devolver para ajustes</button><button id="drawerApproveEvaluationBtn" type="button" class="btn primary"><i data-lucide="users-round"></i>Validar e atribuir autoria</button></div></section>`
      : `<section class="manager-evaluation-panel waiting"><div class="manager-evaluation-icon"><i data-lucide="hourglass"></i></div><div><span class="eyebrow">Aguardando gestor</span><h3>Sua entrega foi enviada para avaliação</h3><p>O gestor vai validar o resultado e registrar quem participou da execução.</p></div></section>`;
  }

  if (task.avaliacao_status === 'ajustes' && task.avaliacao_observacao) {
    return `<section class="evaluation-feedback adjustments"><span><i data-lucide="message-square-warning"></i></span><div><strong>Ajustes solicitados${evaluator ? ` por ${escapeHtml(firstName(evaluator.nome))}` : ''}</strong><p>${escapeHtml(task.avaliacao_observacao)}</p><small>${task.avaliado_em ? formatDateTime(task.avaliado_em) : ''}</small></div></section>`;
  }

  if (task.avaliacao_status === 'aprovada') {
    const executors = taskFinalExecutorsV372(task);
    const names = executors.length ? executors.map(person => firstName(person.nome)).join(', ') : '';
    return `<section class="evaluation-feedback approved"><span><i data-lucide="badge-check"></i></span><div><strong>Conclusão aprovada${evaluator ? ` por ${escapeHtml(firstName(evaluator.nome))}` : ''}</strong><p>${names ? `Autoria confirmada: ${escapeHtml(names)}.` : escapeHtml(task.avaliacao_observacao || 'Entrega validada e encerrada.')}</p><small>${task.avaliado_em ? formatDateTime(task.avaliado_em) : ''}</small></div></section>`;
  }
  return '';
}

function openAuthorshipConfirmationV372(confirmation) {
  if (!confirmation) return;
  const review = (state.authorshipReviews || []).find(row => row.id === confirmation.revisao_id);
  if (!review || review.status !== 'aguardando') return;
  const task = state.tasks.find(item => item.id === review.tarefa_id);
  if (!task) return;
  const manager = collaborator(review.gestor_id);
  const rows = authorshipReviewConfirmationsV372(review.id);
  const people = rows.map(row => collaborator(row.colaborador_id)).filter(Boolean);

  $('authorshipConfirmationReviewId').value = review.id;
  $('authorshipContestReason').value = '';
  $('authorshipContestBox').classList.add('hidden');
  $('authorshipConfirmationFooter').classList.remove('hidden');

  $('authorshipConfirmationTask').innerHTML = `<span><i data-lucide="clipboard-check"></i></span><div><small>${manager ? `Revisada por ${escapeHtml(manager.nome)}` : 'Revisão do gestor'}</small><strong>${escapeHtml(task.titulo)}</strong><em>${escapeHtml(task.descricao || 'Sem descrição registrada.')}</em></div>`;
  $('authorshipConfirmationCount').textContent = `${people.length} pessoa${people.length === 1 ? '' : 's'}`;
  $('authorshipConfirmationPeople').innerHTML = people.map(person => `<div class="authorship-confirmation-person">${avatarHTML(person,'sm')}<span><strong>${escapeHtml(person.nome)}</strong><small>${escapeHtml(person.cargo || 'Marketing')}</small></span><b>${person.id === state.me.id ? 'VOCÊ' : 'EXECUTOR'}</b></div>`).join('');
  $('authorshipConfirmationManagerNote').classList.toggle('hidden', !review.observacao_gestor);
  $('authorshipConfirmationManagerNote').innerHTML = review.observacao_gestor ? `<strong>Observação do gestor:</strong> ${escapeHtml(review.observacao_gestor)}` : '';
  $('authorshipConfirmationModal').classList.remove('hidden');
  refreshIcons();
}
function maybeShowAuthorshipConfirmationV372() {
  if (!state.authorshipReady || !state.me || !$('authorshipConfirmationModal')?.classList.contains('hidden')) return;
  if (!$('intrusiveNotificationModal')?.classList.contains('hidden')) return;
  const pending = myPendingAuthorshipConfirmationsV372().find(row => !state.authorshipPostponed.has(row.revisao_id));
  if (pending) openAuthorshipConfirmationV372(pending);
}
function postponeAuthorshipConfirmationV372() {
  const reviewId = $('authorshipConfirmationReviewId')?.value;
  if (reviewId) state.authorshipPostponed.add(reviewId);
  closeModal('authorshipConfirmationModal');
}
async function respondAuthorshipConfirmationV372(confirm) {
  const reviewId = $('authorshipConfirmationReviewId')?.value;
  if (!reviewId) return;
  const reason = $('authorshipContestReason')?.value.trim() || '';
  if (!confirm && !reason) {
    $('authorshipContestReason')?.focus();
    return toast('Explique rapidamente o que está incorreto na autoria.', 'error');
  }
  setLoading(true);
  try {
    const { data, error } = await db.rpc('responder_confirmacao_autoria_v1', {
      p_revisao_id: reviewId,
      p_confirmar: Boolean(confirm),
      p_observacao: reason || null
    });
    if (error) throw error;
    closeModal('authorshipConfirmationModal');
    state.authorshipPostponed.delete(reviewId);
    await refreshData();
    await dispatchPendingPush();
    const result = data || {};
    if (confirm && result?.concluida) toast('Autoria confirmada. Todos responderam e a demanda foi concluída.');
    else if (confirm) toast('Sua confirmação foi registrada. Aguardando os demais executores.');
    else toast('Contestação enviada ao gestor. A demanda continuará em revisão.');
    setTimeout(maybeShowAuthorshipConfirmationV372, 500);
  } catch (error) {
    console.error('[autoria V3.8.5 resposta]', error);
    const friendly = errorMessage(error);
    const raw = String(error?.message || error?.details || '').trim();
    const code = String(error?.code || '').trim();
    toast(friendly === raw || !raw ? friendly : `${friendly}${code && !friendly.includes(code) ? ` · ${code}` : ''}`, 'error');
  } finally {
    setLoading(false);
  }
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
  $('evaluationExecutorSearch').value = '';
  state.evaluationExecutorIds = suggestedExecutorIdsV372(task);

  const people = taskAssigneePeople(task);
  const submittedBy = person || people[0] || null;
  $('evaluationTaskSummary').innerHTML = `<div class="evaluation-summary-person">${taskAssigneeAvatarGroupHTML(task,'lg',4)}<div><span>Entrega enviada pela equipe</span><strong>${escapeHtml(people.length ? taskAssigneeShortNames(task) : submittedBy?.nome || 'Sem responsável')}</strong><small>${people.length > 1 ? `${people.length} responsáveis vinculados` : escapeHtml(submittedBy?.cargo || 'Marketing')}</small></div></div><div class="evaluation-summary-task"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade] || 'Média'}</span><h3>${escapeHtml(task.titulo)}</h3><p>${escapeHtml(task.descricao || 'Sem descrição registrada.')}</p><div><span><i data-lucide="clock-3"></i>${formatHours(sizeWeight(task))} estimadas</span><span><i data-lucide="calendar-clock"></i>${escapeHtml(dueLabel(task))}</span></div></div>`;
  renderEvaluationExecutorsV372();
  $('taskEvaluationModal').classList.remove('hidden');
  refreshIcons();
}

async function submitTaskEvaluation(approved) {
  const taskId = $('evaluationTaskId').value;
  const note = $('evaluationNote').value.trim();
  if (!approved && !note) {
    $('evaluationNote').focus();
    return toast('Informe o que precisa ser ajustado antes de devolver a demanda.', 'error');
  }

  if (approved) {
    const executors = uniqueIdsV37(state.evaluationExecutorIds);
    if (!executors.length) return toast('Selecione pelo menos uma pessoa que realizou a demanda.', 'error');
  }

  setLoading(true);
  try {
    if (approved) {
      const executors = uniqueIdsV37(state.evaluationExecutorIds);
      const { data, error } = await db.rpc('solicitar_confirmacao_autoria_v1', {
        p_tarefa_id: taskId,
        p_executores: executors,
        p_observacao: note || null
      });
      if (error) throw error;
      closeModal('taskEvaluationModal');
      await refreshData();
      await dispatchPendingPush();
      if (state.tasks.some(task => task.id === taskId)) await openTask(taskId);
      const selectedManagers = executors.filter(id => collaborator(id)?.role === 'gestor');
      toast(selectedManagers.length
        ? `Entrega validada. Aguardando confirmação de ${selectedManagers.length} gestor${selectedManagers.length === 1 ? '' : 'es'} participante${selectedManagers.length === 1 ? '' : 's'}.`
        : 'Entrega validada e autoria registrada. Nenhum gestor executor precisava confirmar.');
      return;
    }

    const { error } = await db.rpc('avaliar_conclusao', {
      p_tarefa_id: taskId,
      p_aprovado: false,
      p_observacao: note || null
    });
    if (error) throw error;
    closeModal('taskEvaluationModal');
    await refreshData();
    await dispatchPendingPush();
    if (state.tasks.some(task => task.id === taskId)) await openTask(taskId);
    toast('Demanda devolvida para ajustes.');
  } catch (error) {
    toast(errorMessage(error),'error');
  } finally {
    setLoading(false);
  }
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
function buildMonthlyReportLegacyV31(value){
  const {start,end,label}=monthBounds(value),operators=state.collaborators.filter(p=>p.role!=='gestor');
  const operatorIds=new Set(operators.map(p=>p.id));
  const rows=operators.map(person=>{
    const completed=state.tasks.filter(t=>taskHasAssignee(t, person.id)&&t.status==='concluida'&&new Date(t.concluida_em||t.atualizado_em)>=start&&new Date(t.concluida_em||t.atualizado_em)<end);
    const created=state.tasks.filter(t=>taskHasAssignee(t, person.id)&&new Date(t.criado_em)>=start&&new Date(t.criado_em)<end);
    const overdue=state.tasks.filter(t=>taskHasAssignee(t, person.id)&&!t.arquivada_em&&isOverdue(t));
    const active=state.tasks.filter(t=>taskHasAssignee(t, person.id)&&!t.arquivada_em&&t.status!=='concluida');
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
function renderMonthlyReportLegacyV31(){
  const value=$('monthlyReportMonth').value||monthInputValue();const report=buildMonthlyReport(value);state.monthlyReportData=report;
  const projectsHTML=report.projects.length?`<section class="monthly-project-section"><div class="monthly-section-title"><div><span class="eyebrow">Projetos</span><h4>Onde o esforço do mês foi aplicado</h4></div><span>${report.projects.length} projeto${report.projects.length===1?'':'s'}</span></div><div class="monthly-project-grid">${report.projects.map(project=>`<article class="monthly-project-card ${project.name==='Sem projeto'?'unclassified':''}"><div class="monthly-project-card-head"><span><i data-lucide="folder-kanban"></i></span><div><strong>${escapeHtml(project.name)}</strong><small>${project.created} recebida(s) · ${project.completed} concluída(s)</small></div></div><div class="monthly-project-stats"><span><strong>${formatHours(project.hours)}</strong><small>entregues</small></span><span><strong>${project.active}</strong><small>ativas</small></span><span class="${project.overdue?'danger':''}"><strong>${project.overdue}</strong><small>atrasadas</small></span><span><strong>${project.immediates}</strong><small>imediatas</small></span></div></article>`).join('')}</div></section>`:'<section class="monthly-project-section"><div class="empty-state"><i data-lucide="folder-kanban"></i>Nenhum projeto com atividade neste mês.</div></section>';
  $('monthlyReportContent').innerHTML=`<div class="monthly-report-hero"><div><span class="eyebrow light">${escapeHtml(report.label)}</span><h3>Performance operacional da equipe</h3><p>Gestores ficam fora da comparação. O relatório combina volume concluído, horas estimadas, prazo, ciclo, projetos e transferências.</p></div><div class="monthly-report-totals"><span><strong>${report.totalCompleted}</strong>concluídas</span><span><strong>${formatHours(report.totalHours)}</strong>entregues</span><span><strong>${report.teamOnTimeRate===null?'—':report.teamOnTimeRate+'%'}</strong>no prazo</span></div></div>${projectsHTML}<section class="monthly-people-section"><div class="monthly-section-title"><div><span class="eyebrow">Equipe</span><h4>Performance por colaborador</h4></div></div><div class="monthly-report-table"><div class="monthly-report-row head"><span>Colaborador</span><span>Recebidas</span><span>Concluídas</span><span>Horas</span><span>No prazo</span><span>Ciclo médio</span><span>Ativas</span><span>Atrasadas</span><span>Transferências</span></div>${report.rows.map((r,i)=>`<div class="monthly-report-row"><span class="monthly-person">${avatarHTML(r.person,'sm')}<span><strong>${escapeHtml(r.person.nome)}</strong><small>${escapeHtml(r.person.cargo||'Marketing')} · #${i+1}${r.immediates?` · ${r.immediates} imediata(s)`:''}</small></span></span><strong>${r.created}</strong><strong>${r.completed}</strong><strong>${formatHours(r.hours)}</strong><strong>${r.onTimeRate===null?'—':r.onTimeRate+'%'}</strong><strong>${r.avgCycle===null?'—':r.avgCycle.toFixed(1).replace('.',',')+'d'}</strong><strong>${r.active}</strong><strong class="${r.overdue?'danger':''}">${r.overdue}</strong><span>${r.transfersIn} receb. · ${r.transfersOut} env.</span></div>`).join('')||'<div class="empty-state">Nenhum colaborador operacional encontrado.</div>'}</div></section>`;refreshIcons();
}
function openMonthlyReport(){if(!isManager())return;$('monthlyReportMonth').value=monthInputValue();renderMonthlyReport();$('monthlyReportModal').classList.remove('hidden');refreshIcons();}
function csvCell(value){const text=String(value??'');return `"${text.replace(/"/g,'""')}"`;}
function exportMonthlyReportCsvLegacyV31(){
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
function printMonthlyReportLegacyV31(){const html=$('monthlyReportContent').innerHTML,w=window.open('','_blank','width=1200,height=800');if(!w)return toast('Permita pop-ups para imprimir o relatório.','error');w.document.write(`<!doctype html><html><head><title>Relatório mensal PMG Connect</title><style>body{font-family:Arial,sans-serif;padding:30px;color:#17221b}.monthly-report-row{display:grid;grid-template-columns:2fr repeat(6,1fr);gap:10px;padding:10px;border-bottom:1px solid #ddd}.head{font-weight:bold;background:#f2f5f3}.avatar{display:none}.monthly-report-hero{padding:20px;background:#164b2d;color:white;margin-bottom:20px}.monthly-report-totals{display:flex;gap:30px}.monthly-person small{display:block;color:#777}</style></head><body>${html}</body></html>`);w.document.close();setTimeout(()=>w.print(),250);}

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
  $('priorityManagerForm')?.addEventListener('submit', saveManagedPriority);
  $$('[data-manager-priority]').forEach(button => button.addEventListener('click', () => {
    $('priorityManagerValue').value = button.dataset.managerPriority;
    syncPriorityManagerUI();
  }));
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
  $('evaluationExecutorSearch')?.addEventListener('input', renderEvaluationExecutorsV372);
  $('evaluationExecutorList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-evaluation-executor]');
    if (button) toggleEvaluationExecutorV372(button.dataset.evaluationExecutor);
  });
  $('authorshipConfirmBtn')?.addEventListener('click', () => respondAuthorshipConfirmationV372(true));
  $('authorshipDisputeBtn')?.addEventListener('click', () => {
    $('authorshipContestBox')?.classList.remove('hidden');
    $('authorshipConfirmationFooter')?.classList.add('hidden');
    $('authorshipContestReason')?.focus();
  });
  $('authorshipCancelContestBtn')?.addEventListener('click', () => {
    $('authorshipContestBox')?.classList.add('hidden');
    $('authorshipConfirmationFooter')?.classList.remove('hidden');
  });
  $('authorshipSendContestBtn')?.addEventListener('click', () => respondAuthorshipConfirmationV372(false));
  $('authorshipLaterBtn')?.addEventListener('click', postponeAuthorshipConfirmationV372);
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
  $('itemAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ selectId: 'itemAssignee', previewId: 'itemAssigneePreview', jsonInputId: 'itemAssigneesJson', multi: true, title: 'Selecionar responsáveis' }));
  $('editTaskAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ selectId: 'editTaskAssignee', previewId: 'editTaskAssigneePreview', jsonInputId: 'editTaskAssigneesJson', multi: true, title: 'Gerenciar responsáveis' }));
  $('recurrenceEditAssigneePickerBtn')?.addEventListener('click', () => openAssigneePicker({ selectId: 'recurrenceEditAssignee', previewId: 'recurrenceEditAssigneePreview', jsonInputId: 'recurrenceEditAssigneesJson', multi: true, title: 'Responsáveis da recorrência' }));
  $('assigneePickerApplyBtn')?.addEventListener('click', applyAssigneePickerSelection);
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
    const assigneeClear = event.target.closest('[data-assignee-clear]');
    if (assigneeClear) { state.assigneePicker.selectedIds = []; renderAssigneePicker(); return; }
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
  const canEdit = !task.arquivada_em && task.status !== 'concluida' && (isManager() || taskHasAssignee(task, state.me?.id));
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
  const canTrack = !task.arquivada_em && task.status !== 'concluida' && (isManager() || taskHasAssignee(task, state.me?.id));
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
  const task = state.tasks.find(item => item.id === taskId);
  if (taskRaceIsOpenV371(task)) return toast('Primeiro clique em Iniciar demanda para assumir a tarefa. Depois disso o cronômetro fica disponível.', 'error');
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
    const completed = state.tasks.filter(task => taskHasAssignee(task, person.id) && task.status === 'concluida' && new Date(task.concluida_em || task.atualizado_em) >= start && new Date(task.concluida_em || task.atualizado_em) < end);
    const created = state.tasks.filter(task => taskHasAssignee(task, person.id) && new Date(task.criado_em) >= start && new Date(task.criado_em) < end);
    const overdue = state.tasks.filter(task => taskHasAssignee(task, person.id) && !task.arquivada_em && isOverdue(task));
    const active = state.tasks.filter(task => taskHasAssignee(task, person.id) && !task.arquivada_em && task.status !== 'concluida');
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
  const today = take(task => !isDeadlinePausedV379(task) && taskDueKey(task) === todayKey());
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
  return state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida' && taskHasAssignee(task, personId)).filter(task => {
    const due = taskDue(task); if (!due) return days >= 30;
    return new Date(due).getTime() <= limit;
  }).reduce((sum, task) => sum + taskEffortShare(task), 0);
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
const AUTOMATION_DEST_LABELS={responsavel:'Responsável',criador:'Gestor/criador',gestores:'Gestor/criador (migrado)',equipe:'Toda a equipe operacional'};
function renderAutomations(){const list=$('automationList');if(!list)return;renderV5SetupNotice('automationSetupNotice','Central de Automações');if(!isManager()){list.innerHTML='<div class="empty-state"><i data-lucide="lock-keyhole"></i>Somente gestores configuram automações.</div>';return}const active=state.automations.filter(a=>a.ativo).length;$('automationSummary').innerHTML=[teamSummaryCard('workflow',state.automations.length,'Regras criadas'),teamSummaryCard('toggle-right',active,'Ativas'),teamSummaryCard('bell-ring',state.automations.filter(a=>['critica','importante'].includes(a.nivel)).length,'Alertas prioritários')].join('');list.innerHTML=state.intelligenceReady?(state.automations.length?state.automations.map(automationCardHTML).join(''):`<div class="automation-empty card"><i data-lucide="workflow"></i><strong>Nenhuma automação criada</strong><span>Use um dos exemplos acima ou crie uma regra personalizada.</span></div>`):'';refreshIcons();}
function automationCardHTML(rule){const condition=rule.condicao_campo&&rule.condicao_campo!=='qualquer'?`${rule.condicao_campo} = ${rule.condicao_valor}`:'qualquer demanda';return `<article class="automation-card ${rule.ativo?'active':'disabled'} level-${rule.nivel||'normal'}"><div class="automation-card-main"><span class="automation-card-level ${rule.nivel||'normal'}"><i data-lucide="${rule.nivel==='critica'?'siren':rule.nivel==='importante'?'triangle-alert':rule.nivel==='informativa'?'info':'bell'}"></i></span><div><div class="automation-card-title"><strong>${escapeHtml(rule.nome)}</strong><span>${rule.ativo?'Ativa':'Pausada'}</span></div><p><b>SE</b> ${escapeHtml(AUTOMATION_TRIGGER_LABELS[rule.gatilho]||rule.gatilho)} <b>E</b> ${escapeHtml(condition)} <b>ENTÃO</b> notificar ${escapeHtml(AUTOMATION_DEST_LABELS[rule.acao_destino]||rule.acao_destino)}.</p><small>${escapeHtml(rule.mensagem||'Mensagem padrão do PMG Connect')}</small></div></div><div class="automation-card-actions"><button type="button" class="btn soft" data-toggle-automation="${rule.id}"><i data-lucide="${rule.ativo?'pause':'play'}"></i>${rule.ativo?'Pausar':'Ativar'}</button><button type="button" class="icon-btn subtle" data-edit-automation="${rule.id}"><i data-lucide="pencil"></i></button></div></article>`;}
function openAutomationModal(rule=null,template=null){if(!isManager())return;if(!state.intelligenceReady)return toast('Execute o SQL V3.5 no Supabase antes de criar automações.','error');$('automationForm').reset();$('automationId').value=rule?.id||'';$('automationModalTitle').textContent=rule?'Editar automação':'Nova automação';$('automationName').value=rule?.nome||'';$('automationTrigger').value=rule?.gatilho||'tarefa_criada';$('automationConditionField').value=rule?.condicao_campo||'qualquer';$('automationConditionValue').value=rule?.condicao_valor||'';$('automationDestination').value=(rule?.acao_destino==='gestores'?'criador':rule?.acao_destino)||'responsavel';$('automationLevel').value=rule?.nivel||'normal';$('automationMessage').value=rule?.mensagem||'';$('automationEnabled').checked=rule?.ativo!==false;$('automationDeleteBtn').classList.toggle('hidden',!rule);if(template)applyAutomationTemplate(template);$('automationModal').classList.remove('hidden');refreshIcons();}
function applyAutomationTemplate(template){const presets={imediata:{name:'Alerta de demanda imediata',trigger:'tarefa_criada',field:'prioridade',value:'imediata',dest:'responsavel',level:'critica',message:'Você recebeu uma demanda IMEDIATA. Abra agora e verifique o briefing.'},revisao:{name:'Revisão aguardando gestor',trigger:'revisao',field:'qualquer',value:'',dest:'criador',level:'importante',message:'Uma demanda que você criou entrou em revisão e aguarda avaliação.'},prazo:{name:'Prazo em 24 horas',trigger:'prazo_24h',field:'qualquer',value:'',dest:'responsavel',level:'importante',message:'Esta demanda vence em até 24 horas. Revise o andamento e o prazo.'},parada:{name:'Demanda sem movimentação',trigger:'sem_movimentacao_3d',field:'qualquer',value:'',dest:'criador',level:'importante',message:'Uma demanda que você criou está há pelo menos 3 dias sem movimentação.'}};const p=presets[template];if(!p)return;$('automationName').value=p.name;$('automationTrigger').value=p.trigger;$('automationConditionField').value=p.field;$('automationConditionValue').value=p.value;$('automationDestination').value=p.dest;$('automationLevel').value=p.level;$('automationMessage').value=p.message;}
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
buildMonthlyReport=function buildMonthlyReportV35(value){const report=buildMonthlyReportV34(value);report.version='3.5';report.rows=(report.rows||[]).map(row=>{const bounds=monthBounds(value);const completed=state.tasks.filter(t=>taskHasAssignee(t, row.person.id)&&t.status==='concluida'&&new Date(t.concluida_em||t.atualizado_em)>=bounds.start&&new Date(t.concluida_em||t.atualizado_em)<bounds.end);const rework=completed.reduce((s,t)=>s+Number(t.retrabalhos||0),0);const accuracy=row.estimatedHours>0&&row.actualHours>0?Math.max(0,Math.round(100-Math.abs(row.actualHours-row.estimatedHours)/row.estimatedHours*100)):null;return{...row,rework,accuracy}}).sort((a,b)=>a.person.nome.localeCompare(b.person.nome,'pt-BR'));report.totalRework=report.rows.reduce((s,r)=>s+r.rework,0);const acc=report.rows.map(r=>r.accuracy).filter(v=>v!==null);report.estimateAccuracy=acc.length?Math.round(acc.reduce((a,b)=>a+b,0)/acc.length):null;const cycles=report.rows.map(r=>r.avgCycle).filter(v=>v!==null);report.teamAvgCycle=average(cycles);report.totalTransfers=report.rows.reduce((s,r)=>s+r.transfersIn+r.transfersOut,0)/2;const previous=buildMonthlyReportV34(monthValueShift(value,-1));report.comparison={previousLabel:previous.label,completed:pctDelta(report.totalCompleted,previous.totalCompleted),created:pctDelta(report.totalCreated,previous.totalCreated),hours:pctDelta(report.totalActualHours,previous.totalActualHours),onTime:report.teamOnTimeRate!==null&&previous.teamOnTimeRate!==null?report.teamOnTimeRate-previous.teamOnTimeRate:null};return report;}
function deltaHTML(value,suffix='%'){if(value===null||value===undefined)return'<span class="monthly-delta neutral">sem base</span>';const tone=value>0?'up':value<0?'down':'neutral';return`<span class="monthly-delta ${tone}"><i data-lucide="${value>0?'trending-up':value<0?'trending-down':'minus'}"></i>${value>0?'+':''}${value}${suffix}</span>`;}
const renderMonthlyReportV34=renderMonthlyReport;
renderMonthlyReport=function renderMonthlyReportV35(){renderMonthlyReportV34();const report=state.monthlyReportData;if(!report)return;const hero=$('monthlyReportContent')?.querySelector('.monthly-report-hero');if(!hero)return;const attention=[];if((report.teamOnTimeRate??100)<85)attention.push(`Pontualidade em ${report.teamOnTimeRate}%`);if(report.totalRework>0)attention.push(`${report.totalRework} ciclo(s) de retrabalho`);if((report.estimateAccuracy??100)<75)attention.push(`Precisão das estimativas em ${report.estimateAccuracy}%`);if((report.totalTransfers||0)>=5)attention.push(`${Math.round(report.totalTransfers)} transferências no mês`);const compare=document.createElement('section');compare.className='monthly-comparison';compare.innerHTML=`<div class="monthly-section-title"><div><span class="eyebrow">Comparação</span><h4>Em relação a ${escapeHtml(report.comparison?.previousLabel||'mês anterior')}</h4></div></div><div class="monthly-comparison-grid"><div><span>Concluídas</span><strong>${report.totalCompleted}</strong>${deltaHTML(report.comparison?.completed)}</div><div><span>Demandas recebidas</span><strong>${report.totalCreated}</strong>${deltaHTML(report.comparison?.created)}</div><div><span>Horas reais</span><strong>${formatHours(report.totalActualHours||0)}</strong>${deltaHTML(report.comparison?.hours)}</div><div><span>No prazo</span><strong>${report.teamOnTimeRate===null?'—':report.teamOnTimeRate+'%'}</strong>${deltaHTML(report.comparison?.onTime,' p.p.')}</div><div><span>Estimativa x real</span><strong>${report.estimateAccuracy===null?'—':report.estimateAccuracy+'%'}</strong><small>precisão média</small></div><div><span>Retrabalho</span><strong>${report.totalRework||0}</strong><small>retornos para ajustes</small></div></div><div class="monthly-attention ${attention.length?'has-alerts':'clean'}"><i data-lucide="${attention.length?'scan-search':'circle-check-big'}"></i><div><strong>${attention.length?'O que merece atenção':'Mês operacionalmente saudável'}</strong><span>${attention.length?escapeHtml(attention.join(' · ')):'Nenhum sinal relevante de prazo, retrabalho ou estimativa fora da faixa definida.'}</span></div></div>`;hero.insertAdjacentElement('afterend',compare);const rankMarkers=$('monthlyReportContent').querySelectorAll('.monthly-person small');rankMarkers.forEach(el=>{el.textContent=el.textContent.replace(/\s·\s#\d+/,'')});refreshIcons();}

function personMonthMetrics(personId,offset){const now=new Date(),base=new Date(now.getFullYear(),now.getMonth()+offset,1),value=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}`,bounds=monthBounds(value);const completed=state.tasks.filter(t=>taskHasAssignee(t, personId)&&t.status==='concluida'&&new Date(t.concluida_em||t.atualizado_em)>=bounds.start&&new Date(t.concluida_em||t.atualizado_em)<bounds.end);const deadline=completed.filter(t=>taskDue(t)&&t.concluida_em),onTime=deadline.filter(t=>new Date(t.concluida_em)<=new Date(taskDue(t))).length;const entries=state.timeEntries.filter(e=>e.colaborador_id===personId&&new Date(e.inicio_em)<bounds.end&&new Date(e.fim_em||Date.now())>=bounds.start);const hours=entries.reduce((s,e)=>s+entryMinutesInsideMonth(e,bounds.start,bounds.end),0)/60;return{label:new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(base).replace('.',''),completed:completed.length,onTime:deadline.length?Math.round(onTime/deadline.length*100):null,rework:completed.reduce((s,t)=>s+Number(t.retrabalhos||0),0),hours};}
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



/* =========================================================
   PMG CONNECT V3.6.2 — RECORRÊNCIA REALMENTE INTEGRADA
   Criação, edição, transferência, Hoje, Agenda, Demandas,
   Projetos, Equipe, busca, notificações e relatório mensal.
   ========================================================= */
Object.assign(state, {
  recurringSeries: [],
  recurringOccurrences: [],
  recurrenceReady: false,
  recurrenceTimer: null,
  recurrenceManagerSearch: '',
  recurrenceManagerStatus: ''
});

const TASK_RECURRENCE_LABEL = {
  diaria: 'Todos os dias',
  dias_uteis: 'Dias úteis',
  semanal: 'Semanal',
  personalizada: 'Dias específicos',
  mensal: 'Mensal'
};
const WEEKDAY_SHORT = {1:'Seg',2:'Ter',3:'Qua',4:'Qui',5:'Sex',6:'Sáb',7:'Dom'};

function isMissingRecurrenceSchema(error) {
  return /demandas_recorrentes|recorrencia_id|processar_recorrencias_demanda|criar_demanda_recorrente|converter_tarefa_em_recorrente|schema cache|does not exist/i.test(error?.message || error?.details || String(error || ''));
}
function isRecurringTask(task) { return Boolean(task?.recorrencia_id); }
function recurrenceSeriesById(id) { return state.recurringSeries.find(item => item.id === id) || null; }
function recurrenceSeriesForTask(task) { return task?.recorrencia_id ? recurrenceSeriesById(task.recorrencia_id) : null; }
function recurrenceOccurrenceForTask(task) { return task?.recorrencia_id ? state.recurringOccurrences.find(item => item.recorrencia_id === task.recorrencia_id && (item.tarefa_id === task.id || item.data_referencia === task.recorrencia_data)) || null : null; }
function recurrenceSeriesStatus(series) {
  if (!series) return 'unknown';
  if (series.encerrada_em) return 'ended';
  if (!series.ativa) return 'paused';
  return 'active';
}
function recurrenceStatusLabel(series) {
  const status = recurrenceSeriesStatus(series);
  return status === 'active' ? 'Ativa' : status === 'paused' ? 'Pausada' : status === 'ended' ? 'Encerrada' : 'Indisponível';
}
function recurrenceFrequencyLabel(series) {
  if (!series) return 'Recorrente';
  let label = TASK_RECURRENCE_LABEL[series.frequencia] || 'Recorrente';
  if (['semanal','personalizada'].includes(series.frequencia) && (series.dias_semana || []).length) {
    label += ` · ${(series.dias_semana || []).map(day => WEEKDAY_SHORT[day]).filter(Boolean).join(', ')}`;
  }
  return label;
}
function recurrencePeriodLabel(series) {
  if (!series) return '';
  const start = series.data_inicio ? formatDate(`${series.data_inicio}T12:00:00`) : '—';
  const end = series.data_fim ? formatDate(`${series.data_fim}T12:00:00`) : 'sem data final';
  return `${start} → ${end}`;
}
function recurrenceBadgeHTML(task, compact = false) {
  const series = recurrenceSeriesForTask(task);
  if (!series) return '';
  const status = recurrenceSeriesStatus(series);
  const text = compact ? 'Recorrente' : recurrenceFrequencyLabel(series);
  return `<span class="recurrence-context-badge ${status === 'paused' ? 'paused' : status === 'ended' ? 'ended' : ''}" title="${escapeHtml(recurrenceFrequencyLabel(series))} · ${escapeHtml(recurrenceStatusLabel(series))}"><i data-lucide="repeat-2"></i>${escapeHtml(text)}</span>`;
}
function selectedWeekdays(containerId) { return $$(`#${containerId} input[type="checkbox"]:checked`).map(input => Number(input.value)); }
function setWeekdays(containerId, days = []) { $$(`#${containerId} input[type="checkbox"]`).forEach(input => { input.checked = days.map(Number).includes(Number(input.value)); }); }
function recurrenceFormWeekdayVisibility(prefix = 'item') {
  const frequency = prefix === 'item' ? $('itemRecurrenceFrequency')?.value : $('recurrenceEditFrequency')?.value;
  const box = $(prefix === 'item' ? 'itemRecurrenceWeekdays' : 'recurrenceEditWeekdays');
  box?.classList.toggle('hidden', !['semanal','personalizada'].includes(frequency));
}
function recurrenceSeriesAppliesToDate(series, key) {
  if (!series || !key || series.encerrada_em || !series.ativa) return false;
  if (key < String(series.data_inicio || '').slice(0,10)) return false;
  if (series.data_fim && key > String(series.data_fim).slice(0,10)) return false;
  const d = new Date(`${key}T12:00:00`);
  const iso = d.getDay() === 0 ? 7 : d.getDay();
  if (series.frequencia === 'diaria') return true;
  if (series.frequencia === 'dias_uteis') return iso >= 1 && iso <= 5;
  if (series.frequencia === 'personalizada') return (series.dias_semana || []).map(Number).includes(iso);
  if (series.frequencia === 'semanal') {
    const days = (series.dias_semana || []).map(Number);
    if (days.length) return days.includes(iso);
    const start = new Date(`${String(series.data_inicio).slice(0,10)}T12:00:00`);
    return Math.round((d - start) / 86400000) % 7 === 0;
  }
  if (series.frequencia === 'mensal') {
    const startDay = Number(String(series.data_inicio).slice(8,10));
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(startDay, lastDay);
  }
  return false;
}
function recurrenceRelevantForAgenda(series) {
  if (state.agendaScope === 'team') return !state.agendaPersonFilter || seriesHasAssignee(series, state.agendaPersonFilter);
  return seriesHasAssignee(series, state.me?.id);
}

async function loadRecurringV36() {
  try {
    const [seriesResult, occurrenceResult] = await Promise.all([
      db.from('demandas_recorrentes').select('*').order('atualizado_em', { ascending: false }).limit(1000),
      db.from('demandas_recorrentes_ocorrencias').select('*').order('data_referencia', { ascending: false }).limit(4000)
    ]);
    const firstError = seriesResult.error || occurrenceResult.error;
    if (firstError) throw firstError;
    state.recurringSeries = seriesResult.data || [];
    state.recurringOccurrences = occurrenceResult.data || [];
    state.recurrenceReady = true;
  } catch (error) {
    if (!isMissingRecurrenceSchema(error)) console.warn('[recorrencias]', error);
    state.recurringSeries = [];
    state.recurringOccurrences = [];
    state.recurrenceReady = false;
  }
}
async function processRecurringV36({ refresh = false } = {}) {
  if (!db || !state.me) return 0;
  try {
    const { data, error } = await db.rpc('processar_recorrencias_demanda');
    if (error) throw error;
    const changed = Number(data || 0);
    if (refresh && changed) {
      await Promise.all([loadTasks(), loadNotifications(), loadRecurringV36(), typeof loadMultipleAssigneesV37 === 'function' ? loadMultipleAssigneesV37() : Promise.resolve()]);
      renderAll();
      queueUnreadIntrusiveNotifications();
    }
    return changed;
  } catch (error) {
    if (!isMissingRecurrenceSchema(error)) console.warn('[processar recorrencias]', error);
    return 0;
  }
}
const loadAllBeforeRecurringV36 = loadAll;
loadAll = async function loadAllRecurringIntegrated() {
  await processRecurringV36();
  await loadAllBeforeRecurringV36();
  await loadRecurringV36();
};

function startRecurrenceProcessorV36() {
  if (state.recurrenceTimer) clearInterval(state.recurrenceTimer);
  state.recurrenceTimer = setInterval(() => {
    if (!document.hidden && state.me) processRecurringV36({ refresh: true });
  }, 60000);
}

function syncCreateRecurrenceUI() {
  const enabled = Boolean($('itemRecurringEnabled')?.checked);
  $('itemRecurrenceFields')?.classList.toggle('hidden', !enabled);
  const dueDateField = $('itemDueDate')?.closest('.field');
  if ($('itemDueDate')) $('itemDueDate').disabled = enabled;
  dueDateField?.classList.toggle('field-disabled', enabled);
  if (enabled) {
    if (!$('itemRecurrenceStart').value) $('itemRecurrenceStart').value = todayKey();
    $('itemDueDate').value = '';
  }
  recurrenceFormWeekdayVisibility('item');
  refreshIcons();
}
const openQuickAddBeforeRecurringV36 = openQuickAdd;
openQuickAdd = function openQuickAddRecurring(type = 'demanda', preset = {}) {
  openQuickAddBeforeRecurringV36(type, preset);
  if (type === 'demanda') {
    if ($('itemRecurringEnabled')) $('itemRecurringEnabled').checked = Boolean(preset.recurring);
    if ($('itemRecurrenceFrequency')) $('itemRecurrenceFrequency').value = preset.recurrenceFrequency || 'dias_uteis';
    if ($('itemRecurrenceStart')) $('itemRecurrenceStart').value = preset.recurrenceStart || preset.date || todayKey();
    if ($('itemRecurrenceEnd')) $('itemRecurrenceEnd').value = preset.recurrenceEnd || '';
    if ($('itemRecurrenceAlertTime')) $('itemRecurrenceAlertTime').value = preset.recurrenceAlertTime || '09:00';
    if ($('itemRecurrenceDailyAlert')) $('itemRecurrenceDailyAlert').checked = preset.recurrenceDailyAlert !== false;
    setWeekdays('itemRecurrenceWeekdays', preset.recurrenceWeekdays || [1,2,3,4,5]);
    syncCreateRecurrenceUI();
  }
};
const createTaskBeforeRecurringV36 = createTaskV2;
createTaskV2 = async function createTaskWithRecurrenceV36() {
  if (!$('itemRecurringEnabled')?.checked) return createTaskBeforeRecurringV36();
  // Não bloqueia por health-check local: a RPC de criação é a fonte de verdade.
  const frequency = $('itemRecurrenceFrequency').value;
  const weekdays = selectedWeekdays('itemRecurrenceWeekdays');
  if (['semanal','personalizada'].includes(frequency) && !weekdays.length) throw new Error('Selecione pelo menos um dia da semana.');
  const start = $('itemRecurrenceStart').value || todayKey();
  const end = $('itemRecurrenceEnd').value || null;
  if (end && end < start) throw new Error('A data final não pode ser anterior ao início.');
  const priority = $('itemPriority').value;
  const alertAll = priority === 'imediata' && $('itemAlertAll')?.value === 'true';
  if (priority === 'imediata' && !$('itemAssignee').value && !alertAll) throw new Error('Escolha um responsável ou envie o alerta imediato para toda a equipe.');
  const assigneeIds = selectedFormAssigneeIdsV37('item');
  const responsibilityMode = $('itemResponsibilityMode')?.value || 'compartilhada';
  if (responsibilityMode === 'primeiro_cumprir' && assigneeIds.length < 2) throw new Error('No modo Primeiro a cumprir, selecione pelo menos duas pessoas candidatas.');
  const { data: recurringId, error } = await db.rpc('criar_demanda_recorrente_v1', {
    p_titulo: $('itemTitle').value.trim(),
    p_descricao: $('itemDescription').value.trim() || null,
    p_prioridade: priority,
    p_responsavel_id: responsibilityMode === 'primeiro_cumprir' ? null : (assigneeIds[0] || null),
    p_tags: $('itemTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
    p_tamanho: $('itemSize').value,
    p_estimativa_horas: $('itemEstimate').value ? Number($('itemEstimate').value) : null,
    p_alerta_para_todos: alertAll,
    p_projeto: $('itemProject')?.value.trim() || null,
    p_checklist: checklistFromText($('itemChecklist')?.value || ''),
    p_dependencias: selectedValues($('itemDependencies')),
    p_frequencia: frequency,
    p_dias_semana: weekdays,
    p_data_inicio: start,
    p_data_fim: end,
    p_horario_prazo: $('itemDueTime').value || '17:00',
    p_horario_alerta: $('itemRecurrenceAlertTime').value || '09:00',
    p_alerta_diario: Boolean($('itemRecurrenceDailyAlert').checked)
  });
  if (error) throw error;
  if (recurringId && state.multiAssigneeReady) {
    const { error: assigneeError } = await db.rpc('definir_responsaveis_recorrencia_modo_v1', {
      p_recorrencia_id: recurringId,
      p_responsaveis: assigneeIds,
      p_modo: responsibilityMode,
      p_aplicar_ocorrencias: true
    });
    if (assigneeError) throw assigneeError;
  }
  await loadRecurringV36();
};

function decorateRecurringTaskNodes(root = document) {
  if (!state.recurrenceReady) return;
  root.querySelectorAll('[data-open-task], [data-task-id]').forEach(node => {
    const id = node.dataset.openTask || node.dataset.taskId;
    const task = state.tasks.find(item => item.id === id);
    if (!isRecurringTask(task)) return;
    node.classList.add('is-recurring-task');
    if (node.querySelector('.recurrence-context-badge')) return;
    const badge = document.createElement('span');
    badge.innerHTML = recurrenceBadgeHTML(task, true);
    const actual = badge.firstElementChild;
    if (!actual) return;
    const target = node.querySelector('.task-card-top') || node.querySelector('.task-row-title>div') || node.querySelector('.timeline-content') || node.querySelector('.day-item-main') || node.querySelector('.person-preview-task') || node.querySelector('.notification-item-copy');
    if (target) target.appendChild(actual);
  });
  refreshIcons();
}
function renderRecurringTodayStrip() {
  const metrics = document.querySelector('#viewHoje .metric-grid');
  if (!metrics) return;
  document.querySelector('#viewHoje .recurring-today-strip')?.remove();
  if (!state.recurrenceReady) return;
  const relevant = state.recurringSeries.filter(series => recurrenceSeriesAppliesToDate(series, todayKey()) && seriesHasAssignee(series, state.me?.id));
  if (!relevant.length) return;
  const done = relevant.filter(series => {
    const occ = state.recurringOccurrences.find(o => o.recorrencia_id === series.id && o.data_referencia === todayKey());
    const task = occ?.tarefa_id ? state.tasks.find(t => t.id === occ.tarefa_id) : null;
    return task?.status === 'concluida';
  }).length;
  const strip = document.createElement('section');
  strip.className = 'recurring-today-strip';
  strip.innerHTML = `<span><i data-lucide="repeat-2"></i></span><div><strong>${relevant.length} rotina${relevant.length === 1 ? '' : 's'} recorrente${relevant.length === 1 ? '' : 's'} prevista${relevant.length === 1 ? '' : 's'} hoje</strong><small>${done} concluída${done === 1 ? '' : 's'} · ${Math.max(0,relevant.length-done)} ainda pede${relevant.length-done === 1 ? '' : 'm'} atenção. Elas continuam aparecendo como demandas normais nas outras telas.</small></div>${isManager() ? `<button type="button" class="btn soft" data-open-recurrence-manager><i data-lucide="repeat-2"></i>Gerenciar rotinas</button>` : `<button type="button" class="btn soft" data-show-recurring-tasks><i data-lucide="list-filter"></i>Ver recorrentes</button>`}`;
  metrics.insertAdjacentElement('afterend', strip);
}
function decorateAgendaRecurringPreviews() {
  if (!state.recurrenceReady) return;
  const existingKeys = new Set(state.tasks.filter(isRecurringTask).map(task => `${task.recorrencia_id}:${task.recorrencia_data || taskDueKey(task)}`));
  const today = todayKey();
  $$('#calendarGrid [data-calendar-date]').forEach(cell => {
    const key = cell.dataset.calendarDate;
    if (key < today) return;
    const previews = state.recurringSeries.filter(series => recurrenceRelevantForAgenda(series) && recurrenceSeriesAppliesToDate(series,key) && !existingKeys.has(`${series.id}:${key}`));
    if (!previews.length) return;
    const events = cell.querySelector('.calendar-events');
    previews.slice(0, Math.max(0,3-events.children.length)).forEach(series => {
      const span = document.createElement('span');
      span.className = 'calendar-event recurring-preview';
      span.title = `${series.titulo} · ${recurrenceFrequencyLabel(series)}`;
      span.textContent = `↻ ${series.titulo}`;
      events.appendChild(span);
    });
  });
  const selected = state.selectedDate;
  const container = $('selectedDayItems');
  if (!container || selected < today) return;
  const previews = state.recurringSeries.filter(series => recurrenceRelevantForAgenda(series) && recurrenceSeriesAppliesToDate(series,selected) && !existingKeys.has(`${series.id}:${selected}`));
  previews.forEach(series => {
    if (container.querySelector(`[data-open-recurring-series="${series.id}"]`)) return;
    if (container.querySelector('.empty-state')) container.innerHTML = '';
    const person = collaborator(series.responsavel_id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'day-item enriched is-recurring-task';
    item.dataset.openRecurringSeries = series.id;
    item.innerHTML = `<span class="day-item-symbol task"><i data-lucide="repeat-2"></i></span><div class="day-item-main"><div class="day-item-head"><i class="day-item-type task"></i><small>${escapeHtml(String(series.horario_prazo || '17:00').slice(0,5))} · Rotina prevista</small></div><strong>${escapeHtml(series.titulo)}</strong><span>${escapeHtml(person?.nome || 'Sem responsável')}</span>${recurrenceBadgeHTML({recorrencia_id:series.id},true)}</div>`;
    container.appendChild(item);
  });
  refreshIcons();
}

const filteredTasksBeforeRecurringV36 = filteredTasks;
filteredTasks = function filteredTasksRecurringIntegrated() {
  let tasks = filteredTasksBeforeRecurringV36();
  const filter = $('taskRecurrenceFilter')?.value || '';
  if (filter === 'recorrentes') tasks = tasks.filter(isRecurringTask);
  if (filter === 'nao_recorrentes') tasks = tasks.filter(task => !isRecurringTask(task));
  return tasks;
};
const taskCardHTMLBeforeRecurringV36 = taskCardHTML;
taskCardHTML = function taskCardHTMLRecurring(task) {
  let html = taskCardHTMLBeforeRecurringV36(task);
  if (!isRecurringTask(task)) return html;
  html = html.replace('<span class="task-card-id">', `${recurrenceBadgeHTML(task,true)}<span class="task-card-id">`);
  return html.replace('class="task-card"', 'class="task-card is-recurring-task"');
};

function recurrenceOccurrenceStatus(occ) {
  if (!occ) return { label:'Prevista', tone:'', icon:'calendar-clock' };
  if (occ.estado === 'pulada') return { label:'Pulada', tone:'skipped', icon:'skip-forward' };
  if (occ.estado === 'nao_realizada') return { label:'Não realizada', tone:'missed', icon:'circle-x' };
  const task = occ.tarefa_id ? state.tasks.find(item => item.id === occ.tarefa_id) : null;
  if (task?.status === 'concluida') return { label:'Concluída', tone:'done', icon:'circle-check-big' };
  if (task?.status === 'revisao') return { label:'Em revisão', tone:'review', icon:'scan-eye' };
  if (task?.status === 'andamento') return { label:'Em andamento', tone:'', icon:'loader-circle' };
  if (task) return { label:'Criada', tone:'', icon:'circle-dot-dashed' };
  return { label:'Prevista', tone:'', icon:'calendar-clock' };
}
function recurrenceTaskPanelHTML(task) {
  const series = recurrenceSeriesForTask(task);
  if (!series) return '';
  const occs = state.recurringOccurrences.filter(item => item.recorrencia_id === series.id).sort((a,b) => String(b.data_referencia).localeCompare(String(a.data_referencia)));
  const past = occs.filter(item => item.data_referencia <= todayKey());
  const done = past.filter(item => recurrenceOccurrenceStatus(item).tone === 'done').length;
  const valid = past.filter(item => item.estado !== 'pulada').length;
  const compliance = valid ? Math.round(done / valid * 100) : 0;
  const history = occs.slice(0,10).map(item => {
    const status = recurrenceOccurrenceStatus(item);
    return `<div class="recurrence-history-row ${status.tone} ${item.data_referencia === task.recorrencia_data ? 'current' : ''}"><span class="recurrence-history-icon"><i data-lucide="${status.icon}"></i></span><strong>${formatDate(`${item.data_referencia}T12:00:00`)}</strong><span class="recurrence-history-status"><i data-lucide="${status.icon}"></i>${escapeHtml(status.label)}</span></div>`;
  }).join('') || `<div class="recurrence-history-empty">O histórico começa conforme a rotina é executada.</div>`;
  const status = recurrenceSeriesStatus(series);
  const managerActions = isManager() ? `<div class="recurrence-actions"><button type="button" class="btn secondary" data-edit-recurrence="${series.id}"><i data-lucide="calendar-sync"></i>Editar toda a série</button>${task.recorrencia_data === todayKey() && task.status !== 'concluida' ? `<button type="button" class="btn secondary" data-skip-recurrence="${series.id}" data-skip-date="${task.recorrencia_data}"><i data-lucide="skip-forward"></i>Pular hoje</button>` : ''}${status !== 'ended' ? `<button type="button" class="btn soft" data-toggle-recurrence="${series.id}" data-next-active="${status === 'active' ? 'false' : 'true'}"><i data-lucide="${status === 'active' ? 'pause' : 'play'}"></i>${status === 'active' ? 'Pausar série' : 'Retomar série'}</button><button type="button" class="btn danger-soft" data-end-recurrence="${series.id}"><i data-lucide="square"></i>Encerrar série</button>` : ''}</div>` : '';
  return `<section class="task-recurrence-panel integrated"><div class="productivity-card-head"><div><span class="eyebrow">Recorrência</span><h3>Esta demanda volta automaticamente</h3></div><span class="recurrence-state ${status === 'paused' ? 'paused' : ''}"><i data-lucide="repeat-2"></i>${escapeHtml(recurrenceStatusLabel(series))}</span></div><div class="recurrence-summary-grid"><div><span>Frequência</span><strong>${escapeHtml(recurrenceFrequencyLabel(series))}</strong></div><div><span>Período</span><strong>${escapeHtml(recurrencePeriodLabel(series))}</strong></div><div><span>Popup diário</span><strong>${series.alerta_diario ? `${String(series.horario_alerta || '09:00').slice(0,5)} · ligado` : 'Desligado'}</strong></div></div><div class="recurrence-history"><div class="recurrence-history-head"><strong>Histórico da série</strong><span>${compliance}% de cumprimento</span></div>${history}</div>${managerActions}</section>`;
}
function injectRecurrenceTaskPanelV36() {
  const task = state.selectedTask;
  if (!isRecurringTask(task)) return;
  const root = $('taskDrawerContent');
  if (!root || root.querySelector('.task-recurrence-panel.integrated')) return;
  const panel = document.createElement('div');
  panel.innerHTML = recurrenceTaskPanelHTML(task);
  const node = panel.firstElementChild;
  const statusSection = root.querySelector('.task-status-section');
  if (node) root.insertBefore(node, statusSection || root.firstChild);
  refreshIcons();
}
const renderTaskDrawerBeforeRecurringV36 = renderTaskDrawer;
renderTaskDrawer = function renderTaskDrawerRecurringIntegrated() {
  renderTaskDrawerBeforeRecurringV36();
  injectRecurrenceTaskPanelV36();
};

function populateRecurrenceAssigneeSelect(selected = '') {
  const select = $('recurrenceEditAssignee'); if (!select) return;
  select.innerHTML = `<option value="">Sem responsável</option>${state.collaborators.map(person => `<option value="${person.id}">${escapeHtml(person.nome)}</option>`).join('')}`; select.value = selected || '';
}
function fillRecurrenceEditor(series, { convertTask = null } = {}) {
  const converting = Boolean(convertTask);
  $('recurrenceEditId').value = series?.id || '';
  $('recurrenceConvertTaskId').value = convertTask?.id || '';
  $('recurrenceModalTitle').textContent = converting ? 'Transformar em demanda recorrente' : 'Editar toda a recorrência';
  $('recurrenceModalDescription').textContent = converting ? 'A demanda atual será mantida como primeira ocorrência e as próximas serão criadas automaticamente.' : 'As alterações valem para as próximas ocorrências. O histórico anterior permanece intacto.';
  const source = series || convertTask || {};
  $('recurrenceEditTitle').value = source.titulo || '';
  $('recurrenceEditDescription').value = source.descricao || '';
  const recurrenceAssigneeIds = series ? seriesAssigneeIds(series) : (convertTask ? taskAssigneeIds(convertTask) : (source.responsavel_id ? [source.responsavel_id] : [])); populateRecurrenceAssigneeSelect(recurrenceAssigneeIds[0] || ''); setAssigneeJson('recurrenceEditAssigneesJson', recurrenceAssigneeIds); renderAssigneePreview('recurrenceEditAssignee','recurrenceEditAssigneePreview');
  $('recurrenceEditPriority').value = source.prioridade || 'media';
  $('recurrenceEditSize').value = source.tamanho || 'media';
  if ($('recurrenceEditResponsibilityMode')) $('recurrenceEditResponsibilityMode').value = series?.modo_responsabilidade || taskResponsibilityModeV371(convertTask) || 'compartilhada';
  syncChoiceCards('recurrenceEditResponsibilityMode');
  $('recurrenceEditEstimate').value = source.estimativa_horas || '';
  $('recurrenceEditProject').value = source.projeto || '';
  $('recurrenceEditTags').value = (source.tags || []).join(', ');
  $('recurrenceEditChecklist').value = checklistToText(source.checklist || []);
  $('recurrenceEditFrequency').value = series?.frequencia || 'dias_uteis';
  $('recurrenceEditStart').value = series?.data_inicio || convertTask?.recorrencia_data || taskDueKey(convertTask) || todayKey();
  $('recurrenceEditEnd').value = series?.data_fim || '';
  setWeekdays('recurrenceEditWeekdays', series?.dias_semana?.length ? series.dias_semana : [1,2,3,4,5]);
  const due = convertTask ? splitDateTime(taskDue(convertTask)).time : null;
  $('recurrenceEditDueTime').value = String(series?.horario_prazo || due || '17:00').slice(0,5);
  $('recurrenceEditAlertTime').value = String(series?.horario_alerta || '09:00').slice(0,5);
  $('recurrenceEditDailyAlert').checked = series ? Boolean(series.alerta_diario) : true;
  if ($('recurrenceEditSupplier')) {
    const supplierValue = series?.fornecedor_id || convertTask?.fornecedor_id || '';
    $('recurrenceEditSupplier').innerHTML = supplierOptionsV1B(supplierValue);
    $('recurrenceEditSupplier').value = supplierValue ? String(supplierValue) : '';
  }
  $('recurrenceEditSupplierField')?.classList.toggle('hidden', !state.supplierLinksReadyV1B);
  $('recurrenceSeriesStatus').textContent = converting ? 'Nova série' : `Série ${recurrenceStatusLabel(series).toLowerCase()}`;
  $('recurrencePauseBtn').classList.toggle('hidden', converting || recurrenceSeriesStatus(series) === 'ended');
  $('recurrenceEndBtn').classList.toggle('hidden', converting || recurrenceSeriesStatus(series) === 'ended');
  if (!converting) {
    const active = recurrenceSeriesStatus(series) === 'active';
    $('recurrencePauseBtn').innerHTML = `<i data-lucide="${active ? 'pause' : 'play'}"></i>${active ? 'Pausar' : 'Retomar'}`;
    $('recurrencePauseBtn').dataset.nextActive = active ? 'false' : 'true';
  }
  recurrenceFormWeekdayVisibility('edit');
  $('recurrenceModal').classList.remove('hidden');
  refreshIcons();
}
function openRecurrenceEditorById(id) {
  const series = recurrenceSeriesById(id);
  if (!series) return toast('Série recorrente não encontrada.', 'error');
  fillRecurrenceEditor(series);
}
async function saveRecurrenceSeriesV36(event) {
  event.preventDefault();
  const convertTaskId = $('recurrenceConvertTaskId').value;
  const id = $('recurrenceEditId').value;
  const frequency = $('recurrenceEditFrequency').value;
  const weekdays = selectedWeekdays('recurrenceEditWeekdays');
  if (['semanal','personalizada'].includes(frequency) && !weekdays.length) return toast('Selecione pelo menos um dia da semana.', 'error');
  const start = $('recurrenceEditStart').value;
  const end = $('recurrenceEditEnd').value || null;
  const responsibilityMode = $('recurrenceEditResponsibilityMode')?.value || 'compartilhada';
  const recurrenceAssignees = selectedFormAssigneeIdsV37('recurrenceEdit');
  if (responsibilityMode === 'primeiro_cumprir' && recurrenceAssignees.length < 2) return toast('No modo Primeiro a cumprir, selecione pelo menos duas pessoas candidatas.', 'error');
  if (!start) return toast('Informe quando a recorrência começa.', 'error');
  if (end && end < start) return toast('A data final não pode ser anterior ao início.', 'error');
  setLoading(true);
  try {
    let seriesId = id;
    if (convertTaskId) {
      const { data, error } = await db.rpc('converter_tarefa_em_recorrente_v1', {
        p_tarefa_id: convertTaskId,
        p_frequencia: frequency,
        p_dias_semana: weekdays,
        p_data_inicio: start,
        p_data_fim: end,
        p_horario_prazo: $('recurrenceEditDueTime').value || '17:00',
        p_horario_alerta: $('recurrenceEditAlertTime').value || '09:00',
        p_alerta_diario: Boolean($('recurrenceEditDailyAlert').checked)
      });
      if (error) throw error;
      seriesId = data;
    }
    const { error } = await db.rpc('editar_demanda_recorrente_v1', {
      p_id: seriesId,
      p_titulo: $('recurrenceEditTitle').value.trim(),
      p_descricao: $('recurrenceEditDescription').value.trim() || null,
      p_prioridade: $('recurrenceEditPriority').value,
      p_responsavel_id: responsibilityMode === 'primeiro_cumprir' ? null : (recurrenceAssignees[0] || null),
      p_tags: $('recurrenceEditTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
      p_tamanho: $('recurrenceEditSize').value,
      p_estimativa_horas: $('recurrenceEditEstimate').value ? Number($('recurrenceEditEstimate').value) : null,
      p_projeto: $('recurrenceEditProject').value.trim() || null,
      p_checklist: checklistFromText($('recurrenceEditChecklist').value || ''),
      p_frequencia: frequency,
      p_dias_semana: weekdays,
      p_data_inicio: start,
      p_data_fim: end,
      p_horario_prazo: $('recurrenceEditDueTime').value || '17:00',
      p_horario_alerta: $('recurrenceEditAlertTime').value || '09:00',
      p_alerta_diario: Boolean($('recurrenceEditDailyAlert').checked)
    });
    if (error) throw error;
    if (seriesId && state.multiAssigneeReady) {
      const { error: assigneeError } = await db.rpc('definir_responsaveis_recorrencia_modo_v1', {
        p_recorrencia_id: seriesId,
        p_responsaveis: recurrenceAssignees,
        p_modo: responsibilityMode,
        p_aplicar_ocorrencias: true
      });
      if (assigneeError) throw assigneeError;
    }
    if (seriesId && state.supplierLinksReadyV1B) {
      const supplierId = $('recurrenceEditSupplier')?.value || null;
      if (!await linkRecurringSupplierV2(seriesId, supplierId)) throw new Error('A recorrência foi atualizada, mas o fornecedor não pôde ser vinculado.');
    }
    closeModal('recurrenceModal');
    await refreshData();
    if (convertTaskId && state.tasks.some(task => task.id === convertTaskId)) await openTask(convertTaskId);
    renderRecurrenceManagerV36();
    toast(convertTaskId ? 'Demanda transformada em recorrente.' : 'Recorrência atualizada.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}
async function toggleRecurrenceSeriesV36(id, active) {
  setLoading(true);
  try {
    const { error } = await db.rpc('alternar_demanda_recorrente', { p_id: id, p_ativa: active });
    if (error) throw error;
    await refreshData();
    if (state.selectedTask?.recorrencia_id === id) await openTask(state.selectedTask.id);
    renderRecurrenceManagerV36();
    toast(active ? 'Recorrência retomada.' : 'Recorrência pausada.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}
async function endRecurrenceSeriesV36(id) {
  if (!confirm('Encerrar esta recorrência? O histórico será preservado e nenhuma nova ocorrência será criada.')) return;
  setLoading(true);
  try {
    const { error } = await db.rpc('encerrar_demanda_recorrente', { p_id: id });
    if (error) throw error;
    await refreshData(); renderRecurrenceManagerV36();
    if (state.selectedTask?.recorrencia_id === id) await openTask(state.selectedTask.id);
    toast('Recorrência encerrada.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}
async function skipRecurrenceV36(id, key = todayKey()) {
  if (!confirm(`Pular a ocorrência de ${formatDate(`${key}T12:00:00`)}? A série continua nos próximos dias.`)) return;
  setLoading(true);
  try {
    const { error } = await db.rpc('pular_ocorrencia_recorrente', { p_id: id, p_data: key });
    if (error) throw error;
    closeDrawer('taskDrawer');
    await refreshData(); renderRecurrenceManagerV36();
    toast('Ocorrência pulada. A série continua normalmente.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
}

const openEditTaskBeforeRecurringV36 = openEditTask;
openEditTask = function openEditTaskRecurringIntegrated() {
  openEditTaskBeforeRecurringV36();
  const task = state.selectedTask;
  const series = recurrenceSeriesForTask(task);
  $('editTaskRecurrenceContext')?.classList.toggle('hidden', !series);
  $('editTaskConvertRecurrence')?.classList.toggle('hidden', Boolean(series) || !isManager() || task?.status === 'concluida' || task?.arquivada_em || !state.recurrenceReady);
  if (series) $('editTaskRecurrenceSummary').textContent = `${recurrenceFrequencyLabel(series)} · ${recurrencePeriodLabel(series)}. Salvar aqui altera somente ${task.recorrencia_data ? formatDate(`${task.recorrencia_data}T12:00:00`) : 'esta ocorrência'}.`;
  refreshIcons();
};

const openTransferTaskBeforeRecurringV36 = openTransferTask;
openTransferTask = function openTransferTaskRecurringIntegrated(taskId = state.selectedTask?.id) {
  openTransferTaskBeforeRecurringV36(taskId);
  const task = state.tasks.find(item => item.id === taskId);
  const recurring = isRecurringTask(task);
  $('transferRecurrenceScope')?.classList.toggle('hidden', !recurring);
  if ($('transferApplySeries')) $('transferApplySeries').checked = false;
};
const submitTransferTaskBeforeRecurringV36 = submitTransferTask;
submitTransferTask = async function submitTransferTaskRecurringIntegrated(event) {
  const taskId = $('transferTaskId')?.value;
  const task = state.tasks.find(item => item.id === taskId);
  if (!isRecurringTask(task) || !$('transferApplySeries')?.checked) return submitTransferTaskBeforeRecurringV36(event);
  event.preventDefault();
  const personId = $('transferAssignee').value;
  const note = $('transferNote').value.trim();
  if (!personId) return toast('Selecione quem receberá a demanda.', 'error');
  setLoading(true);
  try {
    const { error } = await db.rpc('transferir_demanda_recorrente_v1', { p_id: task.recorrencia_id, p_tarefa_id: taskId, p_novo_responsavel_id: personId, p_aplicar_ocorrencia_atual: true, p_observacao: note || null });
    if (error) throw error;
    closeModal('transferTaskModal'); await refreshData(); await dispatchPendingPush(); await openTask(taskId);
    toast('Responsável alterado nesta ocorrência e nas próximas da série.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
};

function renderRecurrenceManagerV36() {
  const list = $('recurrenceManagerList');
  if (!list) return;
  const query = ($('recurrenceManagerSearch')?.value || state.recurrenceManagerSearch || '').trim().toLowerCase();
  const filter = $('recurrenceManagerStatus')?.value || state.recurrenceManagerStatus || '';
  let items = [...state.recurringSeries];
  if (query) items = items.filter(series => [series.titulo,series.descricao,series.projeto,collaborator(series.responsavel_id)?.nome].join(' ').toLowerCase().includes(query));
  if (filter === 'ativas') items = items.filter(series => recurrenceSeriesStatus(series) === 'active');
  if (filter === 'pausadas') items = items.filter(series => recurrenceSeriesStatus(series) === 'paused');
  if (filter === 'encerradas') items = items.filter(series => recurrenceSeriesStatus(series) === 'ended');
  const active = state.recurringSeries.filter(series => recurrenceSeriesStatus(series) === 'active');
  const today = active.filter(series => recurrenceSeriesAppliesToDate(series,todayKey()));
  const paused = state.recurringSeries.filter(series => recurrenceSeriesStatus(series) === 'paused');
  const missed = state.recurringOccurrences.filter(item => item.estado === 'nao_realizada').length;
  $('recurrenceManagerSummary').innerHTML = `<div><span>Séries ativas</span><strong>${active.length}</strong></div><div><span>Previstas hoje</span><strong>${today.length}</strong></div><div><span>Pausadas</span><strong>${paused.length}</strong></div><div><span>Não realizadas</span><strong>${missed}</strong></div>`;
  list.innerHTML = items.length ? items.map(series => {
    const person = collaborator(series.responsavel_id);
    const status = recurrenceSeriesStatus(series);
    const occurrences = state.recurringOccurrences.filter(item => item.recorrencia_id === series.id);
    const completed = occurrences.filter(item => recurrenceOccurrenceStatus(item).tone === 'done').length;
    return `<article class="recurrence-manager-item"><div class="recurrence-manager-item-main"><div class="recurrence-manager-item-top"><span class="recurrence-state ${status === 'paused' ? 'paused' : ''}"><i data-lucide="repeat-2"></i>${escapeHtml(recurrenceStatusLabel(series))}</span>${series.projeto ? `<span class="project-pill"><i data-lucide="folder-kanban"></i>${escapeHtml(series.projeto)}</span>` : ''}</div><h4>${escapeHtml(series.titulo)}</h4><p>${escapeHtml(series.descricao || 'Sem descrição.')}</p><div class="recurrence-manager-item-meta"><span><i data-lucide="calendar-sync"></i>${escapeHtml(recurrenceFrequencyLabel(series))}</span><span><i data-lucide="user-round"></i>${escapeHtml(person?.nome || 'Sem responsável')}</span><span><i data-lucide="clock-3"></i>${String(series.horario_prazo || '17:00').slice(0,5)}</span><span><i data-lucide="circle-check-big"></i>${completed} concluída(s)</span></div></div><div class="recurrence-manager-item-actions"><button type="button" class="btn secondary" data-edit-recurrence="${series.id}"><i data-lucide="pencil"></i>Editar</button>${status !== 'ended' ? `<button type="button" class="btn soft" data-toggle-recurrence="${series.id}" data-next-active="${status === 'active' ? 'false' : 'true'}"><i data-lucide="${status === 'active' ? 'pause' : 'play'}"></i>${status === 'active' ? 'Pausar' : 'Retomar'}</button><button type="button" class="btn danger-soft" data-end-recurrence="${series.id}"><i data-lucide="square"></i>Encerrar</button>` : ''}</div></article>`;
  }).join('') : `<div class="recurrence-manager-empty"><i data-lucide="repeat-2"></i><br>Nenhuma rotina recorrente encontrada com estes filtros.</div>`;
  refreshIcons();
}
function openRecurrenceManagerV36() {
  if (!isManager()) return toast('Somente gestores podem gerenciar séries recorrentes.', 'error');
  renderRecurrenceManagerV36();
  $('recurrenceManagerModal').classList.remove('hidden');
  refreshIcons();
}

function appendRecurringProjectIntegrationV36() {
  const detail = $('projectDetail');
  if (!detail || detail.classList.contains('hidden') || !state.selectedProjectId) return;
  detail.querySelector('.project-recurring-series')?.remove();
  const project = projectCatalog().find(item => item.id === state.selectedProjectId || item.nome === state.selectedProjectId);
  if (!project) return;
  const items = state.recurringSeries.filter(series => String(series.projeto || '') === String(project.nome || '') && recurrenceSeriesStatus(series) !== 'ended');
  if (!items.length) return;
  const section = document.createElement('section');
  section.className = 'productivity-card project-recurring-series';
  section.innerHTML = `<div class="productivity-card-head"><div><span class="eyebrow">Rotinas recorrentes</span><h3>${items.length} série${items.length === 1 ? '' : 's'} vinculada${items.length === 1 ? '' : 's'} ao projeto</h3></div><span class="recurrence-state"><i data-lucide="repeat-2"></i>Automáticas</span></div><div class="recurrence-manager-list">${items.map(series => `<button type="button" class="recurrence-manager-item" data-open-recurring-series="${series.id}"><div class="recurrence-manager-item-main"><h4>${escapeHtml(series.titulo)}</h4><p>${escapeHtml(recurrenceFrequencyLabel(series))} · ${escapeHtml(seriesAssigneeShortNames(series))}</p></div><i data-lucide="chevron-right"></i></button>`).join('')}</div>`;
  detail.appendChild(section);
  refreshIcons();
}
function appendTeamRecurringIntegrationV36() {
  $$('#teamGrid [data-open-person]').forEach(card => {
    const personId = card.dataset.openPerson;
    const count = state.recurringSeries.filter(series => seriesHasAssignee(series, personId) && recurrenceSeriesStatus(series) === 'active').length;
    if (!count || card.querySelector('.team-recurring-chip')) return;
    const line = card.querySelector('.person-state-line') || card.querySelector('.person-copy');
    line?.insertAdjacentHTML('beforeend', `<span class="team-recurring-chip"><i data-lucide="repeat-2"></i>${count} rotina${count === 1 ? '' : 's'}</span>`);
  });
  refreshIcons();
}
function appendPersonRecurringIntegrationV36(person) {
  const root = $('personDrawerContent');
  if (!root || !person) return;
  root.querySelector('.person-recurring-series')?.remove();
  const items = state.recurringSeries.filter(series => seriesHasAssignee(series, person.id) && recurrenceSeriesStatus(series) !== 'ended');
  if (!items.length) return;
  const section = document.createElement('section');
  section.className = 'person-drawer-section person-recurring-series';
  section.innerHTML = `<div class="person-section-head"><div><span class="eyebrow">Recorrências</span><h3>Rotinas sob responsabilidade</h3></div><span>${items.length}</span></div><div class="recurrence-manager-list">${items.map(series => `<button type="button" class="recurrence-manager-item" data-open-recurring-series="${series.id}"><div class="recurrence-manager-item-main"><h4>${escapeHtml(series.titulo)}</h4><p>${escapeHtml(recurrenceFrequencyLabel(series))} · ${escapeHtml(recurrencePeriodLabel(series))}</p></div><i data-lucide="chevron-right"></i></button>`).join('')}</div>`;
  root.appendChild(section); refreshIcons();
}
function appendRecurringNotificationsV36() {
  $$('#notificationList .notification-item[data-task-id]').forEach(item => {
    const task = state.tasks.find(task => task.id === item.dataset.taskId);
    if (!isRecurringTask(task) || item.querySelector('.recurrence-context-badge')) return;
    item.querySelector('.notification-item-copy')?.insertAdjacentHTML('beforeend', recurrenceBadgeHTML(task,true));
  });
  refreshIcons();
}
function appendRecurringReportV36() {
  const root = $('monthlyReportContent');
  if (!root || root.querySelector('.recurrence-report')) return;
  const value = $('monthlyReportMonth')?.value || monthInputValue();
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return;
  const prefix = `${year}-${String(month).padStart(2,'0')}`;
  const occurrences = state.recurringOccurrences.filter(item => String(item.data_referencia).startsWith(prefix));
  if (!occurrences.length) return;
  const done = occurrences.filter(item => recurrenceOccurrenceStatus(item).tone === 'done').length;
  const missed = occurrences.filter(item => item.estado === 'nao_realizada').length;
  const skipped = occurrences.filter(item => item.estado === 'pulada').length;
  const valid = Math.max(1, occurrences.length - skipped);
  const compliance = Math.round(done / valid * 100);
  const grouped = [...new Set(occurrences.map(item => item.recorrencia_id))].map(id => {
    const series = recurrenceSeriesById(id);
    const rows = occurrences.filter(item => item.recorrencia_id === id);
    const completed = rows.filter(item => recurrenceOccurrenceStatus(item).tone === 'done').length;
    return { series, total: rows.length, completed };
  }).filter(item => item.series).sort((a,b) => b.total - a.total).slice(0,8);
  root.insertAdjacentHTML('beforeend', `<section class="recurrence-report"><div class="recurrence-report-head"><div><span class="eyebrow">Rotinas recorrentes</span><h4>Cumprimento das ocorrências no mês</h4></div><span class="recurrence-state"><i data-lucide="repeat-2"></i>${compliance}%</span></div><div class="recurrence-report-grid"><div><span>Ocorrências</span><strong>${occurrences.length}</strong></div><div><span>Concluídas</span><strong>${done}</strong></div><div><span>Não realizadas</span><strong>${missed}</strong></div><div><span>Puladas</span><strong>${skipped}</strong></div></div><div class="recurrence-report-list">${grouped.map(item => `<div class="recurrence-report-row"><strong>${escapeHtml(item.series.titulo)}</strong><span>${item.completed}/${item.total} concluídas</span><span>${Math.round(item.completed/Math.max(1,item.total)*100)}%</span></div>`).join('')}</div></section>`);
  refreshIcons();
}

const renderTodayBeforeRecurringV36 = renderToday;
renderToday = function renderTodayRecurringIntegrated() { renderTodayBeforeRecurringV36(); renderRecurringTodayStrip(); decorateRecurringTaskNodes($('viewHoje')); };
const renderAgendaBeforeRecurringV36 = renderAgenda;
renderAgenda = function renderAgendaRecurringIntegrated() { renderAgendaBeforeRecurringV36(); decorateAgendaRecurringPreviews(); decorateRecurringTaskNodes($('viewAgenda')); };
const renderDemandasBeforeRecurringV36 = renderDemandas;
renderDemandas = function renderDemandasRecurringIntegrated() { renderDemandasBeforeRecurringV36(); decorateRecurringTaskNodes($('viewDemandas')); };
const renderProjectsBeforeRecurringV36 = renderProjects;
renderProjects = function renderProjectsRecurringIntegrated() { renderProjectsBeforeRecurringV36(); decorateRecurringTaskNodes($('viewProjetos')); appendRecurringProjectIntegrationV36(); };
const renderEquipeBeforeRecurringV36 = renderEquipe;
renderEquipe = function renderEquipeRecurringIntegrated() { renderEquipeBeforeRecurringV36(); decorateRecurringTaskNodes($('viewEquipe')); appendTeamRecurringIntegrationV36(); };
const renderNotificationsBeforeRecurringV36 = renderNotifications;
renderNotifications = function renderNotificationsRecurringIntegrated() { renderNotificationsBeforeRecurringV36(); appendRecurringNotificationsV36(); };
const renderMonthlyReportBeforeRecurringV36 = renderMonthlyReport;
renderMonthlyReport = function renderMonthlyReportRecurringIntegrated() { renderMonthlyReportBeforeRecurringV36(); appendRecurringReportV36(); };
const renderPersonDrawerBeforeRecurringV36 = renderPersonDrawer;
renderPersonDrawer = function renderPersonDrawerRecurringIntegrated(person) { renderPersonDrawerBeforeRecurringV36(person); appendPersonRecurringIntegrationV36(person); };
const renderIntrusiveBeforeRecurringV36 = renderIntrusiveNotification;
renderIntrusiveNotification = function renderIntrusiveRecurringIntegrated(notification) {
  renderIntrusiveBeforeRecurringV36(notification);
  const task = notification?.tarefa_id ? state.tasks.find(item => item.id === notification.tarefa_id) : null;
  if (isRecurringTask(task)) {
    const type = $('intrusiveNotificationCard')?.querySelector('.intrusive-notification-type');
    if (type) type.textContent = task.prioridade === 'imediata' ? 'DEMANDA RECORRENTE IMEDIATA' : 'DEMANDA RECORRENTE';
    $('intrusiveNotificationCard')?.classList.add('recurring-alert');
  }
};
const renderGlobalSearchBeforeRecurringV36 = renderGlobalSearch;
renderGlobalSearch = function renderGlobalSearchRecurringIntegrated() {
  renderGlobalSearchBeforeRecurringV36();
  const query = $('globalSearchInput')?.value.trim().toLowerCase();
  if (!query || !state.recurrenceReady) return;
  const matches = state.recurringSeries.filter(series => [series.titulo,series.descricao,series.projeto,collaborator(series.responsavel_id)?.nome].join(' ').toLowerCase().includes(query)).slice(0,6);
  if (!matches.length) return;
  $('globalSearchResults').insertAdjacentHTML('beforeend', `<div class="search-group-label">Rotinas recorrentes</div>${matches.map(series => `<button type="button" class="search-result" data-search-recurring="${series.id}"><span class="search-result-icon"><i data-lucide="repeat-2"></i></span><span><strong>${escapeHtml(series.titulo)}</strong><small>${escapeHtml(recurrenceFrequencyLabel(series))} · ${escapeHtml(seriesAssigneeShortNames(series))}</small></span><i data-lucide="chevron-right"></i></button>`).join('')}`);
  refreshIcons();
};

function bindRecurringV36Events() {
  $('itemRecurringEnabled')?.addEventListener('change', syncCreateRecurrenceUI);
  $('itemRecurrenceFrequency')?.addEventListener('change', () => recurrenceFormWeekdayVisibility('item'));
  $('recurrenceEditFrequency')?.addEventListener('change', () => recurrenceFormWeekdayVisibility('edit'));
  $('recurrenceForm')?.addEventListener('submit', saveRecurrenceSeriesV36);
  $('taskRecurrenceFilter')?.addEventListener('change', renderDemandas);
  $('recurrenceManagerBtn')?.addEventListener('click', openRecurrenceManagerV36);
  $('recurrenceManagerNewBtn')?.addEventListener('click', () => { closeModal('recurrenceManagerModal'); openQuickAdd('demanda', { recurring:true, recurrenceStart:todayKey() }); });
  $('recurrenceManagerSearch')?.addEventListener('input', debounce(event => { state.recurrenceManagerSearch = event.target.value; renderRecurrenceManagerV36(); },120));
  $('recurrenceManagerStatus')?.addEventListener('change', event => { state.recurrenceManagerStatus = event.target.value; renderRecurrenceManagerV36(); });
  $('editTaskOpenSeriesBtn')?.addEventListener('click', () => { const series = recurrenceSeriesForTask(state.selectedTask); if (series) { closeModal('editTaskModal'); fillRecurrenceEditor(series); } });
  $('editTaskConvertRecurrenceBtn')?.addEventListener('click', () => { const task = state.selectedTask; if (task) { closeModal('editTaskModal'); fillRecurrenceEditor(null,{convertTask:task}); } });
  $('recurrencePauseBtn')?.addEventListener('click', () => { const id=$('recurrenceEditId').value; if(id) toggleRecurrenceSeriesV36(id,$('recurrencePauseBtn').dataset.nextActive==='true'); });
  $('recurrenceEndBtn')?.addEventListener('click', () => { const id=$('recurrenceEditId').value; if(id) endRecurrenceSeriesV36(id); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) processRecurringV36({ refresh:true }); });
  document.addEventListener('click', event => {
    const manager = event.target.closest('[data-open-recurrence-manager]'); if (manager) { openRecurrenceManagerV36(); return; }
    const showRecurring = event.target.closest('[data-show-recurring-tasks]'); if (showRecurring) { state.smartFilter=''; switchView('demandas'); if($('taskRecurrenceFilter')) $('taskRecurrenceFilter').value='recorrentes'; if($('taskAssigneeFilter')) $('taskAssigneeFilter').value=state.me?.id||''; renderDemandas(); return; }
    const edit = event.target.closest('[data-edit-recurrence]'); if (edit) { openRecurrenceEditorById(edit.dataset.editRecurrence); return; }
    const open = event.target.closest('[data-open-recurring-series]'); if (open) { if (isManager()) openRecurrenceEditorById(open.dataset.openRecurringSeries); else { const task=state.tasks.find(t=>t.recorrencia_id===open.dataset.openRecurringSeries&&!t.arquivada_em); if(task) openTask(task.id); else toast('Esta rotina ainda não tem uma ocorrência aberta.'); } return; }
    const toggle = event.target.closest('[data-toggle-recurrence]'); if (toggle) { toggleRecurrenceSeriesV36(toggle.dataset.toggleRecurrence,toggle.dataset.nextActive==='true'); return; }
    const end = event.target.closest('[data-end-recurrence]'); if (end) { endRecurrenceSeriesV36(end.dataset.endRecurrence); return; }
    const skip = event.target.closest('[data-skip-recurrence]'); if (skip) { skipRecurrenceV36(skip.dataset.skipRecurrence,skip.dataset.skipDate||todayKey()); return; }
    const search = event.target.closest('[data-search-recurring]'); if (search) { closeSearch(); if(isManager()) openRecurrenceEditorById(search.dataset.searchRecurring); else { const task=state.tasks.find(t=>t.recorrencia_id===search.dataset.searchRecurring&&!t.arquivada_em); if(task) openTask(task.id); } return; }
  });
  startRecurrenceProcessorV36();
}


bindEvents(); bindProductivityV4Events(); bindIntelligenceV5Events(); bindRecurringV36Events(); setupMarkdownEditorsV377(); initOverlayStability(); refreshIcons(); bootstrap();


/* =========================================================
   PMG CONNECT V3.7 — MÚLTIPLOS RESPONSÁVEIS
   ========================================================= */
function isMissingMultiAssigneeSchemaV37(error) {
  const text = String(error?.message || error?.details || error || '');
  return /tarefa_responsaveis|demanda_recorrente_responsaveis|42P01|PGRST205|does not exist/i.test(text);
}
function uniqueIdsV37(values) { return [...new Set((values || []).filter(Boolean))]; }
function taskResponsibilityModeV371(task) {
  return task?.modo_responsabilidade === 'primeiro_cumprir' ? 'primeiro_cumprir' : 'compartilhada';
}
function taskIsFirstToCompleteV371(task) {
  return taskResponsibilityModeV371(task) === 'primeiro_cumprir';
}
function taskRaceIsOpenV371(task) {
  return Boolean(task && taskIsFirstToCompleteV371(task) && !task.responsavel_id && task.status === 'nova');
}
function responsibilityModeBadgeHTMLV371(task) {
  if (taskIsFirstToCompleteV371(task)) {
    return `<span class="responsibility-mode-badge race"><i data-lucide="flag"></i>${taskRaceIsOpenV371(task) ? 'Primeiro a cumprir' : 'Assumida'}</span>`;
  }
  if (taskAssigneeIds(task).length > 1) {
    return `<span class="responsibility-mode-badge"><i data-lucide="users-round"></i>Compartilhada</span>`;
  }
  return '';
}
function taskAssigneeIds(taskOrId) {
  const task = typeof taskOrId === 'string' ? state.tasks.find(item => item.id === taskOrId) : taskOrId;
  if (!task) return [];
  const rows = (state.taskAssignees || []).filter(row => row.tarefa_id === task.id).sort((a,b) => Number(b.principal) - Number(a.principal) || String(a.adicionado_em || '').localeCompare(String(b.adicionado_em || '')));
  const ids = rows.map(row => row.colaborador_id);
  if (task.responsavel_id && !ids.includes(task.responsavel_id)) ids.unshift(task.responsavel_id);
  return uniqueIdsV37(ids);
}
function taskHasAssignee(task, personId) {
  if (!personId || !task) return false;
  const finalExecutors = task.status === 'concluida' ? taskFinalExecutorIdsV372(task) : [];
  if (finalExecutors.length) return finalExecutors.includes(personId);
  return taskAssigneeIds(task).includes(personId);
}
function taskAssigneePeople(task) { return taskAssigneeIds(task).map(collaborator).filter(Boolean); }
function taskAssigneeNames(task) { const people = taskAssigneePeople(task); return people.length ? people.map(p => p.nome).join(', ') : 'Sem responsáveis'; }
function taskAssigneeShortNames(task) {
  const people = taskAssigneePeople(task);
  if (!people.length) return 'Sem responsáveis';
  if (people.length === 1) return people[0].nome;
  return `${firstName(people[0].nome)} +${people.length - 1}`;
}
function taskEffortShare(task, forcedCount = null) {
  const finalExecutors = task?.status === 'concluida' ? taskFinalExecutorIdsV372(task) : [];
  if (finalExecutors.length) return sizeWeight(task) / Math.max(1, finalExecutors.length);
  // Em "Primeiro a cumprir" ninguém recebe carga antes de assumir.
  // Depois do claim, a pessoa vencedora recebe a carga completa.
  if (taskIsFirstToCompleteV371(task)) {
    return task?.responsavel_id ? sizeWeight(task) : 0;
  }
  const count = Math.max(1, Number(forcedCount) || taskAssigneeIds(task).length || 1);
  return sizeWeight(task) / count;
}
function taskAssigneeAvatarGroupHTML(task, size = 'sm', max = 3) {
  const people = taskAssigneePeople(task);
  if (!people.length) return `<span class="multi-avatar-group empty">${avatarHTML(null,size)}</span>`;
  const shown = people.slice(0,max);
  return `<span class="multi-avatar-group size-${size}" title="${escapeHtml(people.map(p=>p.nome).join(', '))}">${shown.map((person,index)=>`<span class="multi-avatar-item" style="--avatar-index:${index}">${avatarHTML(person,size)}</span>`).join('')}${people.length > max ? `<span class="multi-avatar-more">+${people.length-max}</span>` : ''}</span>`;
}
function seriesAssigneeIds(seriesOrId) {
  const series = typeof seriesOrId === 'string' ? recurrenceSeriesById(seriesOrId) : seriesOrId;
  if (!series) return [];
  const rows = (state.recurringAssignees || []).filter(row => row.recorrencia_id === series.id).sort((a,b) => Number(b.principal)-Number(a.principal) || String(a.adicionado_em||'').localeCompare(String(b.adicionado_em||'')));
  const ids = rows.map(row => row.colaborador_id);
  if (series.responsavel_id && !ids.includes(series.responsavel_id)) ids.unshift(series.responsavel_id);
  return uniqueIdsV37(ids);
}
function seriesHasAssignee(series, personId) { return Boolean(personId && seriesAssigneeIds(series).includes(personId)); }
function seriesAssigneePeople(series) { return seriesAssigneeIds(series).map(collaborator).filter(Boolean); }
function seriesAssigneeShortNames(series) { const people=seriesAssigneePeople(series); return !people.length?'Sem responsáveis':people.length===1?people[0].nome:`${firstName(people[0].nome)} +${people.length-1}`; }
function selectedFormAssigneeIdsV37(prefix) {
  const map = { item: ['itemAssigneesJson','itemAssignee'], editTask: ['editTaskAssigneesJson','editTaskAssignee'], recurrenceEdit: ['recurrenceEditAssigneesJson','recurrenceEditAssignee'] };
  const [jsonId,selectId] = map[prefix] || [];
  const ids = parseAssigneeJson(jsonId);
  if (!ids.length && selectId && $(selectId)?.value) ids.push($(selectId).value);
  return uniqueIdsV37(ids);
}
function assigneePreviewMultiHTML(ids) {
  const people = uniqueIdsV37(ids).map(collaborator).filter(Boolean);
  if (!people.length) return `<span class="assignee-preview-avatar">${avatarHTML(null,'md')}</span><span class="assignee-preview-copy"><strong>Sem responsáveis</strong><small>A demanda ficará disponível para atribuição.</small></span>`;
  const fakeTask = { id: '__preview__' };
  const avatars = `<span class="multi-avatar-group size-md">${people.slice(0,4).map((person,index)=>`<span class="multi-avatar-item" style="--avatar-index:${index}">${avatarHTML(person,'md')}</span>`).join('')}${people.length>4?`<span class="multi-avatar-more">+${people.length-4}</span>`:''}</span>`;
  return `<span class="assignee-preview-avatar multi">${avatars}</span><span class="assignee-preview-copy"><strong>${people.length === 1 ? escapeHtml(people[0].nome) : `${people.length} responsáveis`}</strong><small>${escapeHtml(people.map(person=>firstName(person.nome)).join(' · '))}</small></span>`;
}
renderAssigneePreview = function renderAssigneePreviewMultiV37(selectId, previewId) {
  const preview=$(previewId); if(!preview) return;
  const jsonId=formAssigneeJsonId(selectId); const ids=parseAssigneeJson(jsonId);
  preview.innerHTML = ids.length ? assigneePreviewMultiHTML(ids) : assigneePreviewHTML(collaborator($(selectId)?.value));
  refreshIcons();
};
async function loadMultipleAssigneesV37() {
  try {
    const { data, error } = await db.from('tarefa_responsaveis').select('tarefa_id,colaborador_id,principal,adicionado_em').limit(5000);
    if (error) throw error;
    state.taskAssignees = data || [];
    state.multiAssigneeReady = true;
  } catch (error) {
    if (!isMissingMultiAssigneeSchemaV37(error)) console.warn('[múltiplos responsáveis]', error);
    state.taskAssignees = [];
    state.multiAssigneeReady = false;
  }
  try {
    const { data, error } = await db.from('demanda_recorrente_responsaveis').select('recorrencia_id,colaborador_id,principal,adicionado_em').limit(5000);
    if (error) throw error;
    state.recurringAssignees = data || [];
  } catch (error) {
    state.recurringAssignees = [];
    if (!isMissingMultiAssigneeSchemaV37(error)) console.warn('[responsáveis recorrentes]', error);
  }
}
const loadAllBeforeMultiAssigneeV37 = loadAll;
loadAll = async function loadAllMultiAssigneeV37() {
  await loadAllBeforeMultiAssigneeV37();
  await loadMultipleAssigneesV37();
  await loadAuthorshipV372();
};
async function updateTaskAssigneesV37(taskId, ids) {
  if (!isManager()) return toast('Somente gestores podem alterar os responsáveis da demanda.','error');
  if (!state.multiAssigneeReady) return toast('Os responsáveis ainda não foram carregados. Atualize a página e tente novamente.','error');
  setLoading(true);
  try {
    const { error } = await db.rpc('definir_responsaveis_tarefa_v1', { p_tarefa_id: taskId, p_responsaveis: uniqueIdsV37(ids) });
    if (error) throw error;
    await refreshData();
    await openTask(taskId);
    await dispatchPendingPush();
    toast(ids.length ? `${ids.length} responsável${ids.length===1?'':'is'} definido${ids.length===1?'':'s'}.` : 'Demanda ficou sem responsáveis.');
  } catch(error) { toast(errorMessage(error),'error'); }
  finally { setLoading(false); }
}
async function updateRecurringAssigneesV37(recurringId, ids) {
  if (!isManager()) return toast('Somente gestores podem alterar responsáveis da recorrência.','error');
  if (!state.multiAssigneeReady) return toast('Os responsáveis ainda não foram carregados. Atualize a página e tente novamente.','error');
  setLoading(true);
  try {
    const { error } = await db.rpc('definir_responsaveis_recorrencia_v1', { p_recorrencia_id: recurringId, p_responsaveis: uniqueIdsV37(ids), p_aplicar_ocorrencias: true });
    if (error) throw error;
    await refreshData();
    renderRecurrenceManagerV36();
    toast('Responsáveis da recorrência atualizados.');
  } catch(error) { toast(errorMessage(error),'error'); }
  finally { setLoading(false); }
}
// Mantém o formulário de recorrência visualmente sincronizado depois de qualquer carga.
const populateRecurrenceAssigneeSelectBeforeMultiV37 = populateRecurrenceAssigneeSelect;
populateRecurrenceAssigneeSelect = function populateRecurrenceAssigneeSelectMultiV37(selected='') {
  populateRecurrenceAssigneeSelectBeforeMultiV37(selected);
  if ($('recurrenceEditAssigneePreview')) renderAssigneePreview('recurrenceEditAssignee','recurrenceEditAssigneePreview');
};


/* =========================================================
   PMG CONNECT V3.8.1 — UX OPERACIONAL
   Autoria simples, Minha Mesa, caixa de ação, ações rápidas,
   visões salvas, @menções, anexos e recorrência multi-horário.
   ========================================================= */
VIEW_META.mesa = ['Execução sem ruído', 'Minha Mesa'];
state.taskAttachmentsV381 = [];
state.attachmentsReadyV381 = false;
state.recurrenceGroupsV381 = [];
state.recurrenceGroupsReadyV381 = false;
state.recurrenceExtraTimesV381 = [];
state.recurrenceEditExtraTimesV381 = [];
state.uxCommandPresetV381 = null;

function normalizeTextV381(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function uniqueTimesV381(values) {
  return [...new Set((values || []).map(value => String(value || '').slice(0,5)).filter(value => /^\d{2}:\d{2}$/.test(value)))].sort();
}
function taskCanActV381(task) {
  return Boolean(task && !task.arquivada_em && (isManager() || taskHasAssignee(task, state.me?.id)));
}
function taskPrimaryQuickActionV381(task) {
  if (!task || task.arquivada_em || task.status === 'concluida') return { action:'open', label:'Abrir', icon:'arrow-up-right' };
  if (taskIsBlocked(task.id)) return { action:'open', label:'Ver bloqueio', icon:'lock-keyhole' };
  if (task.status === 'nova' && taskCanActV381(task)) return { action:'start', label:'Iniciar', icon:'play' };
  if (task.status === 'andamento' && taskCanActV381(task)) return { action:'review', label:'Enviar revisão', icon:'scan-eye' };
  if (task.status === 'revisao' && isManager()) return { action:'evaluate', label:'Validar', icon:'badge-check' };
  return { action:'open', label:'Abrir', icon:'arrow-up-right' };
}
function taskQuickActionsHTMLV381(task, compact = false) {
  const primary = taskPrimaryQuickActionV381(task);
  return `<div class="task-quick-actions ${compact ? 'compact' : ''}" aria-label="Ações rápidas">
    <button type="button" class="task-quick-primary" data-task-quick-action="${primary.action}" data-task-id="${task.id}"><i data-lucide="${primary.icon}"></i><span>${escapeHtml(primary.label)}</span></button>
    <button type="button" data-task-quick-action="comment" data-task-id="${task.id}" title="Comentar"><i data-lucide="message-circle"></i></button>
    <button type="button" data-task-quick-action="open" data-task-id="${task.id}" title="Abrir detalhes"><i data-lucide="more-horizontal"></i></button>
  </div>`;
}

const taskCardHTMLBeforeUxV381 = taskCardHTML;
taskCardHTML = function taskCardHTMLUxV381(task) {
  let html = taskCardHTMLBeforeUxV381(task);
  const blocked = typeof taskIsBlocked === 'function' && taskIsBlocked(task.id);
  if (blocked) {
    const deps = dependenciesForTask(task.id).filter(dependencyIsOpen).map(dep => dependencyTask(dep.depende_de_tarefa_id)).filter(Boolean);
    const label = deps.length ? `Bloqueada por ${deps[0].titulo}${deps.length > 1 ? ` +${deps.length - 1}` : ''}` : 'Bloqueada por dependência';
    html = html.replace('<div class="task-progress-meta">', `<div class="task-card-blocker"><i data-lucide="lock-keyhole"></i><span>${escapeHtml(label)}</span></div><div class="task-progress-meta">`)
      .replace('class="task-card ', 'class="task-card is-blocked ');
  }
  return html.replace('</article>', `${taskQuickActionsHTMLV381(task)}</article>`);
};

async function runTaskQuickActionV381(action, taskId) {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;
  if (action === 'open') return openTask(taskId);
  if (action === 'comment') {
    await openTask(taskId);
    setTimeout(() => $('drawerCommentText')?.focus(), 80);
    return;
  }
  if (action === 'evaluate') return openTaskEvaluation(taskId);
  if (taskIsBlocked(taskId)) return toast('Esta demanda está bloqueada por outra entrega. Abra os detalhes para ver o que falta.', 'error');
  if (action === 'start') return updateTaskStatus(taskId, 'andamento');
  if (action === 'review') return updateTaskStatus(taskId, 'revisao');
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-task-quick-action]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  runTaskQuickActionV381(button.dataset.taskQuickAction, button.dataset.taskId);
}, true);

/* ---------- Caixa "Precisa da sua ação" ---------- */
function actionInboxItemsV381() {
  const items = [];
  const seen = new Set();
  const add = (task, kind, title, text, tone, icon, priority = 10) => {
    if (!task || seen.has(`${task.id}:${kind}`)) return;
    seen.add(`${task.id}:${kind}`);
    items.push({ task, kind, title, text, tone, icon, priority });
  };

  if (state.authorshipReady) {
    myPendingAuthorshipConfirmationsV372().forEach(row => {
      const review = (state.authorshipReviews || []).find(item => item.id === row.revisao_id);
      const task = review ? state.tasks.find(item => item.id === review.tarefa_id) : null;
      add(task, 'autoria', 'Confirme sua participação', 'Entrega compartilhada aguardando sua confirmação de autoria.', 'purple', 'users-round', 0);
    });
  }

  if (isManager()) {
    state.tasks.filter(task => !task.arquivada_em && task.status === 'revisao' && !['confirmacao_autoria','autoria_contestada'].includes(task.avaliacao_status)).forEach(task =>
      add(task, 'avaliacao', 'Valide esta entrega', 'A execução terminou e precisa da sua decisão para seguir.', 'purple', 'badge-check', 1));
    state.tasks.filter(task => !task.arquivada_em && task.status === 'revisao' && task.avaliacao_status === 'autoria_contestada').forEach(task =>
      add(task, 'contestada', 'Revise os participantes', 'A autoria da entrega foi contestada por alguém do grupo.', 'red', 'message-square-warning', 0));
  }

  state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida' && taskHasAssignee(task, state.me?.id)).forEach(task => {
    if (task.avaliacao_status === 'ajustes') add(task, 'ajustes', 'Ajustes solicitados', task.avaliacao_observacao || 'A entrega voltou com ajustes.', 'amber', 'undo-2', 2);
    if (task.prioridade === 'imediata') add(task, 'imediata', 'Demanda imediata', 'Este item deve entrar na frente da fila.', 'red', 'siren', 1);
    else if (isOverdue(task)) add(task, 'atrasada', 'Prazo vencido', dueLabel(task), 'red', 'triangle-alert', 3);
  });

  return items.sort((a,b) => a.priority - b.priority || taskSortByAttention(a.task,b.task)).slice(0,12);
}
function renderActionInboxV381() {
  const list = $('actionInboxList'); if (!list) return;
  const items = actionInboxItemsV381();
  $('actionInboxCount').textContent = `${items.length} ${items.length === 1 ? 'ação' : 'ações'}`;
  list.innerHTML = items.length ? items.map(item => `<button type="button" class="action-inbox-item tone-${item.tone}" data-open-task="${item.task.id}">
    <span class="action-inbox-icon"><i data-lucide="${item.icon}"></i></span><span class="action-inbox-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.task.titulo)} · ${escapeHtml(item.text)}</small></span><span class="action-inbox-cta">Resolver <i data-lucide="chevron-right"></i></span>
  </button>`).join('') : `<div class="action-inbox-empty"><span><i data-lucide="circle-check-big"></i></span><div><strong>Nada esperando sua decisão</strong><small>O que depende de você está em dia.</small></div></div>`;
  refreshIcons();
}
const renderTodayBeforeUxV381 = renderToday;
renderToday = function renderTodayUxV381() {
  renderTodayBeforeUxV381();
  renderActionInboxV381();
};

/* ---------- Minha Mesa ---------- */
function completedTodayV381(task) {
  const value = task.concluida_em || (task.status === 'concluida' ? task.atualizado_em : null);
  return Boolean(value && dateKey(value) === todayKey());
}
function deskTaskHTMLV381(task, context = '') {
  const blocked = taskIsBlocked(task.id);
  return `<article class="desk-task ${isOverdue(task) ? 'late' : ''} ${blocked ? 'blocked' : ''}" data-open-task="${task.id}">
    <div class="desk-task-head"><span class="priority-pill ${task.prioridade}">${PRIORITY[task.prioridade]}</span>${isRecurringTask(task) ? recurrenceBadgeHTML(task,true) : ''}<span class="desk-task-due ${dueClass(task)}">${escapeHtml(dueLabel(task))}</span></div>
    <h3>${escapeHtml(task.titulo)}</h3><p>${escapeHtml(context || task.projeto || (blocked ? 'Aguardando dependência' : STATUS[task.status]?.label || ''))}</p>
    <div class="desk-task-footer"><span>${taskAssigneeAvatarGroupHTML(task,'xs',3)}${escapeHtml(taskAssigneeShortNames(task))}</span>${task.status !== 'concluida' ? taskQuickActionsHTMLV381(task,true) : '<span class="desk-done-badge"><i data-lucide="check"></i>Feita hoje</span>'}</div>
  </article>`;
}
function renderDeskListV381(id, tasks, emptyText) {
  const el = $(id); if (!el) return;
  el.innerHTML = tasks.length ? tasks.map(item => deskTaskHTMLV381(item.task || item, item.context || '')).join('') : `<div class="desk-empty"><i data-lucide="sparkles"></i><span>${escapeHtml(emptyText)}</span></div>`;
}
function renderMyDeskV381() {
  if (!$('viewMesa') || !state.me) return;
  const active = state.tasks.filter(task => !task.arquivada_em && task.status !== 'concluida');
  const mine = active.filter(task => taskHasAssignee(task, state.me.id));
  const pendingConfirmTaskIds = new Set(myPendingAuthorshipConfirmationsV372().map(row => (state.authorshipReviews || []).find(review => review.id === row.revisao_id)?.tarefa_id).filter(Boolean));
  const managerReviewIds = new Set(isManager() ? active.filter(task => task.status === 'revisao' && !['confirmacao_autoria'].includes(task.avaliacao_status)).map(task => task.id) : []);

  const waiting = mine.filter(task => (task.status === 'revisao' && !pendingConfirmTaskIds.has(task.id) && !managerReviewIds.has(task.id)) || taskIsBlocked(task.id));
  const waitingIds = new Set(waiting.map(task => task.id));
  let now = mine.filter(task => !waitingIds.has(task.id) && (pendingConfirmTaskIds.has(task.id) || task.avaliacao_status === 'ajustes' || task.prioridade === 'imediata' || isOverdue(task) || taskDueKey(task) === todayKey()));
  if (isManager()) now = [...now, ...active.filter(task => managerReviewIds.has(task.id) && !now.some(x => x.id === task.id))];
  now.sort(taskSortByAttention);
  const nowIds = new Set(now.map(task => task.id));
  const next = mine.filter(task => !waitingIds.has(task.id) && !nowIds.has(task.id)).sort(taskSortByAttention).slice(0,20);
  const done = state.tasks.filter(task => task.status === 'concluida' && !task.arquivada_em && completedTodayV381(task) && taskHasAssignee(task,state.me.id)).sort((a,b)=>new Date(b.concluida_em||b.atualizado_em)-new Date(a.concluida_em||a.atualizado_em));

  renderDeskListV381('deskNow', now, 'Nada urgente na sua frente.');
  renderDeskListV381('deskNext', next, 'Sua fila seguinte está vazia.');
  renderDeskListV381('deskWaiting', waiting.map(task => ({task, context: taskIsBlocked(task.id) ? 'Bloqueada por outra entrega' : 'Aguardando revisão ou confirmação'})), 'Nada parado esperando outra pessoa.');
  renderDeskListV381('deskDone', done, 'Nenhuma conclusão registrada hoje ainda.');
  $('deskNowCount').textContent = now.length; $('deskNextCount').textContent = next.length; $('deskWaitingCount').textContent = waiting.length; $('deskDoneCount').textContent = done.length;
  const totalOpen = mine.length;
  $('deskSummary').innerHTML = `<div class="desk-summary-card"><span><i data-lucide="circle-dot-dashed"></i></span><div><strong>${totalOpen}</strong><small>Abertas</small></div></div><div class="desk-summary-card"><span><i data-lucide="zap"></i></span><div><strong>${now.length}</strong><small>Agora</small></div></div><div class="desk-summary-card"><span><i data-lucide="hourglass"></i></span><div><strong>${waiting.length}</strong><small>Aguardando</small></div></div><div class="desk-summary-card"><span><i data-lucide="circle-check-big"></i></span><div><strong>${done.length}</strong><small>Feitas hoje</small></div></div>`;
  if ($('navDeskCount')) { $('navDeskCount').textContent = now.length; $('navDeskCount').classList.toggle('hidden', now.length === 0); }
  refreshIcons();
}
const renderAllBeforeUxV381 = renderAll;
renderAll = function renderAllUxV381() {
  renderAllBeforeUxV381();
  renderMyDeskV381();
  renderSavedTaskViewsV381();
};
const switchViewBeforeUxV381 = switchView;
switchView = function switchViewUxV381(view) {
  if (view !== 'mesa') return switchViewBeforeUxV381(view);
  state.view = 'mesa'; renderShell(); renderMyDeskV381();
  window.scrollTo({ top:0, behavior: state.accessibility.reduceMotion ? 'auto' : 'smooth' }); closeMobileSidebar(); refreshIcons();
};

/* ---------- Nova demanda: básico primeiro ---------- */
function setTaskAdvancedV381(open) {
  const modal = $('quickAddModal'); if (!modal) return;
  modal.classList.toggle('show-task-advanced', Boolean(open));
  const btn = $('toggleTaskAdvancedBtn');
  if (btn) { btn.setAttribute('aria-expanded', String(Boolean(open))); btn.querySelector('strong').textContent = open ? 'Menos opções' : 'Mais opções'; const chevron=btn.querySelector(':scope > i:last-child'); if(chevron) chevron.setAttribute('data-lucide', open ? 'chevron-up' : 'chevron-down'); }
  refreshIcons();
}
const openQuickAddBeforeUxV381 = openQuickAdd;
openQuickAdd = function openQuickAddUxV381(type='demanda', preset={}) {
  openQuickAddBeforeUxV381(type,preset);
  setTaskAdvancedV381(Boolean(preset.recurring));
  state.recurrenceExtraTimesV381 = [];
  renderCreateRecurrenceTimesV381();
};

/* ---------- Recorrência várias vezes ao dia ---------- */
function renderCreateRecurrenceTimesV381() {
  const root = $('itemRecurrenceTimesList'); if (!root) return;
  const primary = String($('itemDueTime')?.value || '17:00').slice(0,5);
  const extras = uniqueTimesV381(state.recurrenceExtraTimesV381).filter(time => time !== primary);
  root.innerHTML = `<div class="recurrence-time-primary"><span><i data-lucide="clock-3"></i><strong>Ocorrência principal</strong></span><b>${escapeHtml(primary)}</b></div>${extras.map((time,index)=>`<label class="recurrence-time-row"><span><i data-lucide="repeat-2"></i>Outra ocorrência</span><input type="time" value="${time}" data-recurrence-extra-time="${index}"><button type="button" data-remove-recurrence-time="${index}" title="Remover"><i data-lucide="x"></i></button></label>`).join('')}`;
  refreshIcons();
}
function renderEditRecurrenceTimesV381() {
  const root = $('recurrenceEditTimesList'); if (!root) return;
  const primary = String($('recurrenceEditDueTime')?.value || '17:00').slice(0,5);
  const extras = uniqueTimesV381(state.recurrenceEditExtraTimesV381).filter(time => time !== primary);
  root.innerHTML = extras.length ? extras.map((time,index)=>`<label class="recurrence-time-row"><span><i data-lucide="repeat-2"></i>Outra ocorrência</span><input type="time" value="${time}" data-recurrence-edit-extra-time="${index}"><button type="button" data-remove-recurrence-edit-time="${index}" title="Remover"><i data-lucide="x"></i></button></label>`).join('') : `<div class="recurrence-time-empty"><i data-lucide="clock"></i>Esta rotina roda uma vez por dia.</div>`;
  refreshIcons();
}
function nextSuggestedTimeV381(times) {
  const latest = uniqueTimesV381(times).pop() || '09:00';
  const [h,m] = latest.split(':').map(Number); const total=(h*60+m+240)%(24*60);
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function createRecurrenceTimesV381() { return uniqueTimesV381([$('itemDueTime')?.value || '17:00', ...state.recurrenceExtraTimesV381]); }
function editRecurrenceTimesV381() { return uniqueTimesV381([$('recurrenceEditDueTime')?.value || '17:00', ...state.recurrenceEditExtraTimesV381]); }
function recurrenceGroupRowsForSeriesV381(seriesId) {
  const row = (state.recurrenceGroupsV381 || []).find(item => item.recorrencia_id === seriesId);
  return row ? state.recurrenceGroupsV381.filter(item => item.grupo_id === row.grupo_id).sort((a,b)=>Number(a.ordem)-Number(b.ordem)||String(a.horario).localeCompare(String(b.horario))) : [];
}
async function loadRecurrenceGroupsV381() {
  try {
    const { data, error } = await db.from('demanda_recorrente_grupos_v381').select('*').order('ordem',{ascending:true}).limit(3000);
    if (error) throw error;
    state.recurrenceGroupsV381 = data || []; state.recurrenceGroupsReadyV381 = true;
  } catch (error) {
    state.recurrenceGroupsV381 = []; state.recurrenceGroupsReadyV381 = false;
    if (!/demanda_recorrente_grupos_v381|PGRST205|42P01|does not exist|schema cache/i.test(String(error?.message||error))) console.warn('[recorrência multi-horário]',error);
  }
}
const loadAllBeforeUxV381 = loadAll;
loadAll = async function loadAllUxV381() {
  await loadAllBeforeUxV381();
  await loadRecurrenceGroupsV381();
};
async function closeRecurringSeriesSafelyV381(ids, context = 'rollback') {
  const failures = [];
  for (const id of [...new Set((ids || []).filter(Boolean))].reverse()) {
    try {
      const { error } = await db.rpc('encerrar_demanda_recorrente', { p_id:id });
      if (error) throw error;
    } catch (error) {
      console.error(`[recorrência multi-horário] ${context}: não foi possível encerrar ${id}`, error);
      failures.push(id);
    }
  }
  return failures;
}

async function createRecurringSeriesFromFormV381(time) {
  const frequency = $('itemRecurrenceFrequency').value;
  const weekdays = selectedWeekdays('itemRecurrenceWeekdays');
  const start = $('itemRecurrenceStart').value || todayKey();
  const end = $('itemRecurrenceEnd').value || null;
  const priority = $('itemPriority').value;
  const alertAll = priority === 'imediata' && $('itemAlertAll')?.value === 'true';
  const assigneeIds = selectedFormAssigneeIdsV37('item');
  const responsibilityMode = $('itemResponsibilityMode')?.value || 'compartilhada';
  let recurringId = null;
  try {
    const { data, error } = await db.rpc('criar_demanda_recorrente_v1', {
      p_titulo: $('itemTitle').value.trim(), p_descricao: $('itemDescription').value.trim() || null,
      p_prioridade: priority, p_responsavel_id: responsibilityMode === 'primeiro_cumprir' ? null : (assigneeIds[0] || null),
      p_tags: $('itemTags').value.split(',').map(tag=>tag.trim()).filter(Boolean), p_tamanho:$('itemSize').value,
      p_estimativa_horas:$('itemEstimate').value?Number($('itemEstimate').value):null, p_alerta_para_todos:alertAll,
      p_projeto:$('itemProject')?.value.trim()||null, p_checklist:checklistFromText($('itemChecklist')?.value||''),
      p_dependencias:selectedValues($('itemDependencies')), p_frequencia:frequency, p_dias_semana:weekdays,
      p_data_inicio:start, p_data_fim:end, p_horario_prazo:time,
      p_horario_alerta: time, p_alerta_diario:Boolean($('itemRecurrenceDailyAlert').checked)
    });
    if (error) throw error;
    recurringId = data;
    if (recurringId && state.multiAssigneeReady) {
      const { error: assigneeError } = await db.rpc('definir_responsaveis_recorrencia_modo_v1', { p_recorrencia_id:recurringId, p_responsaveis:assigneeIds, p_modo:responsibilityMode, p_aplicar_ocorrencias:true });
      if (assigneeError) throw assigneeError;
    }
    return recurringId;
  } catch (error) {
    if (recurringId) {
      const rollbackFailures = await closeRecurringSeriesSafelyV381([recurringId], 'falha ao configurar responsáveis');
      if (rollbackFailures.length) {
        error.pmgRollbackFailed = true;
        error.message = `${error.message || 'Falha ao criar recorrência.'} A série criada não pôde ser encerrada automaticamente.`;
      }
    }
    throw error;
  }
}
const createTaskV2BeforeUxV381 = createTaskV2;
createTaskV2 = async function createTaskV2UxV381() {
  if (!$('itemRecurringEnabled')?.checked) return createTaskV2BeforeUxV381();
  const times = createRecurrenceTimesV381();
  if (times.length <= 1) return createTaskV2BeforeUxV381();
  // Não bloqueia por health-check de leitura; tentamos a RPC real ao salvar.
  const frequency = $('itemRecurrenceFrequency').value;
  const weekdays = selectedWeekdays('itemRecurrenceWeekdays');
  if (['semanal','personalizada'].includes(frequency) && !weekdays.length) throw new Error('Selecione pelo menos um dia da semana.');
  const start=$('itemRecurrenceStart').value||todayKey(), end=$('itemRecurrenceEnd').value||null;
  if (end && end < start) throw new Error('A data final não pode ser anterior ao início.');
  const assigneeIds=selectedFormAssigneeIdsV37('item'), mode=$('itemResponsibilityMode')?.value||'compartilhada';
  if (mode==='primeiro_cumprir' && assigneeIds.length<2) throw new Error('No modo Primeiro a cumprir, selecione pelo menos duas pessoas candidatas.');
  const ids=[];
  let grouped = false;
  try {
    for (const time of times) ids.push(await createRecurringSeriesFromFormV381(time));
    const { error: groupError } = await db.rpc('agrupar_recorrencias_v381',{p_recorrencias:ids,p_horarios:times});
    if (groupError) throw groupError;
    grouped = true;
  } catch (error) {
    const rollbackFailures = await closeRecurringSeriesSafelyV381(ids, 'rollback da criação em múltiplos horários');
    if (rollbackFailures.length) {
      error.pmgRollbackFailed = true;
      error.message = `${error.message || 'Falha ao criar a rotina.'} ${rollbackFailures.length} série(s) não puderam ser encerradas automaticamente.`;
    }
    throw error;
  }
  if (grouped) {
    await loadRecurringV36();
    await loadRecurrenceGroupsV381();
  }
};
const fillRecurrenceEditorBeforeUxV381 = fillRecurrenceEditor;
fillRecurrenceEditor = function fillRecurrenceEditorUxV381(series, options={}) {
  fillRecurrenceEditorBeforeUxV381(series, options);
  const rows = series?.id ? recurrenceGroupRowsForSeriesV381(series.id) : [];
  const primary = String($('recurrenceEditDueTime')?.value || '17:00').slice(0,5);
  state.recurrenceEditExtraTimesV381 = rows.map(row=>String(row.horario).slice(0,5)).filter(time=>time!==primary);
  renderEditRecurrenceTimesV381();
};
function decorateRecurrenceManagerGroupsV381() {
  if (!state.recurrenceGroupsReadyV381 || !$('recurrenceManagerList')) return;
  const groups = new Map();
  state.recurrenceGroupsV381.forEach(row => { if(!groups.has(row.grupo_id)) groups.set(row.grupo_id,[]); groups.get(row.grupo_id).push(row); });
  groups.forEach(rows => {
    if (rows.length < 2) return;
    rows.sort((a,b)=>Number(a.ordem)-Number(b.ordem));
    const articles = rows.map(row => [...$('recurrenceManagerList').querySelectorAll('.recurrence-manager-item')].find(article => article.querySelector(`[data-edit-recurrence="${row.recorrencia_id}"]`))).filter(Boolean);
    if (!articles.length) return;
    const keep=articles[0]; articles.slice(1).forEach(article=>article.remove());
    const meta=keep.querySelector('.recurrence-manager-item-meta');
    if(meta){ const timeSpan=[...meta.querySelectorAll('span')].find(span=>span.querySelector('[data-lucide="clock-3"]')); if(timeSpan) timeSpan.innerHTML=`<i data-lucide="clock-3"></i>${rows.map(row=>String(row.horario).slice(0,5)).join(' · ')}`; }
    keep.querySelector('.recurrence-manager-item-top')?.insertAdjacentHTML('beforeend',`<span class="recurrence-multi-badge"><i data-lucide="copy-plus"></i>${rows.length}x ao dia</span>`);
  });
  refreshIcons();
}

const renderRecurrenceManagerBeforeUxV381 = renderRecurrenceManagerV36;
renderRecurrenceManagerV36 = function renderRecurrenceManagerUxV381(){ renderRecurrenceManagerBeforeUxV381(); decorateRecurrenceManagerGroupsV381(); };


const toggleRecurrenceSeriesBeforeUxV381 = toggleRecurrenceSeriesV36;
toggleRecurrenceSeriesV36 = async function toggleRecurrenceSeriesUxV381(id, active) {
  const rows = recurrenceGroupRowsForSeriesV381(id);
  if (rows.length <= 1) return toggleRecurrenceSeriesBeforeUxV381(id, active);
  setLoading(true);
  try {
    for (const row of rows) {
      const { error } = await db.rpc('alternar_demanda_recorrente', { p_id: row.recorrencia_id, p_ativa: active });
      if (error) throw error;
    }
    await refreshData();
    if (state.selectedTask && rows.some(row => row.recorrencia_id === state.selectedTask.recorrencia_id)) await openTask(state.selectedTask.id);
    renderRecurrenceManagerV36();
    toast(active ? 'Rotina retomada em todos os horários.' : 'Rotina pausada em todos os horários.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
};

const endRecurrenceSeriesBeforeUxV381 = endRecurrenceSeriesV36;
endRecurrenceSeriesV36 = async function endRecurrenceSeriesUxV381(id) {
  const rows = recurrenceGroupRowsForSeriesV381(id);
  if (rows.length <= 1) return endRecurrenceSeriesBeforeUxV381(id);
  if (!confirm(`Encerrar esta rotina e seus ${rows.length} horários? O histórico será preservado.`)) return;
  setLoading(true);
  try {
    for (const row of rows) {
      const { error } = await db.rpc('encerrar_demanda_recorrente', { p_id: row.recorrencia_id });
      if (error) throw error;
    }
    await refreshData();
    renderRecurrenceManagerV36();
    if (state.selectedTask && rows.some(row => row.recorrencia_id === state.selectedTask.recorrencia_id)) await openTask(state.selectedTask.id);
    toast('Rotina encerrada em todos os horários.');
  } catch (error) { toast(errorMessage(error), 'error'); }
  finally { setLoading(false); }
};

async function updateRecurringSeriesFromEditorV381(seriesId, time) {
  const responsibilityMode = $('recurrenceEditResponsibilityMode')?.value || 'compartilhada';
  const assignees = selectedFormAssigneeIdsV37('recurrenceEdit');
  const { error } = await db.rpc('editar_demanda_recorrente_v1', {
    p_id: seriesId,
    p_titulo: $('recurrenceEditTitle').value.trim(),
    p_descricao: $('recurrenceEditDescription').value.trim() || null,
    p_prioridade: $('recurrenceEditPriority').value,
    p_responsavel_id: responsibilityMode === 'primeiro_cumprir' ? null : (assignees[0] || null),
    p_tags: $('recurrenceEditTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
    p_tamanho: $('recurrenceEditSize').value,
    p_estimativa_horas: $('recurrenceEditEstimate').value ? Number($('recurrenceEditEstimate').value) : null,
    p_projeto: $('recurrenceEditProject').value.trim() || null,
    p_checklist: checklistFromText($('recurrenceEditChecklist').value || ''),
    p_frequencia: $('recurrenceEditFrequency').value,
    p_dias_semana: selectedWeekdays('recurrenceEditWeekdays'),
    p_data_inicio: $('recurrenceEditStart').value,
    p_data_fim: $('recurrenceEditEnd').value || null,
    p_horario_prazo: time,
    p_horario_alerta: time === String($('recurrenceEditDueTime').value || '').slice(0,5)
      ? ($('recurrenceEditAlertTime').value || '09:00')
      : time,
    p_alerta_diario: Boolean($('recurrenceEditDailyAlert').checked)
  });
  if (error) throw error;
  if (state.multiAssigneeReady) {
    const { error: assigneeError } = await db.rpc('definir_responsaveis_recorrencia_modo_v1', {
      p_recorrencia_id: seriesId,
      p_responsaveis: assignees,
      p_modo: responsibilityMode,
      p_aplicar_ocorrencias: true
    });
    if (assigneeError) throw assigneeError;
  }
}

async function createRecurringSeriesFromEditorV381(time) {
  const responsibilityMode = $('recurrenceEditResponsibilityMode')?.value || 'compartilhada';
  const assignees = selectedFormAssigneeIdsV37('recurrenceEdit');
  const priority = $('recurrenceEditPriority').value;
  const { data: recurringId, error } = await db.rpc('criar_demanda_recorrente_v1', {
    p_titulo: $('recurrenceEditTitle').value.trim(),
    p_descricao: $('recurrenceEditDescription').value.trim() || null,
    p_prioridade: priority,
    p_responsavel_id: responsibilityMode === 'primeiro_cumprir' ? null : (assignees[0] || null),
    p_tags: $('recurrenceEditTags').value.split(',').map(tag => tag.trim()).filter(Boolean),
    p_tamanho: $('recurrenceEditSize').value,
    p_estimativa_horas: $('recurrenceEditEstimate').value ? Number($('recurrenceEditEstimate').value) : null,
    p_alerta_para_todos: false,
    p_projeto: $('recurrenceEditProject').value.trim() || null,
    p_checklist: checklistFromText($('recurrenceEditChecklist').value || ''),
    p_dependencias: [],
    p_frequencia: $('recurrenceEditFrequency').value,
    p_dias_semana: selectedWeekdays('recurrenceEditWeekdays'),
    p_data_inicio: $('recurrenceEditStart').value,
    p_data_fim: $('recurrenceEditEnd').value || null,
    p_horario_prazo: time,
    p_horario_alerta: time,
    p_alerta_diario: Boolean($('recurrenceEditDailyAlert').checked)
  });
  if (error) throw error;
  if (recurringId && state.multiAssigneeReady) {
    const { error: assigneeError } = await db.rpc('definir_responsaveis_recorrencia_modo_v1', {
      p_recorrencia_id: recurringId,
      p_responsaveis: assignees,
      p_modo: responsibilityMode,
      p_aplicar_ocorrencias: true
    });
    if (assigneeError) throw assigneeError;
  }
  return recurringId;
}

async function saveRecurrenceGroupV381(event) {
  const id = $('recurrenceEditId')?.value;
  const convertTaskId = $('recurrenceConvertTaskId')?.value;
  const rows = id ? recurrenceGroupRowsForSeriesV381(id) : [];
  const times = editRecurrenceTimesV381();
  const needsMultiHandling = !convertTaskId && Boolean(id) && (rows.length > 1 || times.length > 1);
  if (!needsMultiHandling) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  // A edição multi-horário tenta a operação real; falhas são exibidas com o erro técnico correto.
  const frequency = $('recurrenceEditFrequency').value;
  const weekdays = selectedWeekdays('recurrenceEditWeekdays');
  const start = $('recurrenceEditStart').value;
  const end = $('recurrenceEditEnd').value || null;
  const responsibilityMode = $('recurrenceEditResponsibilityMode')?.value || 'compartilhada';
  const assignees = selectedFormAssigneeIdsV37('recurrenceEdit');
  if (['semanal','personalizada'].includes(frequency) && !weekdays.length) return toast('Selecione pelo menos um dia da semana.', 'error');
  if (!start) return toast('Informe quando a recorrência começa.', 'error');
  if (end && end < start) return toast('A data final não pode ser anterior ao início.', 'error');
  if (responsibilityMode === 'primeiro_cumprir' && assignees.length < 2) return toast('No modo Primeiro a cumprir, selecione pelo menos duas pessoas candidatas.', 'error');

  setLoading(true);
  try {
    const existingIds = rows.length ? rows.map(row => row.recorrencia_id) : [id];
    const finalIds = [];
    for (let index = 0; index < times.length; index += 1) {
      const time = times[index];
      const seriesId = existingIds[index];
      if (seriesId) {
        await updateRecurringSeriesFromEditorV381(seriesId, time);
        finalIds.push(seriesId);
      } else {
        finalIds.push(await createRecurringSeriesFromEditorV381(time));
      }
    }
    for (const obsoleteId of existingIds.slice(times.length)) {
      const { error } = await db.rpc('encerrar_demanda_recorrente', { p_id: obsoleteId });
      if (error) throw error;
    }
    if (state.supplierLinksReadyV1B) {
      const supplierId = $('recurrenceEditSupplier')?.value || null;
      for (const seriesId of finalIds) {
        if (!await linkRecurringSupplierV2(seriesId, supplierId)) throw new Error('A rotina foi atualizada, mas o fornecedor não pôde ser aplicado a todos os horários.');
      }
    }
    const { error: groupError } = await db.rpc('agrupar_recorrencias_v381', { p_recorrencias: finalIds, p_horarios: times });
    if (groupError) throw groupError;
    closeModal('recurrenceModal');
    await refreshData();
    renderRecurrenceManagerV36();
    toast(times.length > 1 ? `Rotina atualizada com ${times.length} horários por dia.` : 'Rotina atualizada para uma ocorrência por dia.');
  } catch (error) {
    toast(errorMessage(error), 'error');
  } finally {
    setLoading(false);
  }
}

/* ---------- Visões salvas de filtros ---------- */
function savedTaskViewsKeyV381(){ return `pmg-demandas-saved-views:v381:${state.me?.id||'anon'}`; }
function loadSavedTaskViewsV381(){ try{return JSON.parse(localStorage.getItem(savedTaskViewsKeyV381())||'[]')||[];}catch{return [];} }
function saveSavedTaskViewsV381(items){ localStorage.setItem(savedTaskViewsKeyV381(),JSON.stringify(items)); }
function currentTaskViewConfigV381(){ return {search:$('taskSearch')?.value||'',assignee:$('taskAssigneeFilter')?.value||'',project:$('taskProjectFilter')?.value||'',priority:$('taskPriorityFilter')?.value||'',archive:$('taskArchiveFilter')?.value||'ativas',recurrence:$('taskRecurrenceFilter')?.value||'',view:state.taskView||'board'}; }
function applyTaskViewConfigV381(cfg){ if(!cfg)return; state.smartFilter=''; if($('taskSearch'))$('taskSearch').value=cfg.search||''; if($('taskAssigneeFilter'))$('taskAssigneeFilter').value=cfg.assignee||''; if($('taskProjectFilter'))$('taskProjectFilter').value=cfg.project||''; if($('taskPriorityFilter'))$('taskPriorityFilter').value=cfg.priority||''; if($('taskArchiveFilter'))$('taskArchiveFilter').value=cfg.archive||'ativas'; if($('taskRecurrenceFilter'))$('taskRecurrenceFilter').value=cfg.recurrence||''; state.taskView=cfg.view||'board'; renderDemandas(); }
function renderSavedTaskViewsV381(){ const select=$('savedTaskViewSelect');if(!select)return;const current=select.value,items=loadSavedTaskViewsV381();select.innerHTML=`<option value="">Visões salvas</option>${items.map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('')}`;if(items.some(i=>i.id===current))select.value=current;$('deleteTaskViewBtn')?.classList.toggle('hidden',!select.value); }
function saveCurrentTaskViewV381(){ const name=prompt('Nome desta visão:','Minha fila');if(!name?.trim())return;const items=loadSavedTaskViewsV381(),id=`v${Date.now()}`;items.push({id,name:name.trim().slice(0,60),config:currentTaskViewConfigV381()});saveSavedTaskViewsV381(items);renderSavedTaskViewsV381();$('savedTaskViewSelect').value=id;$('deleteTaskViewBtn')?.classList.remove('hidden');toast('Visão de filtros salva.'); }
function deleteCurrentTaskViewV381(){const select=$('savedTaskViewSelect');if(!select?.value)return;const items=loadSavedTaskViewsV381().filter(i=>i.id!==select.value);saveSavedTaskViewsV381(items);renderSavedTaskViewsV381();toast('Visão salva removida.');}

/* ---------- Ctrl+K com comandos naturais ---------- */
function personFromTextV381(text){const q=normalizeTextV381(text);return state.collaborators.find(person=>q.includes(normalizeTextV381(person.nome))||q.includes(normalizeTextV381(firstName(person.nome))));}
const renderGlobalSearchBeforeUxV381 = renderGlobalSearch;
renderGlobalSearch = function renderGlobalSearchUxV381(){
  renderGlobalSearchBeforeUxV381();
  const raw=$('globalSearchInput')?.value.trim()||'', q=normalizeTextV381(raw); if(!q)return;
  let command=null;
  if (/^(nova|criar) demanda\b/.test(q)) {
    const cleaned=raw.replace(/^(nova|criar)\s+demanda\s*/i,'').trim(); const parsed=parseQuickCapture(cleaned||'Nova demanda'); const person=personFromTextV381(cleaned);
    state.uxCommandPresetV381={type:'new',title:parsed.title,date:parsed.date,time:parsed.time,assigneeId:person?.id||null};
    command=commandResultHTML('ux-new-task','wand-sparkles',`Criar: ${parsed.title}`,[parsed.date,parsed.time,person?.nome].filter(Boolean).join(' · '));
  } else if (/^demandas? (do|da|de)\b/.test(q)) {
    const person=personFromTextV381(raw); if(person){state.uxCommandPresetV381={type:'person',personId:person.id};command=commandResultHTML('ux-person-tasks','user-round-search',`Demandas de ${person.nome}`,'Filtra toda a fila desta pessoa');}
  } else if (q.includes('minha mesa')) command=commandResultHTML('ux-desk','layout-list','Abrir Minha Mesa','Agora · Depois · Aguardando · Concluído hoje');
  else if (q.includes('aguardando revisao')||q.includes('para validar')) command=commandResultHTML('ux-review','badge-check','Entregas para validar','Abre as demandas aguardando decisão');
  if(command)$('globalSearchResults')?.insertAdjacentHTML('afterbegin',`<div class="search-group-label">Entendi seu comando</div>${command}`);refreshIcons();
};
const runSearchCommandBeforeUxV381 = runSearchCommand;
runSearchCommand = function runSearchCommandUxV381(command){
  if(command==='ux-desk'){closeSearch();return switchView('mesa');}
  if(command==='ux-review'){closeSearch();return switchView('mesa');}
  if(command==='ux-person-tasks'){const p=state.uxCommandPresetV381;closeSearch();if(!p?.personId)return;state.smartFilter='';switchView('demandas');$('taskAssigneeFilter').value=p.personId;renderDemandas();return;}
  if(command==='ux-new-task'){const p=state.uxCommandPresetV381;closeSearch();return openQuickAdd('demanda',{title:p?.title||'',date:p?.date,time:p?.time,assigneeId:p?.assigneeId});}
  return runSearchCommandBeforeUxV381(command);
};

/* ---------- @menções em comentários ---------- */
function mentionedPeopleV381(text){
  const tokens=[...String(text||'').matchAll(/@([A-Za-zÀ-ÖØ-öø-ÿ]+)/g)].map(m=>normalizeTextV381(m[1]));
  return state.collaborators.filter(person=>tokens.includes(normalizeTextV381(firstName(person.nome))));
}
function injectMentionSuggestionsV381(){
  const form=$('drawerCommentForm');if(!form||form.querySelector('.mention-suggestions-v381'))return;
  form.insertAdjacentHTML('afterend','<div id="mentionSuggestionsV381" class="mention-suggestions-v381 hidden"></div>');
  $('drawerCommentText')?.addEventListener('input',event=>renderMentionSuggestionsV381(event.target.value));
}
function renderMentionSuggestionsV381(text){
  const box=$('mentionSuggestionsV381');if(!box)return;const match=String(text||'').match(/(?:^|\s)@([A-Za-zÀ-ÖØ-öø-ÿ]*)$/);if(!match){box.classList.add('hidden');box.innerHTML='';return;}
  const q=normalizeTextV381(match[1]);const people=state.collaborators.filter(p=>!q||normalizeTextV381(p.nome).includes(q)).slice(0,6);
  box.innerHTML=people.map(p=>`<button type="button" data-mention-person="${p.id}">${avatarHTML(p,'xs')}<span><strong>${escapeHtml(p.nome)}</strong><small>${escapeHtml(p.cargo||'Marketing')}</small></span></button>`).join('');box.classList.toggle('hidden',!people.length);refreshIcons();
}
const addCommentBeforeUxV381 = addComment;
addComment = async function addCommentUxV381(event){
  event.preventDefault();const text=$('drawerCommentText')?.value.trim();if(!text)return;
  const people=mentionedPeopleV381(text);
  if(!people.length)return addCommentBeforeUxV381(event);
  try{
    const {error}=await db.rpc('adicionar_comentario_com_mencoes_v381',{p_tarefa_id:state.selectedTask.id,p_texto:text,p_mencionados:people.map(p=>p.id)});
    if(error)throw error;await openTask(state.selectedTask.id);await dispatchPendingPush();toast(`Comentário adicionado · ${people.length} menção${people.length===1?'':'ões'}.`);
  }catch(error){
    if(/adicionar_comentario_com_mencoes_v381|schema cache|does not exist/i.test(String(error?.message||error))) return addCommentBeforeUxV381(event);
    toast(errorMessage(error),'error');
  }
};

document.addEventListener('click',event=>{
  const mention=event.target.closest('[data-mention-person]');if(!mention)return;
  event.preventDefault();const person=collaborator(mention.dataset.mentionPerson),input=$('drawerCommentText');if(!person||!input)return;
  input.value=input.value.replace(/@([A-Za-zÀ-ÖØ-öø-ÿ]*)$/,`@${firstName(person.nome)} `);input.focus();renderMentionSuggestionsV381(input.value);
});

/* ---------- Anexos ---------- */
async function loadTaskAttachmentsV381(taskId){
  try{const {data,error}=await db.from('tarefa_anexos').select('*').eq('tarefa_id',taskId).order('criado_em',{ascending:false});if(error)throw error;state.taskAttachmentsV381=data||[];state.attachmentsReadyV381=true;}
  catch(error){state.taskAttachmentsV381=[];state.attachmentsReadyV381=false;if(!/tarefa_anexos|PGRST205|42P01|does not exist|schema cache/i.test(String(error?.message||error)))console.warn('[anexos demandas]',error);}
}
function fileSizeLabelV381(bytes){const n=Number(bytes||0);if(!n)return'';if(n<1024)return`${n} B`;if(n<1048576)return`${(n/1024).toFixed(1).replace('.',',')} KB`;return`${(n/1048576).toFixed(1).replace('.',',')} MB`;}
function injectAttachmentPanelV381(){
  const root=$('taskDrawerContent'),task=state.selectedTask;if(!root||!task||root.querySelector('.task-attachments-v381'))return;
  const firstDetail=root.querySelector('.detail-section');
  const section=document.createElement('section');section.className='detail-section task-attachments-v381';
  const rows=state.taskAttachmentsV381||[];
  section.innerHTML=`<div class="detail-section-head"><h3>Anexos</h3><span>${rows.length}</span></div><div class="task-attachment-list">${rows.length?rows.map(item=>`<button type="button" class="task-attachment" data-open-attachment-v381="${item.id}"><span><i data-lucide="paperclip"></i></span><div><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml([item.mime_type,fileSizeLabelV381(item.tamanho_bytes),relativeTime(item.criado_em)].filter(Boolean).join(' · '))}</small></div><i data-lucide="external-link"></i></button>`).join(''):`<div class="attachment-empty"><i data-lucide="paperclip"></i><span>${state.attachmentsReadyV381?'Nenhum arquivo anexado.':'Anexos indisponíveis nesta sessão.'}</span></div>`}</div>${!task.arquivada_em&&state.attachmentsReadyV381?`<label class="attachment-upload-btn"><input id="taskAttachmentInputV381" type="file" hidden><i data-lucide="upload-cloud"></i><span><strong>Anexar arquivo</strong><small>PDF, imagem, planilha, PPTX ou outro material · até 25 MB</small></span></label>`:''}`;
  root.insertBefore(section,firstDetail||null);$('taskAttachmentInputV381')?.addEventListener('change',uploadTaskAttachmentV381);refreshIcons();
}
const openTaskBeforeUxV381 = openTask;
openTask = async function openTaskUxV381(taskId){await loadTaskAttachmentsV381(taskId);return openTaskBeforeUxV381(taskId);};
const renderTaskDrawerBeforeUxV381 = renderTaskDrawer;
renderTaskDrawer = function renderTaskDrawerUxV381(){
  renderTaskDrawerBeforeUxV381();injectAttachmentPanelV381();injectMentionSuggestionsV381();
  const task=state.selectedTask;if(task&&!taskIsFirstToCompleteV371(task)){
    const count=taskAssigneeIds(task).length,section=$('taskDrawerContent')?.querySelector('.task-assignee-section');
    const eyebrow=section?.querySelector('.task-section-heading .eyebrow'),title=section?.querySelector('.task-section-heading h3');
    if(eyebrow)eyebrow.textContent=count>1?'Trabalho em conjunto':'Responsabilidade';if(title)title.textContent=count>1?'Quem participa desta entrega':'Responsável pela execução';
  }
  refreshIcons();
};
async function uploadTaskAttachmentV381(event){
  const file=event.target.files?.[0],task=state.selectedTask;if(!file||!task)return;if(file.size>25*1024*1024){event.target.value='';return toast('O arquivo precisa ter no máximo 25 MB.','error');}
  const safe=file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-');const path=`${task.id}/${Date.now()}-${safe}`;
  setLoading(true);try{const {error:uploadError}=await db.storage.from('demandas-anexos').upload(path,file,{upsert:false,contentType:file.type||undefined});if(uploadError)throw uploadError;const {error}=await db.rpc('registrar_anexo_demanda_v381',{p_tarefa_id:task.id,p_nome:file.name,p_caminho:path,p_mime_type:file.type||null,p_tamanho_bytes:file.size});if(error){await db.storage.from('demandas-anexos').remove([path]);throw error;}await openTask(task.id);toast('Arquivo anexado à demanda.');}catch(error){toast(errorMessage(error),'error');}finally{setLoading(false);}
}
async function openTaskAttachmentV381(id){const item=(state.taskAttachmentsV381||[]).find(row=>row.id===id);if(!item)return;const {data,error}=await db.storage.from('demandas-anexos').createSignedUrl(item.caminho,600);if(error)return toast(errorMessage(error),'error');window.open(data.signedUrl,'_blank','noopener,noreferrer');}
document.addEventListener('click',event=>{const item=event.target.closest('[data-open-attachment-v381]');if(item){event.preventDefault();openTaskAttachmentV381(item.dataset.openAttachmentV381);}});

/* ---------- Autoria: 1 encerra; 2+ confirmam ---------- */
const submitTaskEvaluationBeforeUxV381 = submitTaskEvaluation;
submitTaskEvaluation = async function submitTaskEvaluationUxV384(approved){
  if(!approved)return submitTaskEvaluationBeforeUxV381(false);
  const taskId=$('evaluationTaskId').value,note=$('evaluationNote').value.trim();
  const executors=uniqueIdsV37(state.evaluationExecutorIds);
  if(!executors.length)return toast('Selecione pelo menos uma pessoa que realizou a demanda.','error');

  // V3.8.6: a conclusão usa sempre a RPC de autoria. Não usamos mais
  // avaliar_conclusao() como fallback, porque bancos antigos podem conter
  // uma versão dessa rotina que exige confirmação de autoria e cria um ciclo.
  // Também não bloqueamos pelo state.authorshipReady: o snapshot pode estar
  // desatualizado enquanto a RPC já existe no banco.
  setLoading(true);try{
    const {data,error}=await db.rpc('validar_entrega_v388',{p_tarefa_id:taskId,p_executores:executors,p_observacao:note||null});
    if(error)throw error;
    closeModal('taskEvaluationModal');await refreshData();await dispatchPendingPush();if(state.tasks.some(task=>task.id===taskId))await openTask(taskId);
    if(data?.confirmacao_necessaria||executors.length>1)toast(`Entrega validada. ${executors.length} participantes precisam confirmar a autoria.`);
    else toast('Entrega validada e concluída. Autoria individual registrada sem confirmação extra.');
  }catch(error){console.error('[Demandas V3.8.8 validação]',error);toast(errorMessage(error),'error');}finally{setLoading(false);}
};
const evaluationPanelHTMLBeforeUxV381 = evaluationPanelHTMLV372;
evaluationPanelHTMLV372 = function evaluationPanelHTMLUxV381(task,evaluator){
  return evaluationPanelHTMLBeforeUxV381(task,evaluator)
    .replace('Confira o resultado e registre quem realmente realizou a entrega. Os executores confirmarão a autoria antes do encerramento.','Confira o resultado e registre quem realizou a entrega. Uma pessoa encerra direto; em trabalho compartilhado, o grupo confirma os participantes.')
    .replace('Validar e atribuir autoria','Validar entrega')
    .replace('O gestor registrou quem realizou a entrega. Confira os nomes para a demanda poder ser encerrada.','A entrega foi validada em conjunto. Confira os participantes para que o grupo possa encerrar a demanda.');
};

/* ---------- Binding V3.8.1 ---------- */
function bindUxV381Events(){
  $('globalSearchInput')?.addEventListener('input', debounce(() => renderGlobalSearch(), 140));
  $('recurrenceForm')?.addEventListener('submit', saveRecurrenceGroupV381, true);
  $('toggleTaskAdvancedBtn')?.addEventListener('click',()=>setTaskAdvancedV381(!$('quickAddModal')?.classList.contains('show-task-advanced')));
  $('itemAddRecurrenceTimeBtn')?.addEventListener('click',()=>{state.recurrenceExtraTimesV381.push(nextSuggestedTimeV381(createRecurrenceTimesV381()));renderCreateRecurrenceTimesV381();});
  $('recurrenceEditAddTimeBtn')?.addEventListener('click',()=>{state.recurrenceEditExtraTimesV381.push(nextSuggestedTimeV381(editRecurrenceTimesV381()));renderEditRecurrenceTimesV381();});
  $('itemDueTime')?.addEventListener('change',renderCreateRecurrenceTimesV381);
  $('recurrenceEditDueTime')?.addEventListener('change',renderEditRecurrenceTimesV381);
  $('saveTaskViewBtn')?.addEventListener('click',saveCurrentTaskViewV381);
  $('deleteTaskViewBtn')?.addEventListener('click',deleteCurrentTaskViewV381);
  $('savedTaskViewSelect')?.addEventListener('change',event=>{const item=loadSavedTaskViewsV381().find(row=>row.id===event.target.value);$('deleteTaskViewBtn')?.classList.toggle('hidden',!event.target.value);if(item)applyTaskViewConfigV381(item.config);});
  $('deskRefreshBtn')?.addEventListener('click',async()=>{setLoading(true);try{await refreshData();toast('Minha Mesa atualizada.');}finally{setLoading(false);}});
  $('deskNewBtn')?.addEventListener('click',()=>openQuickAdd('demanda'));
  // Não re-renderize inputs <type=time> enquanto o usuário está escolhendo um horário.
  // Chrome/Firefox podem expor um valor vazio transitório durante a edição; o código antigo
  // interpretava isso como horário inválido e removia a própria linha do formulário.
  document.addEventListener('change',event=>{
    if(event.target.matches('[data-recurrence-extra-time]')){
      const index=Number(event.target.dataset.recurrenceExtraTime), value=String(event.target.value||'').slice(0,5);
      if(/^\d{2}:\d{2}$/.test(value)) state.recurrenceExtraTimesV381[index]=value;
      return;
    }
    if(event.target.matches('[data-recurrence-edit-extra-time]')){
      const index=Number(event.target.dataset.recurrenceEditExtraTime), value=String(event.target.value||'').slice(0,5);
      if(/^\d{2}:\d{2}$/.test(value)) state.recurrenceEditExtraTimesV381[index]=value;
    }
  });
  document.addEventListener('click',event=>{const remove=event.target.closest('[data-remove-recurrence-time]');if(remove){state.recurrenceExtraTimesV381.splice(Number(remove.dataset.removeRecurrenceTime),1);renderCreateRecurrenceTimesV381();return;}const removeEdit=event.target.closest('[data-remove-recurrence-edit-time]');if(removeEdit){state.recurrenceEditExtraTimesV381.splice(Number(removeEdit.dataset.removeRecurrenceEditTime),1);renderEditRecurrenceTimesV381();}});
}
bindUxV381Events();


/* =========================================================
   WAVE 1B — FORNECEDOR CANÔNICO ↔ DEMANDAS
   ========================================================= */
function supplierByIdV1B(id) {
  return (state.suppliersV1B || []).find(item => String(item.id) === String(id)) || null;
}
function supplierNameV1B(id) { return supplierByIdV1B(id)?.nome || ''; }
function supplierOptionsV1B(selected = '') {
  return `<option value="">Sem fornecedor vinculado</option>${(state.suppliersV1B || []).map(item => `<option value="${item.id}" ${String(item.id)===String(selected)?'selected':''}>${escapeHtml(item.nome)}${item.cnpj ? ` · ${escapeHtml(item.cnpj)}` : ''}</option>`).join('')}`;
}
async function loadSupplierLinksV1B() {
  try {
    const suppliersResult = await db.from('fornecedores').select('id,nome,cnpj,status').order('nome').limit(1000);
    if (suppliersResult.error) throw suppliersResult.error;
    state.suppliersV1B = suppliersResult.data || [];
  } catch (error) {
    state.suppliersV1B = [];
    state.supplierLinksReadyV1B = false;
    console.warn('[Demandas Wave 1B] cadastro de fornecedores indisponível:', error?.message || error);
    return;
  }
  const probe = await db.from('tarefas').select('id,fornecedor_id').limit(1);
  if (probe.error) {
    state.supplierLinksReadyV1B = false;
    if (!/fornecedor_id|schema cache|does not exist|column/i.test(String(probe.error?.message || probe.error))) console.warn('[Demandas Wave 1B] vínculo indisponível:', probe.error);
  } else state.supplierLinksReadyV1B = true;
}
function populateSupplierControlsV1B() {
  const ready = state.supplierLinksReadyV1B;
  const item = $('itemSupplier'), edit = $('editTaskSupplier'), recurrence = $('recurrenceEditSupplier'), filter = $('taskSupplierFilter');
  if (item) { const current=item.value; item.innerHTML=supplierOptionsV1B(current); if (current) item.value=current; }
  if (edit) { const current=edit.value; edit.innerHTML=supplierOptionsV1B(current); if (current) edit.value=current; }
  if (recurrence) { const current=recurrence.value; recurrence.innerHTML=supplierOptionsV1B(current); if (current) recurrence.value=current; }
  if (filter) {
    const current=state.supplierFilterV1B || filter.value;
    filter.innerHTML=`<option value="">Todos os fornecedores</option>${(state.suppliersV1B||[]).map(row=>`<option value="${row.id}">${escapeHtml(row.nome)}</option>`).join('')}`;
    filter.value=(state.suppliersV1B||[]).some(row=>String(row.id)===String(current))?String(current):'';
    filter.classList.toggle('hidden', !ready);
  }
  syncSupplierFieldsV1B();
}
function syncSupplierFieldsV1B() {
  const recurring=Boolean($('itemRecurringEnabled')?.checked);
  $('itemSupplierField')?.classList.toggle('hidden', !state.supplierLinksReadyV1B);
  $('editTaskSupplierField')?.classList.toggle('hidden', !state.supplierLinksReadyV1B);
}
async function linkSupplierToTaskV1B(taskId, supplierId) {
  if (!state.supplierLinksReadyV1B || !taskId) return !supplierId;
  try {
    const { error } = await db.rpc('vincular_tarefa_fornecedor_v1', { p_tarefa_id:taskId, p_fornecedor_id:supplierId ? Number(supplierId) : null });
    if (error) throw error;
    const task=state.tasks.find(item=>item.id===taskId); if(task) task.fornecedor_id=supplierId ? Number(supplierId) : null;
    return true;
  } catch (error) {
    console.warn('[Demandas Wave 1B] demanda salva, vínculo com fornecedor falhou:', error?.message || error);
    return false;
  }
}
const loadAllBeforeSupplierV1B = loadAll;
loadAll = async function loadAllSupplierV1B() {
  await loadAllBeforeSupplierV1B();
  await loadSupplierLinksV1B();
  populateSupplierControlsV1B();
};
const createTaskBeforeSupplierV1B = createTaskV2;
createTaskV2 = async function createTaskSupplierV1B() {
  const recurring=Boolean($('itemRecurringEnabled')?.checked);
  const taskId=await createTaskBeforeSupplierV1B();
  if (recurring || !taskId) return taskId;
  const supplierId=$('itemSupplier')?.value || '';
  if (supplierId && !(await linkSupplierToTaskV1B(taskId,supplierId))) state.supplierLinkWarningV1B='A demanda foi criada, mas o vínculo com fornecedor não pôde ser salvo. Abra a demanda e tente vincular novamente.';
  return taskId;
};
const openQuickAddBeforeSupplierV1B = openQuickAdd;
openQuickAdd = function openQuickAddSupplierV1B(type='demanda', preset={}) {
  openQuickAddBeforeSupplierV1B(type,preset);
  if(type!=='demanda') return;
  populateSupplierControlsV1B();
  const selected=preset.supplierId || state.supplierFilterV1B || '';
  if($('itemSupplier')) $('itemSupplier').value=(state.suppliersV1B||[]).some(row=>String(row.id)===String(selected))?String(selected):'';
  syncSupplierFieldsV1B();
};
const openEditTaskBeforeSupplierV1B = openEditTask;
openEditTask = function openEditTaskSupplierV1B() {
  openEditTaskBeforeSupplierV1B();
  populateSupplierControlsV1B();
  if($('editTaskSupplier')) $('editTaskSupplier').value=state.selectedTask?.fornecedor_id ? String(state.selectedTask.fornecedor_id) : '';
};
const filteredTasksBeforeSupplierV1B = filteredTasks;
filteredTasks = function filteredTasksSupplierV1B() {
  const supplierId=$('taskSupplierFilter')?.value || state.supplierFilterV1B || '';
  return filteredTasksBeforeSupplierV1B().filter(task=>!supplierId || String(task.fornecedor_id||'')===String(supplierId));
};
const renderDemandasBeforeSupplierV1B = renderDemandas;
renderDemandas = function renderDemandasSupplierV1B() {
  populateSupplierControlsV1B();
  renderDemandasBeforeSupplierV1B();
};
const taskCardHTMLBeforeSupplierV1B = taskCardHTML;
taskCardHTML = function taskCardHTMLSupplierV1B(task) {
  let html=taskCardHTMLBeforeSupplierV1B(task); const supplier=supplierByIdV1B(task.fornecedor_id);
  if(!supplier) return html;
  return html.replace('<span class="task-card-id">', `<a class="project-pill" href="/fornecedores.html?fornecedor=${encodeURIComponent(supplier.id)}" onclick="event.stopPropagation()"><i data-lucide="building-2"></i>${escapeHtml(supplier.nome)}</a><span class="task-card-id">`);
};
const renderTaskListBeforeSupplierV1B = renderTaskList;
renderTaskList = function renderTaskListSupplierV1B() {
  renderTaskListBeforeSupplierV1B();
  document.querySelectorAll('#taskRows .task-row[data-open-task]').forEach(row=>{
    const task=state.tasks.find(item=>item.id===row.dataset.openTask), supplier=supplierByIdV1B(task?.fornecedor_id); if(!supplier) return;
    const small=row.querySelector('.task-row-title small'); if(small && !small.dataset.supplierV1b){ small.dataset.supplierV1b='1'; small.textContent=`Fornecedor: ${supplier.nome} · ${small.textContent}`; }
  });
};
const renderTaskDrawerBeforeSupplierV1B = renderTaskDrawer;
renderTaskDrawer = function renderTaskDrawerSupplierV1B() {
  renderTaskDrawerBeforeSupplierV1B(); const task=state.selectedTask, supplier=supplierByIdV1B(task?.fornecedor_id), root=$('taskDrawerContent'); if(!task||!root) return;
  const summary=root.querySelector('.task-detail-summary');
  if(summary && !summary.querySelector('[data-task-supplier-v1b]')) summary.insertAdjacentHTML('beforeend', `<div data-task-supplier-v1b><span><i data-lucide="building-2"></i>Fornecedor</span><strong>${supplier ? `<a href="/fornecedores.html?fornecedor=${encodeURIComponent(supplier.id)}">${escapeHtml(supplier.nome)}</a>` : 'Sem fornecedor'}</strong></div>`);
  refreshIcons();
};
const handleUrlActionsBeforeSupplierV1B = handleUrlActions;
handleUrlActions = async function handleUrlActionsSupplierV1B() {
  const params=new URLSearchParams(location.search), supplierId=params.get('fornecedor');
  if(supplierId && state.supplierLinksReadyV1B && supplierByIdV1B(supplierId)) {
    state.supplierFilterV1B=String(supplierId); state.view='demandas';
    if($('taskSupplierFilter')) $('taskSupplierFilter').value=String(supplierId);
    renderAll();
    if(params.get('nova')==='1') setTimeout(()=>openQuickAdd('demanda',{supplierId}),120);
  }
  await handleUrlActionsBeforeSupplierV1B();
};
$('taskSupplierFilter')?.addEventListener('change',event=>{state.supplierFilterV1B=event.target.value||'';renderDemandas();refreshIcons();});
$('itemRecurringEnabled')?.addEventListener('change',syncSupplierFieldsV1B);


/* =========================================================
   WAVE 2 — RELACIONAMENTOS OPERACIONAIS + FORNECEDOR EM RECORRÊNCIAS
   ========================================================= */
function entityLabelV2(row, kind) {
  if (!row) return '';
  if (kind === 'document') return `${row.nome_arquivo || 'Documento'}${row.status ? ` · ${row.status}` : ''}`;
  if (kind === 'obligation') return `${row.titulo || 'Obrigação'}${row.status ? ` · ${row.status.replaceAll('_',' ')}` : ''}`;
  if (kind === 'training') return `${row.titulo || row.descricao || 'Treinamento'}${row.inicio_em ? ` · ${formatDate(row.inicio_em, {year:true})}` : ''}`;
  return row.titulo || row.nome || row.id || '';
}
function relationOptionsV2(rows, kind, selected='') {
  return `<option value="">Sem ${kind === 'document' ? 'documento' : kind === 'obligation' ? 'obrigação' : 'treinamento'} vinculado</option>${(rows||[]).map(row=>`<option value="${escapeHtml(row.id)}" ${String(row.id)===String(selected)?'selected':''}>${escapeHtml(entityLabelV2(row,kind))}</option>`).join('')}`;
}
async function loadEntityRelationshipsV2() {
  try {
    const probe=await db.from('tarefas').select('id,campanha_ref,documento_id,obrigacao_id,treinamento_id,catalogo_contexto').limit(1);
    if (probe.error) throw probe.error;
    state.entityRelationshipsReadyV2=true;
    const [docs, obligations, trainings] = await Promise.all([
      db.from('acompanhamento_documentos_entrada').select('id,nome_arquivo,status,criado_em').order('criado_em',{ascending:false}).limit(250),
      db.from('fornecedor_obrigacoes').select('id,fornecedor_id,titulo,status,prazo').order('atualizado_em',{ascending:false}).limit(500),
      db.from('academia_reservas').select('id,titulo,descricao,inicio_em,status').eq('tipo_registro','treinamento').order('inicio_em',{ascending:false}).limit(300)
    ]);
    state.relationshipDocumentsV2=docs.error?[]:(docs.data||[]);
    state.relationshipObligationsV2=obligations.error?[]:(obligations.data||[]);
    state.relationshipTrainingsV2=trainings.error?[]:(trainings.data||[]);
    [docs,obligations,trainings].filter(result=>result.error).forEach(result=>console.warn('[Demandas Wave 2] fonte de relacionamento indisponível:', result.error?.message||result.error));
  } catch (error) {
    state.entityRelationshipsReadyV2=false;
    state.relationshipDocumentsV2=[]; state.relationshipObligationsV2=[]; state.relationshipTrainingsV2=[];
    if (!/campanha_ref|documento_id|obrigacao_id|treinamento_id|catalogo_contexto|fornecedor_obrigacoes|schema cache|does not exist|column/i.test(String(error?.message||error))) console.warn('[Demandas Wave 2] relacionamentos indisponíveis:',error);
  }
}
function relationshipSnapshotV2(prefix='item') {
  const isEdit=prefix==='editTask';
  const supplier=$(isEdit?'editTaskSupplier':'itemSupplier')?.value||'';
  return {
    supplierId:supplier?Number(supplier):null,
    campaignRef:$(isEdit?'editTaskCampaignRef':'itemCampaignRef')?.value?.trim()||null,
    documentId:$(isEdit?'editTaskDocument':'itemDocument')?.value||null,
    obligationId:$(isEdit?'editTaskObligation':'itemObligation')?.value||null,
    trainingId:$(isEdit?'editTaskTraining':'itemTraining')?.value||null,
    catalogContext:$(isEdit?'editTaskCatalogContext':'itemCatalogContext')?.value?.trim()||null
  };
}
function populateRelationshipControlsV2(prefix='item', task=null) {
  const isEdit=prefix==='editTask';
  const documentSelect=$(isEdit?'editTaskDocument':'itemDocument');
  const obligationSelect=$(isEdit?'editTaskObligation':'itemObligation');
  const trainingSelect=$(isEdit?'editTaskTraining':'itemTraining');
  const supplierId=Number($(isEdit?'editTaskSupplier':'itemSupplier')?.value||task?.fornecedor_id||0)||null;
  if(documentSelect){const current=task?.documento_id||documentSelect.value;documentSelect.innerHTML=relationOptionsV2(state.relationshipDocumentsV2,'document',current);documentSelect.value=current||'';}
  if(obligationSelect){const current=task?.obrigacao_id||obligationSelect.value;const rows=(state.relationshipObligationsV2||[]).filter(row=>!supplierId||Number(row.fornecedor_id)===supplierId);obligationSelect.innerHTML=relationOptionsV2(rows,'obligation',current);obligationSelect.value=rows.some(row=>String(row.id)===String(current))?String(current):'';}
  if(trainingSelect){const current=task?.treinamento_id||trainingSelect.value;trainingSelect.innerHTML=relationOptionsV2(state.relationshipTrainingsV2,'training',current);trainingSelect.value=current||'';}
  const campaign=$(isEdit?'editTaskCampaignRef':'itemCampaignRef'); if(campaign&&task)campaign.value=task.campanha_ref||'';
  const catalog=$(isEdit?'editTaskCatalogContext':'itemCatalogContext'); if(catalog&&task)catalog.value=task.catalogo_contexto||'';
  const details=$(isEdit?'editTaskEntityRelations':'itemEntityRelations');
  if(details){details.classList.toggle('hidden',!state.entityRelationshipsReadyV2); if(task&&(task.campanha_ref||task.documento_id||task.obrigacao_id||task.treinamento_id||task.catalogo_contexto)) details.open=true;}
}
async function linkTaskEntitiesV2(taskId, values) {
  if(!state.entityRelationshipsReadyV2||!taskId) return {ok:!Object.values(values||{}).some(Boolean), error:null};
  const {error}=await db.rpc('vincular_tarefa_entidades_v2',{
    p_tarefa_id:taskId,
    p_fornecedor_id:values.supplierId,
    p_campanha_ref:values.campaignRef,
    p_documento_id:values.documentId,
    p_obrigacao_id:values.obligationId,
    p_treinamento_id:values.trainingId,
    p_catalogo_contexto:values.catalogContext
  });
  if(error){console.warn('[Demandas Wave 2] demanda salva, relacionamento complementar falhou:',error?.message||error);return {ok:false,error};}
  const task=state.tasks.find(item=>String(item.id)===String(taskId)); if(task)Object.assign(task,{fornecedor_id:values.supplierId,campanha_ref:values.campaignRef,documento_id:values.documentId,obrigacao_id:values.obligationId,treinamento_id:values.trainingId,catalogo_contexto:values.catalogContext});
  return {ok:true,error:null};
}
async function linkRecurringSupplierV2(recurringId,supplierId) {
  if(!recurringId||!supplierId||!state.entityRelationshipsReadyV2) return true;
  const {error}=await db.rpc('vincular_recorrencia_fornecedor_v2',{p_recorrencia_id:recurringId,p_fornecedor_id:Number(supplierId)});
  if(error){console.warn('[Demandas Wave 2] recorrência criada, vínculo com fornecedor falhou:',error?.message||error);return false;} return true;
}
const loadAllBeforeRelationshipsV2=loadAll;
loadAll=async function loadAllRelationshipsV2(){await loadAllBeforeRelationshipsV2();await loadEntityRelationshipsV2();populateRelationshipControlsV2('item');};
const openQuickAddBeforeRelationshipsV2=openQuickAdd;
openQuickAdd=function openQuickAddRelationshipsV2(type='demanda',preset={}){openQuickAddBeforeRelationshipsV2(type,preset);if(type!=='demanda')return;populateRelationshipControlsV2('item');if($('itemCampaignRef'))$('itemCampaignRef').value=preset.campaignRef||'';if($('itemCatalogContext'))$('itemCatalogContext').value=preset.catalogContext||'';};
const openEditTaskBeforeRelationshipsV2=openEditTask;
openEditTask=function openEditTaskRelationshipsV2(){openEditTaskBeforeRelationshipsV2();populateRelationshipControlsV2('editTask',state.selectedTask);};
const createTaskBeforeRelationshipsV2=createTaskV2;
createTaskV2=async function createTaskRelationshipsV2(){
  const values=relationshipSnapshotV2('item');
  const recurring=Boolean($('itemRecurringEnabled')?.checked);
  const result=await createTaskBeforeRelationshipsV2();
  if(recurring){
    if(result&&values.supplierId&&!await linkRecurringSupplierV2(result,values.supplierId)) state.supplierLinkWarningV1B='A rotina foi criada, mas o fornecedor não pôde ser vinculado.';
    return result;
  }
  if(result){const linked=await linkTaskEntitiesV2(result,values);if(!linked.ok)state.supplierLinkWarningV1B='A demanda foi criada, mas um dos relacionamentos não pôde ser salvo. A demanda continua preservada.';}
  return result;
};
const createRecurringSeriesFromFormBeforeRelationshipsV2=createRecurringSeriesFromFormV381;
createRecurringSeriesFromFormV381=async function createRecurringSeriesFromFormRelationshipsV2(time){const id=await createRecurringSeriesFromFormBeforeRelationshipsV2(time);const supplierId=$('itemSupplier')?.value||'';if(id&&supplierId&&!await linkRecurringSupplierV2(id,supplierId)){const error=new Error('A série foi criada, mas o fornecedor não pôde ser vinculado.');error.pmgRelationshipFailed=true;throw error;}return id;};
const saveEditedTaskBeforeRelationshipsV2=saveEditedTask;
saveEditedTask=async function saveEditedTaskRelationshipsV2(event){
  // O fluxo legado salva os campos da demanda; o relacionamento complementar é salvo em seguida no mesmo gesto.
  const taskId=$('editTaskId')?.value; const values=relationshipSnapshotV2('editTask');
  await saveEditedTaskBeforeRelationshipsV2(event);
  if(!$('editTaskModal')?.classList.contains('hidden')) return;
  if(!taskId||!state.tasks.some(item=>String(item.id)===String(taskId)))return;
  const linked=await linkTaskEntitiesV2(taskId,values);
  if(!linked.ok)toast('A demanda foi salva, mas um dos vínculos operacionais não pôde ser atualizado.','error');
  else {await loadTasks(); state.selectedTask=state.tasks.find(item=>String(item.id)===String(taskId))||state.selectedTask; if(!$('taskDrawer')?.classList.contains('hidden')) renderTaskDrawer();}
};
$('itemSupplier')?.addEventListener('change',()=>populateRelationshipControlsV2('item'));
$('editTaskSupplier')?.addEventListener('change',()=>populateRelationshipControlsV2('editTask',state.selectedTask));
const renderTaskDrawerBeforeRelationshipsV2=renderTaskDrawer;
renderTaskDrawer=function renderTaskDrawerRelationshipsV2(){renderTaskDrawerBeforeRelationshipsV2();const task=state.selectedTask,root=$('taskDrawerContent');if(!task||!root)return;const links=[];
  if(task.campanha_ref)links.push(`<a href="/campanhas.html?view=campaigns&busca=${encodeURIComponent(task.campanha_ref)}"><i data-lucide="trophy"></i><span>Campanha</span><strong>${escapeHtml(task.campanha_ref)}</strong></a>`);
  if(task.documento_id)links.push(`<a href="/acompanhamento.html?view=documentos&documento=${encodeURIComponent(task.documento_id)}"><i data-lucide="file-text"></i><span>Documento</span><strong>Abrir documento</strong></a>`);
  if(task.obrigacao_id)links.push(`<a href="/operacoes.html?view=obrigacoes&obrigacao=${encodeURIComponent(task.obrigacao_id)}"><i data-lucide="clipboard-list"></i><span>Obrigação</span><strong>Abrir pendência</strong></a>`);
  if(task.treinamento_id)links.push(`<a href="/demandas.html?view=academia&treinamento=${encodeURIComponent(task.treinamento_id)}"><i data-lucide="graduation-cap"></i><span>Treinamento</span><strong>Abrir Academia</strong></a>`);
  if(task.catalogo_contexto)links.push(`<a href="/catalogo.html?contexto=${encodeURIComponent(task.catalogo_contexto)}"><i data-lucide="book-open"></i><span>Catálogo</span><strong>${escapeHtml(task.catalogo_contexto)}</strong></a>`);
  if(!links.length)return; const summary=root.querySelector('.task-detail-summary'); if(summary&&!summary.querySelector('[data-task-relations-v2]'))summary.insertAdjacentHTML('afterend',`<section class="task-entity-links-v2" data-task-relations-v2><span class="eyebrow">Relacionado a</span><div>${links.join('')}</div></section>`);refreshIcons();
};
