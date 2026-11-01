// App-shell cache so the app opens instantly and offline. Sending is never cached.
const CACHE = "foodsnap-v4";
const SHELL = ["./", "index.html", "app.js", "config.js", "style.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  // network-first so updates arrive, fall back to cache offline
  e.respondWith(fetch(r).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(r, cp)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match("./"))));
});
