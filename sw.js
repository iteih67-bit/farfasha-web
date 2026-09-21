/* Service worker بسيط: يجعل التطبيق قابلاً للتثبيت ويعمل عند انقطاع الشبكة.
   سياسة: لا نخزّن أي شيء حسّاس؛ الشل فقط. الصوت والشات يحتاجان الشبكة دائمًا. */
const CACHE = 'farfasha-shell-v3';
const SHELL = ['./', './index.html', './assets/app.css', './assets/app.js', './assets/config.js', './assets/icon.svg', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // لا نتدخّل في نداءات الـAPI أو الصوت — دائمًا شبكة.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
  );
});
