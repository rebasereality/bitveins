import type { Ref } from 'vue'
import type { ExplorerDocument } from '~/types/explorer'
import type { TmuxSession } from '~/types/session'
import type { OpenTransferResponse } from '#shared/contracts/api'
import { apiErrorMessage } from '~/utils/api-error'

interface SessionTerminalController {
  attach: (name: string) => Promise<void>
  detach: (name?: string) => void
}

interface BitveinsAppSessionOptions {
  activeFilePath: Ref<string | null>
  activeSession: Ref<string | null>
  focusInputTarget: () => void
  handleAuthError: (error: unknown) => void
  openFiles: Ref<ExplorerDocument[]>
  resetHistory: () => void
  startWindowRefresh: () => void
  stopWindowRefresh: () => void
  terminal: Ref<SessionTerminalController | null>
}

export function useBitveinsAppSessions(options: BitveinsAppSessionOptions) {
  const {
    activeFilePath,
    activeSession,
    focusInputTarget,
    handleAuthError,
    openFiles,
    resetHistory,
    startWindowRefresh,
    stopWindowRefresh,
    terminal,
  } = options
  const sessions = ref<TmuxSession[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refreshSessions(): Promise<void> {
    loading.value = true
    error.value = null

    try {
      const data = await $fetch<{ sessions: TmuxSession[] }>('/api/sessions')
      sessions.value = data.sessions

      if (activeSession.value && !data.sessions.some(session => session.name === activeSession.value)) {
        terminal.value?.detach(activeSession.value)
        activeSession.value = null
        resetHistory()
        stopWindowRefresh()
      }
    }
    catch (fetchError) {
      error.value = apiErrorMessage(fetchError, 'Unable to load tmux sessions.')
      handleAuthError(fetchError)
    }
    finally {
      loading.value = false
    }
  }

  async function attachSession(sessionName: string): Promise<void> {
    if (activeSession.value === sessionName) {
      focusInputTarget()
      return
    }

    activeSession.value = sessionName
    resetHistory()
    startWindowRefresh()
    openFiles.value = []
    activeFilePath.value = null

    if (terminal.value) {
      await terminal.value.attach(sessionName)
    }
    focusInputTarget()
  }

  async function createSession(payload: { name: string, path: string }): Promise<void> {
    error.value = null
    try {
      const data = await $fetch<{ session: TmuxSession }>('/api/sessions', {
        method: 'POST',
        body: payload,
      })
      await refreshSessions()
      await attachSession(data.session.name)
    }
    catch (fetchError: unknown) {
      error.value = apiErrorMessage(fetchError, 'Unable to create session.')
      handleAuthError(fetchError)
    }
  }

  async function openTransfer(payload: { name: string, path: string }): Promise<boolean> {
    error.value = null
    try {
      const data = await $fetch<OpenTransferResponse>('/api/transfers/open', {
        method: 'POST',
        body: payload,
      })
      await refreshSessions()
      await attachSession(data.session.name)
      return true
    }
    catch (fetchError: unknown) {
      error.value = apiErrorMessage(fetchError, 'Unable to open Transfer.')
      handleAuthError(fetchError)
      return false
    }
  }

  async function renameSession(payload: { currentName: string, nextName: string }): Promise<void> {
    error.value = null
    try {
      await $fetch(`/api/sessions/${encodeURIComponent(payload.currentName)}`, {
        method: 'PATCH',
        body: { name: payload.nextName },
      })
      if (activeSession.value === payload.currentName) {
        activeSession.value = payload.nextName
      }
      await refreshSessions()
    }
    catch (fetchError: unknown) {
      error.value = apiErrorMessage(fetchError, 'Unable to rename session.')
      handleAuthError(fetchError)
    }
  }

  async function destroySession(sessionName: string): Promise<void> {
    error.value = null
    try {
      await $fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: 'DELETE' })
      terminal.value?.detach(sessionName)
      if (activeSession.value === sessionName) {
        activeSession.value = null
        resetHistory()
        stopWindowRefresh()
      }
      await refreshSessions()
    }
    catch (fetchError: unknown) {
      error.value = apiErrorMessage(fetchError, 'Unable to destroy session.')
      handleAuthError(fetchError)
    }
  }

  function detachSession(sessionName: string): void {
    terminal.value?.detach(sessionName)
    if (activeSession.value === sessionName) {
      activeSession.value = null
      resetHistory()
      stopWindowRefresh()
    }
  }

  return {
    sessions,
    loading,
    error,
    refreshSessions,
    attachSession,
    createSession,
    openTransfer,
    renameSession,
    destroySession,
    detachSession,
  }
}
