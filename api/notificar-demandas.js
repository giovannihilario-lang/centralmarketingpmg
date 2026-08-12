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
  prazo_alterado: 'O prazo de uma demanda mudou',
  comentario: 'Há um novo comentário em uma demanda',
  status_mudou: 'Uma demanda foi atualizada',
  demanda_imediata: 'DEMANDA IMEDIATA · abra agora',
  avaliacao_pendente: 'Uma demanda aguarda sua avaliação',
  avaliacao_aprovada: 'A conclusão da demanda foi aprovada',
  avaliacao_ajustes: 'A demanda voltou para ajustes',
  transferencia: 'Uma demanda foi transferida para você',
  lembrete: 'Está na hora do seu lembrete'
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
  const isImmediate = notification.tipo === 'demanda_imediata' || task?.prioridade === 'imediata';
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
    : [{ action: 'open', title: isImmediate ? 'ABRIR AGORA' : 'Abrir demanda' }];

  const taskMeta = task
    ? [task.prioridade ? `Prioridade: ${String(task.prioridade).toUpperCase()}` : '', task.prazo_em ? `Prazo: ${new Date(task.prazo_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''].filter(Boolean).join(' · ')
    : '';

  return JSON.stringify({
    title: isImmediate ? 'PMG CONNECT · DEMANDA IMEDIATA' : isReminder ? 'PMG Connect · Agenda' : 'PMG Connect · Demandas',
    body: isImmediate ? `${itemTitle}\n${taskMeta || heading}` : `${heading}: ${itemTitle}${taskMeta ? ` · ${taskMeta}` : ''}`,
    icon: '/imagenssite/pmglogo.png',
    badge: '/imagenssite/pmglogo.png',
    tag: isImmediate ? `pmg-imediata-${notification.tarefa_id}` : `pmg-${notification.id}`,
    url,
    actions,
    reminderId: notification.lembrete_id || null,
    taskId: notification.tarefa_id || null,
    immediate: isImmediate
  });
}

async function processPending(supabase) {
  // Gera lembretes vencidos antes de buscar a fila. Assim a chamada feita
  // pelo navegador e a chamada do cron usam exatamente o mesmo fluxo.
  const { error: generationError } = await supabase.rpc('gerar_notificacoes_agenda');
  if (generationError && !/function .* does not exist/i.test(generationError.message || '')) {
    throw generationError;
  }

  const { data: notifications, error: notificationsError } = await supabase
    .from('notificacoes')
    .select(`
      id,
      tarefa_id,
      lembrete_id,
      colaborador_id,
      tipo,
      mensagem,
      criado_em,
      tarefa:tarefas(id,titulo,prioridade,prazo_em,status),
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
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || ''
    });
  }

  try {
    // Carrega dependências pesadas somente nas chamadas de envio.
    // A rota pública ?config=1 funciona sem importar web-push ou Supabase Admin.
    await loadDependencies();
    const supabase = makeSupabase();
    configureWebPush();
    await authorize(req, supabase);
    const result = await processPending(supabase);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    const unauthorized = /autorizado|sessão inválida/i.test(error.message);
    console.error('[notificar-demandas]', error);
    return res.status(unauthorized ? 401 : 500).json({ erro: error.message });
  }
}
