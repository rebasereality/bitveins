import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import {
  notificationSessionMuteListSchema,
  type AttentionEvent,
} from '#shared/contracts/attention'
import { isSessionId } from '#shared/navigation/session-route'
import {
  PUSH_SUBSCRIPTION_CHANGED_EVENT,
  PUSH_SUBSCRIPTION_REVISION_KEY,
  SESSION_NOTIFICATION_MUTES_CHANGED_EVENT,
} from '~/attention/push-subscription-events'

interface SessionNotificationMuteOptions {
  sessionId: Readonly<Ref<string | null>>
}

export const MUTED_NOTIFICATION_SESSION_IDS_KEY = 'bitveins.mutedNotificationSessionIds'

export function parseMutedNotificationSessionIds(value: string | null): Set<string> {
  if (!value) return new Set()
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter(item => typeof item === 'string' && isSessionId(item)))
  }
  catch {
    return new Set()
  }
}

export function useSessionNotificationMute(options: SessionNotificationMuteOptions) {
  const busy = ref(false)
  const error = ref(false)
  const mutedSessionIds = ref<Set<string>>(readStoredMutes())
  const subscriptionAvailable = ref(false)
  let endpoint: string | null = null

  const available = computed(() => subscriptionAvailable.value && Boolean(options.sessionId.value))
  const muted = computed(() => Boolean(
    options.sessionId.value && mutedSessionIds.value.has(options.sessionId.value),
  ))

  function readStoredMutes(): Set<string> {
    if (typeof window === 'undefined') return new Set()
    return parseMutedNotificationSessionIds(window.localStorage.getItem(MUTED_NOTIFICATION_SESSION_IDS_KEY))
  }

  function replaceMutes(sessionIds: Iterable<string>): void {
    mutedSessionIds.value = new Set(sessionIds)
    window.localStorage.setItem(
      MUTED_NOTIFICATION_SESSION_IDS_KEY,
      JSON.stringify([...mutedSessionIds.value].sort()),
    )
    window.dispatchEvent(new Event(SESSION_NOTIFICATION_MUTES_CHANGED_EVENT))
  }

  function suppresses(event: AttentionEvent): boolean {
    return Boolean(event.sessionId && mutedSessionIds.value.has(event.sessionId))
  }

  async function load(): Promise<void> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      endpoint = null
      subscriptionAvailable.value = false
      replaceMutes([])
      return
    }
    const registration = await navigator.serviceWorker.ready
    endpoint = (await registration.pushManager.getSubscription())?.endpoint ?? null
    subscriptionAvailable.value = Boolean(endpoint)
    if (!endpoint) {
      replaceMutes([])
      error.value = false
      return
    }
    const response = notificationSessionMuteListSchema.parse(await $fetch(
      '/api/attention/push/session-mutes',
      { query: { endpoint } },
    ))
    subscriptionAvailable.value = response.subscribed
    replaceMutes(response.sessionIds)
    error.value = false
  }

  async function toggle(): Promise<void> {
    const sessionId = options.sessionId.value
    if (!available.value || busy.value || !endpoint || !sessionId) return
    busy.value = true
    try {
      const response = await $fetch<{ muted: boolean }>('/api/attention/push/session-mutes', {
        body: { endpoint, muted: !muted.value, sessionId },
        method: 'PUT',
      })
      const nextMutes = new Set(mutedSessionIds.value)
      if (response.muted) nextMutes.add(sessionId)
      else nextMutes.delete(sessionId)
      replaceMutes(nextMutes)
      error.value = false
    }
    catch {
      error.value = true
    }
    finally {
      busy.value = false
    }
  }

  function handleSubscriptionChange(): void {
    void load().catch(() => {
      error.value = true
    })
  }

  function handleStorage(event: StorageEvent): void {
    if (event.key === MUTED_NOTIFICATION_SESSION_IDS_KEY) {
      mutedSessionIds.value = parseMutedNotificationSessionIds(event.newValue)
      window.dispatchEvent(new Event(SESSION_NOTIFICATION_MUTES_CHANGED_EVENT))
    }
    else if (event.key === PUSH_SUBSCRIPTION_REVISION_KEY) {
      handleSubscriptionChange()
    }
  }

  onMounted(() => {
    window.addEventListener(PUSH_SUBSCRIPTION_CHANGED_EVENT, handleSubscriptionChange)
    window.addEventListener('storage', handleStorage)
    void load().catch(() => {
      error.value = true
    })
  })

  onBeforeUnmount(() => {
    window.removeEventListener(PUSH_SUBSCRIPTION_CHANGED_EVENT, handleSubscriptionChange)
    window.removeEventListener('storage', handleStorage)
  })

  return { available, busy, error, muted, suppresses, toggle }
}
