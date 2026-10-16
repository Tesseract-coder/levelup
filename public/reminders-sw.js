/* LevelUp reminder handler, imported by the generated service worker. */
function readConfig() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('levelup-sw', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const tx = req.result.transaction('kv', 'readwrite');
        const store = tx.objectStore('kv');
        const get = store.get('config');
        get.onsuccess = () => resolve({ store: req.result, config: get.result });
        get.onerror = () => resolve(null);
      };
    } catch (e) {
      resolve(null);
    }
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}

async function fireDue() {
  const res = await readConfig();
  if (!res || !res.config || !res.config.reminders || !res.config.reminders.enabled) return;
  const { reminders, text, windowMin } = res.config;
  const now = new Date();
  const day = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const kind of ['meals', 'workout', 'evening']) {
    const at = reminders[kind];
    if (!at) continue;
    const [h, m] = at.split(':').map(Number);
    const due = h * 60 + m;
    if (mins < due || mins > due + windowMin) continue;
    const key = 'fired-' + kind + '-' + day;
    const already = await new Promise((r) => {
      const g = res.store.transaction('kv').objectStore('kv').get(key);
      g.onsuccess = () => r(!!g.result);
      g.onerror = () => r(false);
    });
    if (already) continue;
    res.store.transaction('kv', 'readwrite').objectStore('kv').put(1, key);
    const t = text[kind];
    await self.registration.showNotification(t.title, { body: t.body, icon: '/icons/icon-192.png', badge: '/icons/favicon-64.png', tag: 'levelup-' + kind, data: { url: t.url } });
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'levelup-reminders') event.waitUntil(fireDue());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
