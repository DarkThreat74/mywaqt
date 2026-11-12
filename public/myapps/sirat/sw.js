// Sirat service worker. Bump VERSION whenever index.html changes.
const VERSION = "fa-v9";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("fa-") && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  // Page loads: try the network, but fall back to the saved copy after 3 seconds so a weak signal never hangs the app.
  if (e.request.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match("index.html");
      const net = fetch(e.request).then(r => { if (r && r.ok) cache.put("index.html", r.clone()); return r; });
      e.waitUntil(net.catch(() => {}));
      if (!cached) return net;
      return Promise.race([net, new Promise(res => setTimeout(() => res(cached), 3000))]).catch(() => cached);
    })());
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(m => m || fetch(e.request).then(r => { if (r && r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(e.request, c)); } return r; })));
});
