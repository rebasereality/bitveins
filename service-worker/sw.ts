/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { pushNotificationPayloadSchema } from '../shared/contracts/attention'
import { resolveInternalNotificationUrl } from './notification-navigation'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ revision?: string, url: string }> }

interface WebPushNotificationOptions extends NotificationOptions {
  actions: Array<{ action: string, title: string }>
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
self.skipWaiting()

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload
    try {
      payload = pushNotificationPayloadSchema.parse(event.data?.json())
    }
    catch {
      return
    }
    const url = resolveInternalNotificationUrl(payload.data.url, self.location.origin)
    const options: WebPushNotificationOptions = {
      actions: [
        { action: 'open', title: 'Open session' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
      badge: '/icons/bitveins-hand-192x192.png',
      body: payload.body,
      data: { url },
      icon: '/icons/bitveins-hand-192x192.png',
      tag: payload.tag,
    }
    await self.registration.showNotification(payload.title, options as NotificationOptions)
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  event.waitUntil((async () => {
    const raw = (event.notification.data as { url?: unknown } | undefined)?.url
    const url = resolveInternalNotificationUrl(raw, self.location.origin)
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    for (const client of clients) {
      if ('navigate' in client) await client.navigate(url)
      await client.focus()
      return
    }
    await self.clients.openWindow(url)
  })())
})
