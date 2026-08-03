import type { PushSubscriptionInput } from '../../shared/contracts/attention'

interface PushConfiguration {
  preference: { showDetails: boolean }
  publicKey: string
}

interface BrowserPushApi {
  loadConfiguration(): Promise<PushConfiguration>
  removeSubscription(endpoint: string): Promise<void>
  saveSubscription(subscription: PushSubscriptionInput): Promise<void>
}

interface NotificationFacade {
  permission: NotificationPermission
  requestPermission(): Promise<NotificationPermission>
}

interface ServiceWorkerFacade {
  ready: Promise<{ pushManager: PushManager }>
}

export type PushEnableResult = 'denied' | 'subscribed' | 'unsupported'

export class BrowserPushManager {
  constructor(private readonly options: {
    api: BrowserPushApi
    notification?: NotificationFacade
    serviceWorker?: ServiceWorkerFacade
  }) {}

  get supported(): boolean {
    return Boolean(this.options.notification && this.options.serviceWorker)
  }

  get permission(): NotificationPermission | 'unsupported' {
    return this.options.notification?.permission ?? 'unsupported'
  }

  async enable(): Promise<PushEnableResult> {
    const notification = this.options.notification
    const serviceWorker = this.options.serviceWorker
    if (!notification || !serviceWorker) return 'unsupported'

    const permission = notification.permission === 'default'
      ? await notification.requestPermission()
      : notification.permission
    if (permission !== 'granted') return 'denied'

    const [{ publicKey }, registration] = await Promise.all([
      this.options.api.loadConfiguration(),
      serviceWorker.ready,
    ])
    let subscription = await registration.pushManager.getSubscription?.()
    subscription ??= await registration.pushManager.subscribe({
      applicationServerKey: decodeBase64Url(publicKey).buffer as ArrayBuffer,
      userVisibleOnly: true,
    })
    const value = subscription.toJSON()
    if (!value.endpoint || !value.keys?.auth || !value.keys.p256dh) {
      throw new Error('The browser returned an invalid push subscription.')
    }
    await this.options.api.saveSubscription({
      endpoint: value.endpoint,
      keys: { auth: value.keys.auth, p256dh: value.keys.p256dh },
    })
    return 'subscribed'
  }

  async disable(): Promise<void> {
    const serviceWorker = this.options.serviceWorker
    if (!serviceWorker) return
    const registration = await serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return
    await this.options.api.removeSubscription(subscription.endpoint)
    await subscription.unsubscribe()
  }
}

export function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
