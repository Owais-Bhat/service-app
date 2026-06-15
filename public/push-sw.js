// Push-only service worker — separate from the PWA precache SW so it can't
// interfere with offline caching. Handles incoming Web Push + notification taps.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'Networking Experts';
  const payloadData = Object.assign({}, data.data || {});
  if (data.subject && !payloadData.subject) payloadData.subject = data.subject;
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: payloadData,
    tag: payloadData.ticket_no ? 'ticket-' + payloadData.ticket_no : undefined,
    renotify: true,
    requireInteraction: true,       // stays until tapped — acts as an alert
    vibrate: [200, 100, 200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Hand the full payload to the app so it opens the full-screen detail card.
  const detail = {
    type: 'notification-click',
    subject: (event.notification.data && event.notification.data.subject) || null,
    title: event.notification.title || '',
    body: event.notification.body || '',
    data: event.notification.data || {},
    created_at: Date.now(),
  };
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { try { w.postMessage(detail); } catch (e) {} return w.focus(); }
      }
      if (clients.openWindow) {
        return clients.openWindow('/').then((w) => { if (w) { try { w.postMessage(detail); } catch (e) {} } });
      }
    })
  );
});
