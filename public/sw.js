self.addEventListener('install', (event) => {
  const basePath = self.location.pathname.replace('sw.js', '')
  
  event.waitUntil(
    caches.open('tracelog-shell-v1').then((cache) =>
      cache.addAll([
        basePath,
        basePath + 'manifest.webmanifest',
        basePath + 'favicon.svg'
      ]),
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

  const requestUrl = new URL(event.request.url)
  const isSameOrigin = requestUrl.origin === self.location.origin
  const shouldRuntimeCache = isSameOrigin && ['document', 'script', 'style', 'image', 'font'].includes(event.request.destination)

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(event.request)
        .then((response) => {
          if (!shouldRuntimeCache || !response.ok) {
            return response
          }

          const cloned = response.clone()
          void caches.open('tracelog-runtime-v1').then((cache) => cache.put(event.request, cloned))
          return response
        })
        .catch(async () => {
          if (event.request.mode === 'navigate') {
            const basePath = self.location.pathname.replace('sw.js', '')
            const fallback = await caches.match(basePath)
            if (fallback) return fallback
          }

          throw new Error('Offline cache miss')
        })
    }),
  )
})

self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {}
  const title = payload.title || 'TraceLog'
  const basePath = self.location.pathname.replace('sw.js', '')
  const options = {
    body: payload.body || 'Gunluk ozetin hazir.',
    icon: basePath + 'favicon.svg',
    badge: basePath + 'favicon.svg',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})
