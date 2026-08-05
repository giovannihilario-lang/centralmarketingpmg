import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const NOTIFICATION_TEXT = {
  nova_tarefa: 'Você recebeu uma nova demanda',
  prazo_proximo: 'Uma demanda está perto do prazo',
  comentario: 'Há um novo comentário em uma demanda',
  status_mudou: 'O status de uma demanda foi alterado'
};

function makeSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
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

  // O Vercel envia CRON_SECRET automaticamente no header Authorization.
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

async function processPending(supabase) {
  const { data: notifications, error: notificationsError } = await supabase
    .from('notificacoes')
    .select('id, tarefa_id, colaborador_id, tipo, criado_em, tarefas(titulo)')
    .is('push_enviada_em', null)
    .order('criado_em', { ascending: true })
    .limit(100);

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
    const title = 'PMG Connect · Demandas';
    const taskTitle = notification.tarefas?.titulo || 'Demanda atualizada';
    const payload = JSON.stringify({
      title,
      body: `${NOTIFICATION_TEXT[notification.tipo] || 'Atualização'}: ${taskTitle}`,
      icon: '/imagenssite/pmglogo.png',
      badge: '/imagenssite/pmglogo.png',
      tag: notification.id,
      url: `/demandas.html?tarefa=${notification.tarefa_id || ''}`
    });

    // Sem inscrição registrada, a notificação fica somente dentro do sistema.
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
          payload
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

    // Marca como tratada quando houve entrega ou quando só existiam inscrições expiradas.
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

  try {
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
