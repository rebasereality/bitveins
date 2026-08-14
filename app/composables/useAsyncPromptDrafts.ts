import { computed, getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { sessionPromptDraftsResponseSchema } from '#shared/contracts/terminal'

export interface AsyncPromptDraftsOptions {
  activeSession: Readonly<Ref<string | null>> | (() => string | null)
  activeWindowId: Readonly<Ref<string | null>> | (() => string | null)
  onClaimFocus?: (payload: { clientId: string, sessionName: string, windowId: string }) => void
  onClearDraft?: (payload: { clientId: string, sessionName: string, windowId: string }) => void
  onReleaseFocus?: (payload: { clientId: string, sessionName: string, windowId: string }) => void
  onSyncDraft?: (payload: {
    clientId: string
    draft: string
    revision?: number
    sessionName: string
    windowId: string
  }) => void
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `client_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function useAsyncPromptDrafts(options: AsyncPromptDraftsOptions) {
  const clientId = generateClientId()
  const draftsByWindow = ref<Record<string, string>>({})
  const currentDraft = ref('')
  const isLocallyFocused = ref(false)
  const activeEditorClientId = ref<string | null>(null)
  let activeWindowScope: string | null = null
  let lastSyncedDraft: string | null = null
  let syncTimer: ReturnType<typeof setTimeout> | null = null

  const sessionName = computed(() => (
    typeof options.activeSession === 'function'
      ? options.activeSession()
      : options.activeSession.value
  ))

  const windowId = computed(() => (
    typeof options.activeWindowId === 'function'
      ? options.activeWindowId()
      : options.activeWindowId.value
  ))

  function claimFocus(): void {
    isLocallyFocused.value = true
    activeEditorClientId.value = clientId
    const currentSession = sessionName.value
    const currentWindow = windowId.value
    if (currentSession && currentWindow) {
      options.onClaimFocus?.({
        clientId,
        sessionName: currentSession,
        windowId: currentWindow,
      })
    }
  }

  function releaseFocus(): void {
    isLocallyFocused.value = false
    flushSync()
    const currentSession = sessionName.value
    const currentWindow = windowId.value
    if (currentSession && currentWindow) {
      options.onReleaseFocus?.({
        clientId,
        sessionName: currentSession,
        windowId: currentWindow,
      })
    }
  }

  async function loadDrafts(targetSession: string): Promise<void> {
    if (!import.meta.client || !targetSession) return
    try {
      const response = await $fetch<{ drafts: Record<string, string> }>(
        `/api/sessions/${encodeURIComponent(targetSession)}/drafts`,
      )
      const parsed = sessionPromptDraftsResponseSchema.safeParse(response)
      if (parsed.success && sessionName.value === targetSession) {
        draftsByWindow.value = { ...parsed.data.drafts }
        if (windowId.value) {
          const loaded = draftsByWindow.value[windowId.value] ?? ''
          if (!isLocallyFocused.value && currentDraft.value !== loaded) {
            lastSyncedDraft = loaded
            currentDraft.value = loaded
          }
        }
      }
    }
    catch {
      // Ignore network errors on initial draft preload.
    }
  }

  function flushSync(): void {
    if (syncTimer) {
      clearTimeout(syncTimer)
      syncTimer = null
    }

    const currentSession = sessionName.value
    const currentWindow = windowId.value
    if (!currentSession || !currentWindow) return

    const text = currentDraft.value
    lastSyncedDraft = text

    if (text) {
      options.onSyncDraft?.({
        clientId,
        draft: text,
        sessionName: currentSession,
        windowId: currentWindow,
      })
    }
    else {
      options.onClearDraft?.({
        clientId,
        sessionName: currentSession,
        windowId: currentWindow,
      })
    }
  }

  function scheduleSync(): void {
    if (syncTimer) clearTimeout(syncTimer)
    syncTimer = setTimeout(flushSync, 80)
  }

  function removeWindowDraft(targetWindowId: string): void {
    const { [targetWindowId]: _, ...remaining } = draftsByWindow.value
    draftsByWindow.value = remaining
  }

  function clearCurrentDraft(): void {
    const currentSession = sessionName.value
    const currentWindow = windowId.value

    if (syncTimer) {
      clearTimeout(syncTimer)
      syncTimer = null
    }

    lastSyncedDraft = ''
    currentDraft.value = ''

    if (currentWindow) {
      removeWindowDraft(currentWindow)
    }

    if (currentSession && currentWindow) {
      options.onClearDraft?.({
        clientId,
        sessionName: currentSession,
        windowId: currentWindow,
      })
    }
  }

  function handleRemoteFocusClaimed(event: Event): void {
    const detail = (event as CustomEvent).detail
    if (!detail || detail.clientId === clientId) return
    if (detail.sessionName !== sessionName.value) return

    if (detail.windowId === windowId.value) {
      activeEditorClientId.value = detail.clientId
      isLocallyFocused.value = false
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        const tag = document.activeElement.tagName
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          document.activeElement.blur()
        }
      }
    }
  }

  function handleRemoteFocusReleased(event: Event): void {
    const detail = (event as CustomEvent).detail
    if (!detail || detail.clientId === clientId) return
    if (detail.sessionName !== sessionName.value) return

    if (detail.windowId === windowId.value && activeEditorClientId.value === detail.clientId) {
      activeEditorClientId.value = null
    }
  }

  function handleRemoteDraft(event: Event): void {
    const detail = (event as CustomEvent).detail
    if (!detail || detail.clientId === clientId) return
    if (detail.sessionName !== sessionName.value) return

    const targetWindowId = detail.windowId as string
    const remoteDraft = (detail.draft as string) || ''

    if (remoteDraft) {
      draftsByWindow.value = {
        ...draftsByWindow.value,
        [targetWindowId]: remoteDraft,
      }
    }
    else {
      removeWindowDraft(targetWindowId)
    }

    if (targetWindowId === windowId.value) {
      // The active editor must NEVER receive an incoming sync
      if (isLocallyFocused.value) {
        return
      }

      if (currentDraft.value !== remoteDraft) {
        lastSyncedDraft = remoteDraft
        currentDraft.value = remoteDraft
      }
    }
  }

  function handleRemoteDraftCleared(event: Event): void {
    const detail = (event as CustomEvent).detail
    if (!detail || detail.clientId === clientId) return
    if (detail.sessionName !== sessionName.value) return

    const targetWindowId = detail.windowId as string
    removeWindowDraft(targetWindowId)

    if (targetWindowId === windowId.value) {
      if (isLocallyFocused.value) {
        return
      }

      if (currentDraft.value !== '') {
        lastSyncedDraft = ''
        currentDraft.value = ''
      }
    }
  }

  // Handle session switches
  watch(sessionName, (newSession) => {
    if (syncTimer) {
      clearTimeout(syncTimer)
      syncTimer = null
    }
    draftsByWindow.value = {}
    lastSyncedDraft = ''
    currentDraft.value = ''
    isLocallyFocused.value = false
    activeEditorClientId.value = null
    activeWindowScope = null

    if (newSession) {
      void loadDrafts(newSession)
    }
  }, { immediate: true })

  // Handle window tab switches
  watch(windowId, (newWindowId) => {
    if (activeWindowScope && activeWindowScope !== newWindowId) {
      if (syncTimer) {
        clearTimeout(syncTimer)
        syncTimer = null
        const prevSession = sessionName.value
        if (prevSession) {
          const prevText = draftsByWindow.value[activeWindowScope] ?? ''
          if (prevText) {
            options.onSyncDraft?.({
              clientId,
              draft: prevText,
              sessionName: prevSession,
              windowId: activeWindowScope,
            })
          }
        }
      }
    }

    activeWindowScope = newWindowId
    const restored = (newWindowId ? draftsByWindow.value[newWindowId] : '') ?? ''
    lastSyncedDraft = restored
    currentDraft.value = restored
    isLocallyFocused.value = false
    activeEditorClientId.value = null
  }, { immediate: true })

  // Handle user typing
  watch(currentDraft, (newText) => {
    const currentWindow = windowId.value
    if (currentWindow) {
      if (newText) {
        draftsByWindow.value = {
          ...draftsByWindow.value,
          [currentWindow]: newText,
        }
      }
      else {
        removeWindowDraft(currentWindow)
      }
    }

    if (newText === lastSyncedDraft) {
      return
    }

    if (!isLocallyFocused.value) {
      claimFocus()
    }

    scheduleSync()
  })

  if (typeof window !== 'undefined') {
    window.addEventListener('bitveins:prompt-draft', handleRemoteDraft)
    window.addEventListener('bitveins:prompt-draft-cleared', handleRemoteDraftCleared)
    window.addEventListener('bitveins:prompt-focus-claimed', handleRemoteFocusClaimed)
    window.addEventListener('bitveins:prompt-focus-released', handleRemoteFocusReleased)
  }

  function dispose(): void {
    if (syncTimer) {
      clearTimeout(syncTimer)
      syncTimer = null
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('bitveins:prompt-draft', handleRemoteDraft)
      window.removeEventListener('bitveins:prompt-draft-cleared', handleRemoteDraftCleared)
      window.removeEventListener('bitveins:prompt-focus-claimed', handleRemoteFocusClaimed)
      window.removeEventListener('bitveins:prompt-focus-released', handleRemoteFocusReleased)
    }
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(dispose)
  }

  return {
    activeEditorClientId,
    claimFocus,
    clientId,
    clearCurrentDraft,
    currentDraft,
    dispose,
    draftsByWindow,
    flushSync,
    isFocused: isLocallyFocused,
    loadDrafts,
    releaseFocus,
  }
}
