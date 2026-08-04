import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePermalinkTargetApplier } from '../../../app/composables/usePermalinkTargetApplier'

const session = { id: 'abcdefghijklmnop', name: 'alpha', path: '/workspace' }
const explorerTarget = {
  kind: 'explorer' as const,
  path: 'README.md',
  sessionId: session.id,
  sessionName: session.name,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function setup(overrides: {
  fetchWindows?: (isCurrent?: () => boolean) => Promise<void>
  openPath?: (...args: unknown[]) => Promise<boolean>
} = {}) {
  let currentToken = 1
  const activeFilePath = ref<string | null>(null)
  const activeSession = ref<string | null>('baseline')
  const selectedWindow = ref<number | null>(null)
  const viewMode = ref<'explorer' | 'terminal'>('terminal')
  const attachSession = vi.fn(async (name: string) => {
    activeSession.value = name
  })
  const detachSession = vi.fn((name: string) => {
    if (activeSession.value === name) activeSession.value = null
  })
  const selectTmuxWindow = vi.fn(async (index: number) => {
    selectedWindow.value = index
  })
  const apply = usePermalinkTargetApplier({
    activeFilePath,
    activeSession,
    attachSession,
    attentionEvents: ref([]),
    detachSession,
    error: ref(null),
    fetchWindows: overrides.fetchWindows ?? vi.fn(async () => {}),
    handleAuthError: vi.fn(),
    inboxOpen: ref(false),
    isCurrent: token => token === currentToken,
    markAttentionEventRead: vi.fn(async () => undefined),
    openPath: (overrides.openPath ?? vi.fn(async () => true)) as never,
    refreshAttentionEvents: vi.fn(async () => {}),
    refreshSessions: vi.fn(async () => {}),
    selectTmuxWindow,
    sessions: ref([session]),
    settingsOpen: ref(false),
    viewMode,
  })
  return {
    activeFilePath,
    activeSession,
    apply,
    attachSession,
    invalidate: () => { currentToken = 2 },
    selectedWindow,
    selectTmuxWindow,
    viewMode,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('usePermalinkTargetApplier stale navigation', () => {
  it('does not attach after stale Explorer metadata completes', async () => {
    const metadata = deferred<unknown>()
    vi.stubGlobal('$fetch', vi.fn(() => metadata.promise))
    const context = setup()

    const navigationA = context.apply(explorerTarget, 1)
    await vi.waitFor(() => expect(vi.mocked($fetch)).toHaveBeenCalledOnce())
    context.invalidate()
    await context.apply({ kind: 'home' }, 2)
    metadata.resolve({ kind: 'text' })

    await expect(navigationA).resolves.toBe(false)
    expect(context.attachSession).not.toHaveBeenCalled()
    expect(context.activeSession.value).toBeNull()
    expect(context.viewMode.value).toBe('terminal')
  })

  it('does not select a stale terminal window after fetchWindows completes', async () => {
    const windowsLoaded = deferred<undefined>()
    vi.stubGlobal('$fetch', vi.fn(async () => ({
      windows: [{ active: false, id: '@4', index: 4, name: 'logs', path: '/workspace' }],
    })))
    const context = setup({ fetchWindows: () => windowsLoaded.promise })
    const target = { kind: 'terminal' as const, sessionId: session.id, sessionName: session.name, windowNumber: 4 }

    const navigationA = context.apply(target, 1)
    await vi.waitFor(() => expect(context.attachSession).toHaveBeenCalledWith('alpha'))
    context.invalidate()
    await context.apply({ kind: 'home' }, 2)
    windowsLoaded.resolve(undefined)

    await expect(navigationA).resolves.toBe(false)
    expect(context.activeSession.value).toBeNull()
    expect(context.selectTmuxWindow).not.toHaveBeenCalled()
    expect(context.selectedWindow.value).toBeNull()
    expect(context.viewMode.value).toBe('terminal')
  })

  it('does not switch view after a stale openPath completes', async () => {
    const opened = deferred<boolean>()
    vi.stubGlobal('$fetch', vi.fn(async () => ({ kind: 'text' })))
    const context = setup({ openPath: () => opened.promise })

    const navigationA = context.apply(explorerTarget, 1)
    await vi.waitFor(() => expect(context.attachSession).toHaveBeenCalledWith('alpha'))
    context.invalidate()
    await context.apply({ kind: 'home' }, 2)
    opened.resolve(true)

    await expect(navigationA).resolves.toBe(false)
    expect(context.activeSession.value).toBeNull()
    expect(context.activeFilePath.value).toBeNull()
    expect(context.viewMode.value).toBe('terminal')
  })
})
