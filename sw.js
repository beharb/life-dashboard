/* Keeps the app working offline. Online it fetches the newest files first (3 s limit),
   so a new upload to GitHub Pages shows up on the next launch. Google API calls are never cached. */
const CACHE = "life-dashboard-v2";
const FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/store.js", "./js/ui.js", "./js/charts.js", "./js/google.js",
  "./js/notify.js", "./js/feedback.js", "./js/views.js", "./js/checkin.js", "./js/data.js",
  "./icons/icon-180.png", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = await Promise.race([fetch(e.request, { cache: "no-cache" }), new Promise((_, rej) => setTimeout(() => rej("timeout"), 3000))]);
      if (net && net.ok) cache.put(e.request, net.clone());
      return net;
    } catch {
      return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match("./index.html"));
    }
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./#today";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
