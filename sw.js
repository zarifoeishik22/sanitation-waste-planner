// Offline copy of the planner's own files. Network first: when online the newest version is always used and stored;
// when offline the stored copy answers. Only same-origin GET requests are handled; nothing the user types is stored.
const CACHE = 'planner-v0.3';
// Every file the page can ask for, so the tool works offline after one visit (tests/offline.test.mjs keeps this list complete).
const PRECACHE = [
 "./",
 "index.html",
 "css/site.css",
 "js/ui/app.js",
 "js/ui/context.js",
 "js/ui/scene.js",
 "js/ui/util.js",
 "js/ui/views.js",
 "js/parsers/pdf-text.js",
 "js/parsers/sfd-report.js",
 "js/parsers/wfd-portal.js",
 "js/engine/cost.js",
 "js/engine/custom.js",
 "js/engine/decisions.js",
 "js/engine/drain.js",
 "js/engine/flags.js",
 "js/engine/plan.js",
 "js/engine/pubindex.js",
 "js/engine/scenario.js",
 "js/engine/sfd.js",
 "js/engine/sizing.js",
 "js/engine/verdict.js",
 "js/engine/wfd.js",
 "data/benchmarks.json",
 "data/costs.json",
 "data/params.json",
 "data/pubindex.json",
 "data/rules.json",
 "data/sfd.json",
 "data/sizing.json",
 "data/strings.en.json",
 "data/towns.json",
 "data/wfd.json",
 "vendor/pdfjs/pdf.min.mjs",
 "vendor/pdfjs/pdf.worker.min.mjs",
 "vendor/fonts/hind-siliguri-latin-400-normal.woff2",
 "vendor/fonts/hind-siliguri-latin-500-normal.woff2",
 "vendor/fonts/hind-siliguri-latin-600-normal.woff2",
 "vendor/fonts/hind-siliguri-latin-700-normal.woff2"
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
