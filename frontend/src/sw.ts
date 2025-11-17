/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST?: Array<{ url: string }>;
};

const PRECACHE = 'fuchspos-precache-v1';
const PRECACHE_URLS = (self.__WB_MANIFEST ?? []).map(entry => entry.url);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== PRECACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response;
      }
      return fetch(event.request).then(networkResponse => {
        const clone = networkResponse.clone();
        caches.open(PRECACHE).then(cache => cache.put(event.request, clone));
        return networkResponse;
      });
    }),
  );
});

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? 'FuchsPOS Update';
  const body = data.body ?? 'Neue Benachrichtigung';
  const notificationData = data.data ?? {};
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: notificationData,
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && (event.notification.data as { url?: string }).url) ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          const windowClient = client as WindowClient;
          if (windowClient.url.includes(self.origin ?? '') && 'navigate' in windowClient) {
            windowClient.navigate(targetUrl);
            return windowClient.focus();
          }
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
