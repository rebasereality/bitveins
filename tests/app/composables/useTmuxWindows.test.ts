// @vitest-environment happy-dom

import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTmuxWindows } from '../../../app/composables/useTmuxWindows'

const fetchStub = vi.fn()

describe('useTmuxWindows', () => {
  beforeEach(() => {
    fetchStub.mockReset()
    vi.stubGlobal('$fetch', fetchStub)
  })

  it('selects a newly created window before attaching its terminal', async () => {
    const createdWindow = {
      active: true,
      id: '@2',
      index: 1,
      name: 'bash',
      path: '/workspace',
    }
    fetchStub
      .mockResolvedValueOnce({ window: createdWindow })
      .mockResolvedValueOnce({ windows: [createdWindow] })

    const tmuxWindows = useTmuxWindows(ref('session'), vi.fn())
    const attach = vi.fn(async () => {
      expect(tmuxWindows.activeWindowIndex.value).toBe(1)
    })

    await tmuxWindows.handleCreateWindow(attach)

    expect(attach).toHaveBeenCalledWith('session', 1)
    expect(tmuxWindows.activeWindow.value).toEqual(createdWindow)
  })
})
