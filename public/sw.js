self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'PMG Atacadista', {
      body: data.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { url: data.url || '/fornecedores.html' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});