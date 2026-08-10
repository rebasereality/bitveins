import type { TmuxPane, TmuxWindow } from '#shared/contracts/terminal'
import { apiErrorMessage } from '~/utils/api-error'

export function useTmuxPanes(
  sessionName: Readonly<Ref<string | null>>,
  activeWindow: Readonly<Ref<TmuxWindow | null>>,
) {
  const panes = ref<TmuxPane[]>([])
  const error = ref<string | null>(null)
  let requestVersion = 0
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  function endpoint(): string | null {
    const session = sessionName.value
    const window = activeWindow.value
    return session && window
      ? `/api/sessions/${encodeURIComponent(session)}/windows/${window.index}`
      : null
  }

  async function refresh(): Promise<void> {
    const base = endpoint()
    const version = ++requestVersion
    if (!base) {
      panes.value = []
      error.value = null
      return
    }
    try {
      const response = await $fetch<{ panes: TmuxPane[] }>(`${base}/panes`)
      if (version !== requestVersion) return
      panes.value = response.panes
      error.value = null
    }
    catch (cause) {
      if (version === requestVersion) error.value = apiErrorMessage(cause, 'Unable to load tmux panes.')
    }
  }

  async function split(paneId: string, direction: 'horizontal' | 'vertical'): Promise<void> {
    const base = endpoint()
    if (!base) return
    try {
      const response = await $fetch<{ panes: TmuxPane[] }>(`${base}/split`, {
        method: 'POST',
        body: { direction, paneId },
      })
      panes.value = response.panes
      error.value = null
    }
    catch (cause) {
      error.value = apiErrorMessage(cause, 'Unable to split tmux pane.')
      throw cause
    }
  }

  async function close(paneId: string): Promise<void> {
    const base = endpoint()
    if (!base || panes.value.length <= 1) return
    try {
      const response = await $fetch<{ panes: TmuxPane[] }>(`${base}/split`, {
        method: 'DELETE',
        query: { paneId },
      })
      panes.value = response.panes
      error.value = null
    }
    catch (cause) {
      error.value = apiErrorMessage(cause, 'Unable to close tmux pane.')
      throw cause
    }
  }

  async function select(paneId: string): Promise<void> {
    const base = endpoint()
    if (!base) return
    panes.value = panes.value.map(pane => ({ ...pane, active: pane.id === paneId }))
    try {
      await $fetch(`${base}/select-pane`, { method: 'POST', body: { paneId } })
    }
    catch (cause) {
      error.value = apiErrorMessage(cause, 'Unable to select tmux pane.')
    }
  }

  async function resize(
    paneId: string,
    dimension: 'height' | 'width',
    size: number,
  ): Promise<void> {
    const base = endpoint()
    if (!base) return
    try {
      const response = await $fetch<{ panes: TmuxPane[] }>(`${base}/resize-pane`, {
        method: 'POST',
        body: { dimension, paneId, size },
      })
      panes.value = response.panes
      error.value = null
    }
    catch (cause) {
      error.value = apiErrorMessage(cause, 'Unable to resize tmux pane.')
      throw cause
    }
  }

  watch([sessionName, () => activeWindow.value?.id], () => void refresh(), { immediate: true })

  onMounted(() => {
    refreshTimer = setInterval(() => void refresh(), 3_000)
  })
  onBeforeUnmount(() => {
    if (refreshTimer) clearInterval(refreshTimer)
    refreshTimer = null
  })

  return { close, error, panes, refresh, resize, select, split }
}
