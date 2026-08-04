import type { ComputedRef, Ref } from 'vue'
import type { TmuxSession, TmuxWindow } from '#shared/contracts/terminal'
import type { SessionRouteTarget } from '#shared/navigation/session-route'
import {
  explorerSessionRoute,
  parseSessionRoute,
  terminalSessionRoute,
} from '#shared/navigation/session-route'
import type { ExplorerViewMode } from '~/utils/explorer-view-mode'

interface PermalinkOptions {
  activeFilePath: Ref<string | null>
  activeSession: Ref<string | null>
  activeWindow: ComputedRef<TmuxWindow | null>
  applyTarget: (target: SessionRouteTarget, token: number) => Promise<boolean>
  onInvalid: (message: string) => void
  sessions: Ref<TmuxSession[]>
  viewMode: Ref<ExplorerViewMode>
}

export function useSessionPermalinkNavigation(options: PermalinkOptions) {
  let applying = false
  let generation = 0
  let replaceNextChange = false
  let scheduled = false
  let started = false
  const eventId = ref<string | undefined>()

  function currentCanonicalUrl(): string | null {
    const name = options.activeSession.value
    if (!name) return '/'
    const session = options.sessions.value.find(candidate => candidate.name === name)
    if (!session) return null
    if (options.viewMode.value === 'explorer') {
      return explorerSessionRoute(session, options.activeFilePath.value, eventId.value)
    }
    const window = options.activeWindow.value
    if (!window) return null
    return terminalSessionRoute(session, window.id, eventId.value)
  }

  function writeCanonical(mode: 'push' | 'replace'): boolean {
    if (!started || applying) return false
    const url = currentCanonicalUrl()
    if (!url) return false
    const current = `${window.location.pathname}${window.location.search}`
    if (current === url) return true
    window.history[mode === 'replace' ? 'replaceState' : 'pushState'](null, '', url)
    return true
  }

  function scheduleStateNavigation(): void {
    if (!started || applying || scheduled) return
    scheduled = true
    void nextTick(() => {
      scheduled = false
      const mode = replaceNextChange ? 'replace' : 'push'
      if (writeCanonical(mode)) replaceNextChange = false
    })
  }

  watch([
    options.activeSession,
    options.viewMode,
    options.activeFilePath,
    () => options.activeWindow.value?.id,
    () => options.sessions.value.find(session => session.name === options.activeSession.value)?.id,
  ], scheduleStateNavigation)

  async function applyUrl(rawUrl?: string, addHistoryEntry = false): Promise<void> {
    let url: URL
    try {
      url = new URL(rawUrl ?? window.location.href, window.location.origin)
    }
    catch {
      options.onInvalid('The requested Bitveins link is invalid.')
      return
    }
    if (url.origin !== window.location.origin) {
      options.onInvalid('The requested Bitveins link is invalid.')
      return
    }
    const parsed = parseSessionRoute(url.pathname, url.search)
    if (!parsed.valid) {
      options.onInvalid(parsed.reason)
      return
    }
    if (addHistoryEntry) window.history.pushState(null, '', `${url.pathname}${url.search}`)

    const token = ++generation
    applying = true
    eventId.value = parsed.target.eventId
    try {
      const applied = await options.applyTarget(parsed.target, token)
      if (applied && token === generation) {
        await nextTick()
        const canonical = currentCanonicalUrl()
        if (canonical) window.history.replaceState(null, '', canonical)
      }
    }
    finally {
      if (token === generation) applying = false
    }
  }

  function isCurrent(token: number): boolean {
    return token === generation
  }

  function replaceNext(): void {
    replaceNextChange = true
  }

  function clearEventMetadata(): void {
    eventId.value = undefined
  }

  function onPopState(): void {
    void applyUrl()
  }

  function onServiceWorkerMessage(message: MessageEvent): void {
    const data = message.data as { type?: unknown, url?: unknown } | null
    if (data?.type !== 'bitveins:navigate' || typeof data.url !== 'string') return
    void applyUrl(data.url, true)
  }

  async function start(): Promise<void> {
    if (started) return
    started = true
    window.addEventListener('popstate', onPopState)
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage)
    await applyUrl()
  }

  function stop(): void {
    window.removeEventListener('popstate', onPopState)
    navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage)
  }

  return { applyUrl, clearEventMetadata, isCurrent, replaceNext, start, stop }
}
