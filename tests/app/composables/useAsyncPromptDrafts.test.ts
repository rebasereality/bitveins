// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useAsyncPromptDrafts } from '../../../app/composables/useAsyncPromptDrafts'

describe('useAsyncPromptDrafts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('keeps separate drafts per window and restores them when switching tabs', async () => {
    const activeSession = ref<string | null>('main')
    const activeWindowId = ref<string | null>('@1')
    const onSyncDraft = vi.fn()
    const onClearDraft = vi.fn()

    const { currentDraft } = useAsyncPromptDrafts({
      activeSession,
      activeWindowId,
      onClearDraft,
      onSyncDraft,
    })

    // Type in window @1
    currentDraft.value = 'command for window 1'
    await nextTick()
    vi.advanceTimersByTime(100)

    expect(onSyncDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft: 'command for window 1',
      sessionName: 'main',
      windowId: '@1',
    }))

    // Switch to window @2
    activeWindowId.value = '@2'
    await nextTick()
    expect(currentDraft.value).toBe('')

    // Type in window @2
    currentDraft.value = 'command for window 2'
    await nextTick()
    vi.advanceTimersByTime(100)

    expect(onSyncDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft: 'command for window 2',
      sessionName: 'main',
      windowId: '@2',
    }))

    // Switch back to window @1
    activeWindowId.value = '@1'
    await nextTick()
    expect(currentDraft.value).toBe('command for window 1')
  })

  it('clears draft and notifies onClearDraft when clearCurrentDraft is called', async () => {
    const activeSession = ref<string | null>('main')
    const activeWindowId = ref<string | null>('@1')
    const onSyncDraft = vi.fn()
    const onClearDraft = vi.fn()

    const { clearCurrentDraft, currentDraft } = useAsyncPromptDrafts({
      activeSession,
      activeWindowId,
      onClearDraft,
      onSyncDraft,
    })

    currentDraft.value = 'to be cleared'
    await nextTick()
    vi.advanceTimersByTime(100)

    clearCurrentDraft()
    await nextTick()

    expect(currentDraft.value).toBe('')
    expect(onClearDraft).toHaveBeenCalledWith(expect.objectContaining({
      sessionName: 'main',
      windowId: '@1',
    }))
  })

  it('updates draft in real-time when remote promptDraft event arrives on unfocused input without echoing back', async () => {
    const activeSession = ref<string | null>('main')
    const activeWindowId = ref<string | null>('@1')
    const onSyncDraft = vi.fn()

    const { currentDraft, draftsByWindow } = useAsyncPromptDrafts({
      activeSession,
      activeWindowId,
      onSyncDraft,
    })

    // Simulate remote draft on active window @1
    window.dispatchEvent(new CustomEvent('bitveins:prompt-draft', {
      detail: {
        clientId: 'remote-device',
        draft: 'remote prompt typing...',
        revision: 2,
        sessionName: 'main',
        updatedAt: 1234,
        windowId: '@1',
      },
    }))
    await nextTick()

    expect(currentDraft.value).toBe('remote prompt typing...')
    expect(draftsByWindow.value['@1']).toBe('remote prompt typing...')

    // Verify it did not schedule an echo back
    vi.advanceTimersByTime(100)
    expect(onSyncDraft).not.toHaveBeenCalled()

    // Simulate remote draft on background window @2
    window.dispatchEvent(new CustomEvent('bitveins:prompt-draft', {
      detail: {
        clientId: 'remote-device',
        draft: 'background draft',
        revision: 1,
        sessionName: 'main',
        updatedAt: 1235,
        windowId: '@2',
      },
    }))
    await nextTick()

    // Active window draft stays unchanged
    expect(currentDraft.value).toBe('remote prompt typing...')
    expect(draftsByWindow.value['@2']).toBe('background draft')

    // Switch to window @2
    activeWindowId.value = '@2'
    await nextTick()
    expect(currentDraft.value).toBe('background draft')

    // Simulate remote clear on window @2
    window.dispatchEvent(new CustomEvent('bitveins:prompt-draft-cleared', {
      detail: {
        clientId: 'remote-device',
        sessionName: 'main',
        windowId: '@2',
      },
    }))
    await nextTick()
    expect(currentDraft.value).toBe('')
  })

  it('broadcasts claimFocus and relinquishes focus when another client claims it', async () => {
    const activeSession = ref<string | null>('main')
    const activeWindowId = ref<string | null>('@1')
    const onClaimFocus = vi.fn()
    const onReleaseFocus = vi.fn()

    const { claimFocus, isFocused, releaseFocus } = useAsyncPromptDrafts({
      activeSession,
      activeWindowId,
      onClaimFocus,
      onReleaseFocus,
    })

    expect(isFocused.value).toBe(false)

    // Local device claims focus
    claimFocus()
    expect(isFocused.value).toBe(true)
    expect(onClaimFocus).toHaveBeenCalledWith(expect.objectContaining({
      sessionName: 'main',
      windowId: '@1',
    }))

    // Another client claims focus
    window.dispatchEvent(new CustomEvent('bitveins:prompt-focus-claimed', {
      detail: {
        clientId: 'remote-phone',
        sessionName: 'main',
        windowId: '@1',
      },
    }))
    await nextTick()

    // Local device is no longer focused
    expect(isFocused.value).toBe(false)

    // Local device re-claims focus
    claimFocus()
    expect(isFocused.value).toBe(true)

    // Local device releases focus
    releaseFocus()
    expect(isFocused.value).toBe(false)
    expect(onReleaseFocus).toHaveBeenCalledWith(expect.objectContaining({
      sessionName: 'main',
      windowId: '@1',
    }))
  })

  it('NEVER overwrites currentDraft when the active input is locally focused', async () => {
    const activeSession = ref<string | null>('main')
    const activeWindowId = ref<string | null>('@1')
    const onSyncDraft = vi.fn()

    const { claimFocus, currentDraft } = useAsyncPromptDrafts({
      activeSession,
      activeWindowId,
      onSyncDraft,
    })

    claimFocus()
    currentDraft.value = 'my local typing in progress'
    await nextTick()

    // Remote draft arrives for the same window while focused
    window.dispatchEvent(new CustomEvent('bitveins:prompt-draft', {
      detail: {
        clientId: 'remote-device',
        draft: 'remote text that must be ignored',
        revision: 5,
        sessionName: 'main',
        updatedAt: 12345,
        windowId: '@1',
      },
    }))
    await nextTick()

    // Local draft must remain completely untouched!
    expect(currentDraft.value).toBe('my local typing in progress')

    // Remote clear arrives while focused
    window.dispatchEvent(new CustomEvent('bitveins:prompt-draft-cleared', {
      detail: {
        clientId: 'remote-device',
        sessionName: 'main',
        windowId: '@1',
      },
    }))
    await nextTick()

    // Local draft must STILL remain untouched!
    expect(currentDraft.value).toBe('my local typing in progress')
  })
})
