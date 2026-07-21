const CACHE = 'caramel-shell-v1';
const MSGS = [
  'Caramel s\u2019ennuie sans toi \ud83d\udc34 Une petite course ?',
  'Tes \u00e9toiles t\u2019attendent \u2b50 Viens d\u00e9bloquer la suite !',
  'Zip le papillon croit que tu as abandonn\u00e9... \ud83e\udd8b Prouve-lui le contraire !',
  'Cinq minutes de lecture = un poney tr\u00e8s heureux \ud83c\udf4e',
  'Tu me manques ! Une histoire avant le d\u00eener ? \ud83d\udcd6'
];
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/models/')) return; /* le gros modele a deja son propre cache */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put('shell-index', copy));
        return r;
      }).catch(() => caches.match('shell-index'))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }))
  );
});
self.addEventListener('periodicsync', e => {
  if (e.tag === 'caramel-daily') {
    e.waitUntil(self.registration.showNotification('La course de Caramel \ud83d\udc34', {
      body: MSGS[new Date().getDate() % MSGS.length],
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'caramel-daily'
    }));
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow('./');
  }));
});
