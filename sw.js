// Earlier versions of the planner (up to v0.4.1) installed a service worker that kept an offline copy.
// The planner now needs the network for its map, so this worker only removes that copy and itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
