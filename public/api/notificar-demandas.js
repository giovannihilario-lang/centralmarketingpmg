let webpush = null;
let createClient = null;
let dependenciesPromise = null;

async function loadDependencies() {
  if (webpush && createClient) return;
  if (!dependenciesPromise) {
    dependenciesPromise = Promise.all([
      import('web-push'),
      import('@supabase/supabase-js')
    ]).then(([webPushModule, supabaseModule]) => {
      webpush = webPushModule.default || webPushModule;
      createClient = supabaseModule.createClient;
    });
  }
  await dependenciesPromise;
}

const NOTIFICATION_TEXT = {
  nova_tarefa: 'Você recebeu uma nova demanda',
  prazo_proximo: 'Uma demanda está perto do prazo',
  prazo_atrasado: 'Uma demanda está atrasada',
  comentario: 'Há um novo comentário em uma demanda',
  status_mudou: 'Uma demanda foi atualizada',
  demanda_imediata: 'DEMANDA IMEDIATA. Verifique agora',
  avaliacao_pendente: 'Uma demanda aguarda avaliação',
  avaliacao_aprovada: 'A conclusão foi aprovada',
  avaliacao_ajustes: 'A demanda voltou para ajustes',
  transferencia: 'Uma demanda foi transferida para você',
  lembrete: 'Está na hora do lembrete'
};

function makeSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configuradas');
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:marketing@pmgatacadista.com.br',
    publicKey,
    privateKey
  );
}

function bearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function authorize(req, supabase) {
  const token = bearerToken(req);
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && token === cronSecret) {
    return { type: 'cron' };
  }

  if (!token) throw new Error('Não autorizado');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new Error('Sessão inválida');
  return { type: 'user', user: data.user };
}

async function deleteExpiredSubscription(supabase, endpoint) {
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

async function markAsSent(supabase, notificationId) {
  await supabase
    .from('notificacoes')
    .update({ push_enviada_em: new Date().toISOString() })
    .eq('id', notificationId)
    .is('push_enviada_em', null);
}

function payloadFor(notification) {
  const task = notification.tarefa;
  const reminder = notification.lembrete;
  const isReminder = Boolean(notification.lembrete_id);
  const itemTitle = task?.titulo || reminder?.titulo || 'Atualização';
  const heading = notification.mensagem
    || (isReminder
      ? reminder?.tipo === 'compromisso' ? 'Compromisso próximo' : 'Lembrete programado'
      : NOTIFICATION_TEXT[notification.tipo] || 'Atualização');

  const url = isReminder
    ? `/demandas.html?lembrete=${notification.lembrete_id}`
    : `/demandas.html?tarefa=${notification.tarefa_id || ''}`;

  const actions = isReminder
    ? [
        { action: 'snooze-10', title: 'Adiar 10 min' },
        { action: 'complete', title: 'Concluir' }
      ]
    : [{ action: 'open', title: 'Abrir demanda' }];

  return JSON.stringify({
    title: isReminder ? 'PMG Connect · Agenda' : 'PMG Connect · Demandas',
    body: `${heading}: ${itemTitle}`,
    icon: '/imagenssite/pmglogo.png',
    badge: '/imagenssite/pmglogo.png',
    tag: `pmg-${notification.id}`,
    url,
    actions,
    reminderId: notification.lembrete_id || null,
    taskId: notification.tarefa_id || null,
    level: notification.nivel || 'normal'
  });
}


function academyWebhookAuthorized(req) {
  const expected = process.env.ACADEMIA_FORMS_WEBHOOK_SECRET;
  if (!expected) throw new Error('ACADEMIA_FORMS_WEBHOOK_SECRET não configurado');
  const provided = String(req.headers['x-academia-secret'] || req.headers['x-pmg-secret'] || '');
  if (!provided || provided !== expected) throw new Error('Webhook da Academia não autorizado');
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
  return '';
}

function normalizeClock(value, fallback) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2})[:h](\d{2})/) || text.match(/^(\d{1,2})$/);
  if (!match) return fallback;
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2] || 0)));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function academyIso(date, time) {
  const d = normalizeDate(date);
  if (!d) return null;
  const t = normalizeClock(time, '09:00');
  const parsed = new Date(`${d}T${t}:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function processAcademyFormsWebhook(req, supabase) {
  academyWebhookAuthorized(req);
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const key = cleanText(body.responseId || body.response_id || body.chave || body.id);
  const title = cleanText(body.titulo || body.title || body.evento || body.nome_evento);
  const requester = cleanText(body.solicitante || body.requester || body.nome);
  const start = cleanText(body.inicio_em) || academyIso(body.data || body.date, body.inicio || body.start || body.horario_inicio);
  const end = cleanText(body.fim_em) || academyIso(body.data || body.date, body.fim || body.end || body.horario_fim);
  if (!key) throw new Error('Informe responseId/chave da resposta do Forms');
  if (!title) throw new Error('Informe titulo da reserva');
  if (!requester) throw new Error('Informe solicitante');
  if (!start || !end || new Date(end) <= new Date(start)) throw new Error('Data/horário da reserva inválidos');

  const participantsRaw = body.participantes ?? body.participants ?? body.quantidade_pessoas;
  const participants = participantsRaw === undefined || participantsRaw === null || participantsRaw === ''
    ? null : Number(String(participantsRaw).replace(/[^0-9]/g, ''));
  const payload = {
    titulo: title,
    solicitante: requester,
    setor: cleanText(body.setor || body.department),
    email: cleanText(body.email),
    telefone: cleanText(body.telefone || body.phone || body.ramal),
    finalidade: cleanText(body.finalidade || body.purpose),
    inicio_em: new Date(start).toISOString(),
    fim_em: new Date(end).toISOString(),
    participantes: Number.isFinite(participants) ? participants : null,
    observacoes: cleanText(body.observacoes || body.notes),
    origem: 'forms',
    forms_linha_chave: key,
    forms_payload: body,
    atualizado_em: new Date().toISOString()
  };

  const { data: existing, error: findError } = await supabase
    .from('academia_reservas').select('id,status').eq('forms_linha_chave', key).maybeSingle();
  if (findError) throw findError;

  let result;
  if (existing?.id) {
    const { data, error } = await supabase.from('academia_reservas').update(payload).eq('id', existing.id).select('id,status').single();
    if (error) throw error;
    result = data;
  } else {
    const { data, error } = await supabase.from('academia_reservas').insert({ ...payload, status: 'solicitada' }).select('id,status').single();
    if (error) throw error;
    result = data;
  }
  return { ok: true, reservaId: result.id, status: result.status, chave: key };
}


function academyRegistrationsWebhookAuthorized(req) {
  const expected = process.env.ACADEMIA_INSCRICOES_WEBHOOK_SECRET;
  if (!expected) throw new Error('ACADEMIA_INSCRICOES_WEBHOOK_SECRET não configurado');
  const provided = String(req.headers['x-academia-inscricoes-secret'] || req.headers['x-pmg-secret'] || '');
  if (!provided || provided !== expected) throw new Error('Webhook de inscrições da Academia não autorizado');
}

function normalizeAcademyFormKey(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function academyRegistrationValue(values, candidates) {
  const entries = Object.entries(values || {}).map(([key, value]) => [normalizeAcademyFormKey(key), value]);
  for (const candidate of candidates) {
    const needle = normalizeAcademyFormKey(candidate);
    const exact = entries.find(([key]) => key === needle);
    if (exact) return cleanText(Array.isArray(exact[1]) ? exact[1].join(' · ') : exact[1]);
  }
  for (const candidate of candidates) {
    const needle = normalizeAcademyFormKey(candidate);
    const partial = entries.find(([key]) => key.includes(needle) || needle.includes(key));
    if (partial) return cleanText(Array.isArray(partial[1]) ? partial[1].join(' · ') : partial[1]);
  }
  return null;
}

async function resolveAcademyRegistrationTraining(supabase, body, values) {
  const explicitId = cleanText(body.trainingId || body.treinamentoId || body.treinamento_id);
  if (explicitId) {
    const { data } = await supabase.from('academia_reservas').select('id').eq('id', explicitId).maybeSingle();
    if (data?.id) return data.id;
  }

  const trainingText = cleanText(body.trainingName || body.treinamentoNome || body.treinamento_nome) || academyRegistrationValue(values, [
    'treinamento', 'treinamento escolhido', 'nome do treinamento', 'evento', 'curso', 'capacitação', 'capacitacao'
  ]);
  if (!trainingText) return null;

  const { data, error } = await supabase
    .from('academia_reservas')
    .select('id,titulo,inicio_em,status,tipo_registro')
    .eq('status', 'aprovada')
    .eq('tipo_registro', 'treinamento')
    .order('inicio_em', { ascending: false })
    .limit(250);
  if (error) throw error;
  const target = normalizeAcademyFormKey(trainingText);
  const matches = (data || []).filter(item => {
    const title = normalizeAcademyFormKey(item.titulo);
    return title === target || title.includes(target) || target.includes(title);
  });
  return matches.length === 1 ? matches[0].id : null;
}

async function processAcademyRegistrationsWebhook(req, supabase) {
  academyRegistrationsWebhookAuthorized(req);
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  if (body.dryRun === true) return { ok: true, dryRun: true, message: 'Conector de inscrições da Academia PMG autorizado.' };
  const values = body.values && typeof body.values === 'object' ? body.values : body;

  const name = cleanText(body.nome || body.name) || academyRegistrationValue(values, [
    'nome completo', 'nome do participante', 'participante', 'seu nome', 'nome'
  ]);
  if (!name) throw new Error('Não foi possível identificar o nome do participante na resposta');

  const email = cleanText(body.email) || academyRegistrationValue(values, ['e-mail', 'email', 'endereço de e-mail', 'endereco de email']);
  const phone = cleanText(body.telefone || body.phone) || academyRegistrationValue(values, ['telefone', 'celular', 'whatsapp', 'fone']);
  const sellerRaw = cleanText(body.vendedor || body.representante) || academyRegistrationValue(values, [
    'representante', 'nome do representante', 'vendedor', 'nome do vendedor', 'consultor'
  ]) || name;
  const sellerCode = cleanText(body.codigoVendedor || body.codigoRepresentante || body.vendedor_codigo) || academyRegistrationValue(values, [
    'código do representante', 'codigo do representante', 'código vendedor', 'codigo vendedor', 'id vendedor', 'id representante'
  ]);
  const trainingId = await resolveAcademyRegistrationTraining(supabase, body, values);
  const key = cleanText(body.responseId || body.response_id || body.chave || body.id)
    || `auto:${normalizeAcademyFormKey(name)}:${normalizeAcademyFormKey(email || phone || body.submittedAt || Date.now())}`;

  const payload = {
    _pmg_source: 'google_forms_automatico',
    _pmg_received_at: new Date().toISOString(),
    _pmg_submitted_at: cleanText(body.submittedAt || body.timestamp),
    _pmg_sheet: cleanText(body.sheetName),
    _pmg_row: body.row || null,
    values
  };

  const sellerCodeDigits = sellerCode ? String(sellerCode).replace(/\D+/g, '') || null : null;
  const row = {
    treinamento_id: trainingId,
    forms_linha_chave: key,
    nome_forms: name,
    email,
    telefone: phone,
    vendedor_raw: sellerRaw,
    vendedor_codigo: sellerCodeDigits,
    vendedor_nome: null,
    vinculo_status: 'pendente',
    forms_payload: payload,
    atualizado_em: new Date().toISOString()
  };

  const { data: existing, error: findError } = await supabase
    .from('academia_inscricoes')
    .select('id,vinculo_status,vendedor_nome,vendedor_codigo,treinamento_id,presente')
    .eq('forms_linha_chave', key)
    .maybeSingle();
  if (findError) throw findError;

  let result;
  if (existing?.id) {
    if (existing.vinculo_status === 'manual') {
      delete row.vendedor_raw;
      delete row.vendedor_codigo;
      delete row.vendedor_nome;
      delete row.vinculo_status;
    }
    if (!trainingId && existing.treinamento_id) delete row.treinamento_id;
    const { data, error } = await supabase
      .from('academia_inscricoes').update(row).eq('id', existing.id).select('id,treinamento_id').single();
    if (error) throw error;
    result = data;
  } else {
    const { data, error } = await supabase
      .from('academia_inscricoes').insert(row).select('id,treinamento_id').single();
    if (error) throw error;
    result = data;
  }

  return { ok: true, inscricaoId: result.id, treinamentoId: result.treinamento_id || null, chave: key };
}

async function processPending(supabase) {
  // Gera lembretes vencidos antes de buscar a fila. Assim a chamada feita
  // pelo navegador e a chamada do cron usam exatamente o mesmo fluxo.
  const { error: generationError } = await supabase.rpc('gerar_notificacoes_agenda');
  if (generationError && !/function .* does not exist/i.test(generationError.message || '')) {
    throw generationError;
  }

  const { error: automationError } = await supabase.rpc('processar_automacoes_periodicas');
  if (automationError && !/function .* does not exist/i.test(automationError.message || '')) {
    console.warn('[Demandas automacoes]', automationError.message);
  }

  const { error: summaryError } = await supabase.rpc('gerar_resumo_diario_demandas');
  if (summaryError && !/function .* does not exist/i.test(summaryError.message || '')) {
    console.warn('[Demandas resumo diario]', summaryError.message);
  }

  const { data: notifications, error: notificationsError } = await supabase
    .from('notificacoes')
    .select(`
      id,
      tarefa_id,
      lembrete_id,
      colaborador_id,
      tipo,
      nivel,
      mensagem,
      criado_em,
      tarefa:tarefas(id,titulo),
      lembrete:lembretes(id,titulo,tipo)
    `)
    .is('push_enviada_em', null)
    .order('criado_em', { ascending: true })
    .limit(150);

  if (notificationsError) throw notificationsError;
  if (!notifications?.length) return { processed: 0, delivered: 0, failed: 0 };

  const collaboratorIds = [...new Set(notifications.map(n => n.colaborador_id))];
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from('push_subscriptions')
    .select('id, colaborador_id, endpoint, p256dh, auth')
    .in('colaborador_id', collaboratorIds);

  if (subscriptionsError) throw subscriptionsError;

  const byCollaborator = new Map();
  for (const subscription of subscriptions || []) {
    const list = byCollaborator.get(subscription.colaborador_id) || [];
    list.push(subscription);
    byCollaborator.set(subscription.colaborador_id, list);
  }

  let delivered = 0;
  let failed = 0;

  for (const notification of notifications) {
    const targetSubscriptions = byCollaborator.get(notification.colaborador_id) || [];
    const payload = payloadFor(notification);

    // Sem inscrição, a notificação continua disponível dentro do sistema,
    // mas sai da fila de Push para não ficar sendo processada eternamente.
    if (!targetSubscriptions.length) {
      await markAsSent(supabase, notification.id);
      continue;
    }

    let hadSuccess = false;
    let hadTransientFailure = false;

    for (const subscription of targetSubscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          },
          payload,
          { TTL: 60 * 60 * 24, urgency: 'high' }
        );
        hadSuccess = true;
        delivered += 1;
      } catch (error) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await deleteExpiredSubscription(supabase, subscription.endpoint);
        } else {
          hadTransientFailure = true;
          failed += 1;
          console.error('[Demandas push]', notification.id, statusCode, error?.message);
        }
      }
    }

    if (hadSuccess || !hadTransientFailure) {
      await markAsSent(supabase, notification.id);
    }
  }

  return { processed: notifications.length, delivered, failed };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  // Configuração pública usada pelo navegador. A chave anon/publishable do
  // Supabase é própria para uso no frontend; a service_role nunca é enviada.
  if (req.method === 'GET' && String(req.query?.config || '') === '1') {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({
        erro: 'Configure SUPABASE_URL e SUPABASE_ANON_KEY nas variáveis de ambiente.'
      });
    }
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      supabaseUrl,
      supabaseAnonKey,
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
      academyRegistrationWebhookReady: Boolean(process.env.ACADEMIA_INSCRICOES_WEBHOOK_SECRET)
    });
  }

  try {
    // O mesmo endpoint recebe respostas do Forms via Power Automate sem criar
    // outra função Serverless. Isso preserva o limite do plano Hobby da Vercel.
    if (req.method === 'POST' && String(req.query?.academia || '') === 'inscricoes') {
      await loadDependencies();
      const supabase = makeSupabase();
      const result = await processAcademyRegistrationsWebhook(req, supabase);
      return res.status(200).json(result);
    }

    if (req.method === 'POST' && String(req.query?.academia || '') === 'forms') {
      await loadDependencies();
      const supabase = makeSupabase();
      const result = await processAcademyFormsWebhook(req, supabase);
      return res.status(200).json(result);
    }

    // Carrega dependências pesadas somente nas chamadas de envio.
    // A rota pública ?config=1 funciona sem importar web-push ou Supabase Admin.
    await loadDependencies();
    const supabase = makeSupabase();
    configureWebPush();
    await authorize(req, supabase);
    const result = await processPending(supabase);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const unauthorized = /autorizado|sessão inválida|webhook.*não autorizado/i.test(error.message);
    console.error('[notificar-demandas]', error);
    return res.status(unauthorized ? 401 : 500).json({ erro: error.message });
  }
}
