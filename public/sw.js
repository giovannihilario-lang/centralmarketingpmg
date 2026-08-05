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
      data: { url: data.url || '/central.html' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/central.html', self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
