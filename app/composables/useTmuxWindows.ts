import { computed, nextTick, ref } from 'vue'
import type { TmuxWindow } from '~/types/session'

export function useTmuxWindows(
  activeSession: Ref<string | null>,
  handleAuthError: (err: unknown) => void,
) {
  const windows = ref<TmuxWindow[]>([])
  const selectedWindowIndex = ref<number | null>(null)
  const editingWindowIndex = ref<number | null>(null)
  const editingWindowName = ref('')
  const renameWindowInput = ref<HTMLInputElement | null>(null)
  let windowsRefreshTimer: ReturnType<typeof setInterval> | null = null

  const windowTabItems = computed(() => windows.value.map(window => ({
    label: window.name,
    name: window.name,
    title: window.path,
    value: String(window.index),
    windowIndex: window.index,
  })))

  const activeWindowIndex = computed(() => selectedWindowIndex.value ?? windows.value.find(window => window.active)?.index)
  const activeWindowValue = computed(() => (activeWindowIndex.value === undefined ? undefined : String(activeWindowIndex.value)))
  const activeWindow = computed(() => windows.value.find(window => window.index === activeWindowIndex.value) ?? windows.value.find(window => window.active) ?? null)

  function stopWindowRefresh(): void {
    if (windowsRefreshTimer) {
      clearInterval(windowsRefreshTimer)
      windowsRefreshTimer = null
    }
  }

  async function fetchWindows(): Promise<void> {
    if (!activeSession.value) {
      windows.value = []
      selectedWindowIndex.value = null
      return
    }

    try {
      const data = await $fetch<{ windows: TmuxWindow[] }>(`/api/sessions/${encodeURIComponent(activeSession.value)}/windows`)
      windows.value = data.windows

      if (data.windows.length > 0 && (selectedWindowIndex.value === null || !data.windows.some(w => w.index === selectedWindowIndex.value))) {
        const activeWin = data.windows.find(w => w.active)
        selectedWindowIndex.value = activeWin ? activeWin.index : data.windows[0]!.index
      }
    }
    catch (err) {
      handleAuthError(err)
    }
  }

  function startWindowRefresh(): void {
    stopWindowRefresh()
    void fetchWindows()
    windowsRefreshTimer = setInterval(() => {
      void fetchWindows()
    }, 3000)
  }

  async function handleWindowSelect(windowIndex: number, attachWindowFn: (sessionName: string, windowIndex: number) => Promise<void>): Promise<void> {
    if (!activeSession.value) return
    selectedWindowIndex.value = windowIndex
    try {
      await attachWindowFn(activeSession.value, windowIndex)
      await fetchWindows()
    }
    catch (err) {
      handleAuthError(err)
    }
  }

  async function handleCreateWindow(attachWindowFn: (sessionName: string, windowIndex: number) => Promise<void>): Promise<void> {
    if (!activeSession.value) return
    try {
      const data = await $fetch<{ window: TmuxWindow }>(`/api/sessions/${encodeURIComponent(activeSession.value)}/windows`, {
        method: 'POST',
      })
      selectedWindowIndex.value = data.window.index
      await attachWindowFn(activeSession.value, data.window.index)
      await fetchWindows()
    }
    catch (err) {
      handleAuthError(err)
    }
  }

  function startWindowRename(window: TmuxWindow): void {
    editingWindowIndex.value = window.index
    editingWindowName.value = window.name
    nextTick(() => {
      renameWindowInput.value?.focus()
      renameWindowInput.value?.select()
    })
  }

  function cancelWindowRename(): void {
    editingWindowIndex.value = null
    editingWindowName.value = ''
  }

  async function saveWindowRename(windowIndex: number): Promise<void> {
    if (!activeSession.value) return
    const nextName = editingWindowName.value.trim()
    if (!nextName) {
      cancelWindowRename()
      return
    }

    try {
      await $fetch(`/api/sessions/${encodeURIComponent(activeSession.value)}/windows/${windowIndex}`, {
        method: 'PATCH',
        body: { name: nextName },
      })
      cancelWindowRename()
      await fetchWindows()
    }
    catch (err) {
      handleAuthError(err)
    }
  }

  return {
    windows,
    selectedWindowIndex,
    editingWindowIndex,
    editingWindowName,
    renameWindowInput,
    windowTabItems,
    activeWindowIndex,
    activeWindowValue,
    activeWindow,
    stopWindowRefresh,
    fetchWindows,
    startWindowRefresh,
    handleWindowSelect,
    handleCreateWindow,
    startWindowRename,
    cancelWindowRename,
    saveWindowRename,
  }
}
