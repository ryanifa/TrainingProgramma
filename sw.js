/* sw.js — eenvoudige offline cache voor de app-shell */
const CACHE = "zwemtraining-1.2.1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./parser.js",
  "./gist.js",
  "./timer.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // wacht met activeren tot de gebruiker op "Vernieuwen" tikt
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;      // CDN (pdf.js) → standaard netwerk
  if (e.request.method !== "GET") return;
  // Eerst netwerk (altijd de nieuwste versie), val terug op cache als offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
