self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text?.() || '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'PMG Connect', {
      body: data.body || '',
      icon: data.icon || '/imagenssite/pmglogo.png',
      badge: data.badge || '/imagenssite/pmglogo.png',
      tag: data.tag || undefined,
      renotify: false,
      requireInteraction: Boolean(data.reminderId) || ['critica','importante'].includes(data.level),
      actions: Array.isArray(data.actions) ? data.actions : [],
      data: {
        url: data.url || '/central.html',
        reminderId: data.reminderId || null,
        taskId: data.taskId || null
      }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  let path = data.url || '/central.html';

  if (event.action === 'snooze-10' && data.reminderId) {
    path = `/demandas.html?adiar_lembrete=${encodeURIComponent(data.reminderId)}`;
  } else if (event.action === 'complete' && data.reminderId) {
    path = `/demandas.html?concluir_lembrete=${encodeURIComponent(data.reminderId)}`;
  }

  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windowClients => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) await client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
