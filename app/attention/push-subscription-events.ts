export const PUSH_SUBSCRIPTION_CHANGED_EVENT = 'bitveins:push-subscription-changed'
export const PUSH_SUBSCRIPTION_REVISION_KEY = 'bitveins.pushSubscriptionRevision'
export const SESSION_NOTIFICATION_MUTES_CHANGED_EVENT = 'bitveins:session-notification-mutes-changed'

export function announcePushSubscriptionChanged(): void {
  window.localStorage.setItem(PUSH_SUBSCRIPTION_REVISION_KEY, `${Date.now()}:${Math.random()}`)
  window.dispatchEvent(new Event(PUSH_SUBSCRIPTION_CHANGED_EVENT))
}
