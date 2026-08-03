import { BrowserPushManager, type PushEnableResult } from '~/attention/browser-push-manager'
import { pushPublicConfigurationSchema } from '#shared/contracts/attention'

export function useWebPushNotifications() {
  const supported = ref(false)
  const permission = ref<NotificationPermission | 'unsupported'>('unsupported')
  const subscribed = ref(false)
  const showDetails = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  let manager: BrowserPushManager | null = null

  async function load(): Promise<void> {
    if (!import.meta.client) return
    const notification = 'Notification' in window ? window.Notification : undefined
    const serviceWorker = 'serviceWorker' in navigator && 'PushManager' in window
      ? navigator.serviceWorker
      : undefined
    manager = new BrowserPushManager({
      api: {
        loadConfiguration: async () => {
          const configuration = pushPublicConfigurationSchema.parse(
            await $fetch('/api/attention/push'),
          )
          showDetails.value = configuration.preference.showDetails
          return configuration
        },
        removeSubscription: endpoint => $fetch('/api/attention/push/subscriptions', {
          body: { endpoint }, method: 'DELETE',
        }).then(() => undefined),
        saveSubscription: subscription => $fetch('/api/attention/push/subscriptions', {
          body: subscription, method: 'POST',
        }).then(() => undefined),
      },
      notification,
      serviceWorker,
    })
    supported.value = manager.supported
    permission.value = manager.permission
    if (!manager.supported || !serviceWorker) return
    const registration = await serviceWorker.ready
    const existingSubscription = await registration.pushManager.getSubscription()
    const configuration = pushPublicConfigurationSchema.parse(await $fetch('/api/attention/push', {
      query: existingSubscription ? { endpoint: existingSubscription.endpoint } : {},
    }))
    showDetails.value = configuration.preference.showDetails
    subscribed.value = Boolean(existingSubscription)
  }

  async function run(operation: () => Promise<void>): Promise<void> {
    busy.value = true
    error.value = null
    try {
      await operation()
    }
    catch {
      error.value = 'Unable to update notification settings.'
    }
    finally {
      busy.value = false
    }
  }

  async function enable(): Promise<PushEnableResult | undefined> {
    let result: PushEnableResult | undefined
    await run(async () => {
      if (!manager) await load()
      result = await manager!.enable()
      permission.value = manager!.permission
      subscribed.value = result === 'subscribed'
      if (subscribed.value) showDetails.value = false
    })
    return result
  }

  async function disable(): Promise<void> {
    await run(async () => {
      await manager?.disable()
      subscribed.value = false
      showDetails.value = false
    })
  }

  async function setShowDetails(value: boolean): Promise<void> {
    await run(async () => {
      if (!('serviceWorker' in navigator)) throw new Error('Service Worker is unavailable.')
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) throw new Error('Web Push is not subscribed.')
      const response = await $fetch<{ preference: { showDetails: boolean } }>('/api/attention/push/preferences', {
        body: { endpoint: subscription.endpoint, showDetails: value },
        method: 'PUT',
      })
      showDetails.value = response.preference.showDetails
    })
  }

  async function test(): Promise<void> {
    await run(async () => {
      await $fetch('/api/attention/test', { method: 'POST' })
    })
  }

  async function localTest(): Promise<void> {
    await run(async () => {
      if (!manager) await load()
      await manager!.showLocalTest()
    })
  }

  onMounted(() => void load())

  return {
    busy,
    disable,
    enable,
    error,
    localTest,
    permission,
    setShowDetails,
    showDetails,
    subscribed,
    supported,
    test,
  }
}
