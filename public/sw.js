self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('takip-shell-v1').then((cache) =>
      cache.addAll(['/', '/manifest.webmanifest', '/favicon.svg']),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(event.request)
    }),
  )
})

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {}
  const title = payload.title || 'Takip'
  const options = {
    body: payload.body || 'Gunluk ozetin hazir.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})
