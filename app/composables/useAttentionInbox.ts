import type { AttentionEvent } from '#shared/contracts/attention'
import {
  attentionEventListSchema,
  attentionEventResponseSchema,
  attentionEventSchema,
  dismissAllAttentionEventsResponseSchema,
} from '#shared/contracts/attention'
import { BrowserWebSocketTransportFactory } from '~/terminal/browser-websocket-transport'
import type { TerminalTransport } from '~/terminal/terminal-transport'
import { mergeAttentionSnapshots } from '~/attention/inbox-state'

function attentionWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws`
}

export function useAttentionInbox() {
  const events = ref<AttentionEvent[]>([])
  const loading = ref(false)
  const dismissingAll = ref(false)
  const error = ref<string | null>(null)
  let disposed = false
  let reconnectDelayMs = 1_000
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let transport: TerminalTransport | null = null
  const visibleEvents = computed(() => events.value.filter(event => !event.dismissedAt))
  const unreadCount = computed(() => events.value.filter(event => !event.readAt && !event.dismissedAt).length)

  function merge(event: AttentionEvent): void {
    events.value = mergeAttentionSnapshots(events.value, [event])
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const response = attentionEventListSchema.parse(await $fetch('/api/attention'))
      events.value = mergeAttentionSnapshots(events.value, response.events)
    }
    catch {
      error.value = 'Unable to load Agent Inbox.'
    }
    finally {
      loading.value = false
    }
  }

  async function update(id: string, action: 'dismiss' | 'read'): Promise<void> {
    const response = attentionEventResponseSchema.parse(await $fetch(`/api/attention/${encodeURIComponent(id)}`, {
      body: { action },
      method: 'PATCH',
    }))
    merge(response.event)
  }

  async function dismissAll(): Promise<void> {
    if (dismissingAll.value || visibleEvents.value.length === 0) return
    dismissingAll.value = true
    error.value = null
    try {
      const response = dismissAllAttentionEventsResponseSchema.parse(await $fetch('/api/attention', {
        body: { action: 'dismiss' },
        method: 'PATCH',
      }))
      const dismissedIds = new Set(response.ids)
      const dismissedEvents = events.value
        .filter(event => dismissedIds.has(event.id))
        .map(event => ({ ...event, dismissedAt: response.dismissedAt }))
      events.value = mergeAttentionSnapshots(events.value, dismissedEvents)
    }
    catch {
      error.value = 'Unable to dismiss Agent Inbox.'
    }
    finally {
      dismissingAll.value = false
    }
  }

  function handleRealtime(event: Event): void {
    const parsed = attentionEventSchema.safeParse((event as CustomEvent).detail)
    if (parsed.success) merge(parsed.data)
  }

  function connectAttentionSocket(): void {
    if (disposed) return
    let reconnectScheduled = false
    const reconnect = () => {
      if (disposed || reconnectScheduled) return
      reconnectScheduled = true
      const failedTransport = transport
      transport = null
      failedTransport?.close()
      const jitteredDelay = reconnectDelayMs * (0.8 + Math.random() * 0.4)
      reconnectTimer = setTimeout(connectAttentionSocket, jitteredDelay)
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000)
    }
    transport = new BrowserWebSocketTransportFactory(attentionWebSocketUrl).create({
      onClose: reconnect,
      onError: reconnect,
      onMessage: () => {},
      onOpen: () => { reconnectDelayMs = 1_000 },
      onProtocolError: () => {},
    })
  }

  onMounted(() => {
    window.addEventListener('bitveins:attention-event', handleRealtime)
    connectAttentionSocket()
    refreshTimer = setInterval(() => void refresh(), 15_000)
    void refresh()
  })
  onBeforeUnmount(() => {
    disposed = true
    window.removeEventListener('bitveins:attention-event', handleRealtime)
    transport?.close()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (refreshTimer) clearInterval(refreshTimer)
  })

  return {
    dismiss: (id: string) => update(id, 'dismiss'),
    dismissAll,
    dismissingAll,
    error,
    events: visibleEvents,
    loading,
    markRead: (id: string) => update(id, 'read'),
    refresh,
    unreadCount,
  }
}
