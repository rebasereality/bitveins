import type { Ref } from 'vue'
import type { AttentionEvent } from '#shared/contracts/attention'
import type { SessionRouteTarget } from '#shared/navigation/session-route'
import type { TmuxSession, TmuxWindow } from '~/types/session'
import type { ExplorerViewMode } from '~/utils/explorer-view-mode'
import { apiErrorMessage } from '~/utils/api-error'

interface TargetApplierOptions {
  activeFilePath: Ref<string | null>
  activeSession: Ref<string | null>
  attachSession: (name: string) => Promise<void>
  attentionEvents: Ref<AttentionEvent[]>
  error: Ref<string | null>
  fetchWindows: (isCurrent?: () => boolean) => Promise<void>
  handleAuthError: (error: unknown) => void
  inboxOpen: Ref<boolean>
  isCurrent: (token: number) => boolean
  markAttentionEventRead: (id: string) => Promise<unknown>
  openPath: (path: string, name?: string, line?: number, column?: number, reportError?: boolean, isCurrent?: () => boolean) => Promise<boolean>
  refreshAttentionEvents: () => Promise<void>
  refreshSessions: () => Promise<void>
  selectTmuxWindow: (index: number, isCurrent?: () => boolean) => Promise<void>
  sessions: Ref<TmuxSession[]>
  settingsOpen: Ref<boolean>
  detachSession: (name: string) => void
  viewMode: Ref<ExplorerViewMode>
}

export function usePermalinkTargetApplier(options: TargetApplierOptions) {
  return async (target: SessionRouteTarget, token: number): Promise<boolean> => {
    if (!options.isCurrent(token)) return false
    options.error.value = null
    await options.refreshSessions()
    if (!options.isCurrent(token)) return false

    let linkedEvent: AttentionEvent | undefined
    if (target.eventId) {
      await options.refreshAttentionEvents()
      if (!options.isCurrent(token)) return false
      linkedEvent = options.attentionEvents.value.find(event => event.id === target.eventId)
      if (!linkedEvent) {
        options.error.value = 'The linked Agent Inbox event is no longer available.'
        return false
      }
      if (!linkedEvent.readAt) {
        await options.markAttentionEventRead(linkedEvent.id).catch(() => undefined)
        if (!options.isCurrent(token)) return false
      }
    }

    const wantedId = linkedEvent?.sessionId
      ?? (target.kind === 'explorer' || target.kind === 'stable-session' || target.kind === 'terminal'
        ? target.sessionId
        : undefined)
    const wantedName = linkedEvent?.sessionName ?? (target.kind === 'home' ? undefined : target.sessionName)
    const session = wantedId
      ? options.sessions.value.find(candidate => candidate.id === wantedId)
      : options.sessions.value.find(candidate => candidate.name === wantedName)

    if (!wantedId && !wantedName) {
      if (!options.isCurrent(token)) return false
      if (options.activeSession.value) options.detachSession(options.activeSession.value)
      return true
    }
    if (!session) {
      options.error.value = 'The linked tmux session is no longer available.'
      return false
    }

    const wantedWindowId = linkedEvent?.windowId
      ?? (target.kind === 'terminal' ? `@${target.windowNumber}` : target.kind === 'legacy' ? target.windowId : undefined)
    let targetWindow: TmuxWindow | undefined
    if (wantedWindowId) {
      try {
        const data = await $fetch<{ windows: TmuxWindow[] }>(`/api/sessions/${encodeURIComponent(session.name)}/windows`)
        if (!options.isCurrent(token)) return false
        targetWindow = data.windows.find(candidate => candidate.id === wantedWindowId)
      }
      catch (error) {
        if (!options.isCurrent(token)) return false
        options.error.value = apiErrorMessage(error, 'Unable to inspect the linked tmux session.')
        options.handleAuthError(error)
        return false
      }
      if (!targetWindow) {
        options.error.value = 'The linked tmux window is no longer available.'
        return false
      }
    }

    const explorerPath = target.kind === 'explorer' ? target.path : null
    if (target.kind === 'explorer' && explorerPath) {
      const file = await explorerFileExists(session.name, explorerPath)
      if (!options.isCurrent(token)) return false
      if (!file.exists) {
        if (file.error) options.handleAuthError(file.error)
        options.error.value = 'The linked Explorer file is no longer available.'
        return false
      }
    }

    if (!options.isCurrent(token)) return false
    options.inboxOpen.value = false
    options.settingsOpen.value = false
    await options.attachSession(session.name)
    if (!options.isCurrent(token)) return false
    const isCurrent = () => options.isCurrent(token)
    await options.fetchWindows(isCurrent)
    if (!isCurrent()) return false

    if (target.kind === 'explorer') {
      if (explorerPath) {
        const opened = await options.openPath(explorerPath, undefined, undefined, undefined, false, isCurrent)
        if (!isCurrent()) return false
        if (!opened) {
          options.error.value = 'The linked Explorer file is no longer available.'
          return false
        }
      }
      if (!isCurrent()) return false
      if (!explorerPath) options.activeFilePath.value = null
      options.viewMode.value = 'explorer'
    }
    else {
      if (!isCurrent()) return false
      options.viewMode.value = 'terminal'
      if (targetWindow) {
        await options.selectTmuxWindow(targetWindow.index, isCurrent)
        if (!isCurrent()) return false
      }
    }
    return true
  }
}

async function explorerFileExists(
  sessionName: string,
  path: string,
): Promise<{ error?: unknown, exists: boolean }> {
  try {
    await $fetch(`/api/sessions/${encodeURIComponent(sessionName)}/files/metadata`, { query: { path } })
    return { exists: true }
  }
  catch (error) {
    return { error, exists: false }
  }
}
