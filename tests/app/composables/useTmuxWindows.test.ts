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

  it('exposes a non-authenticated window creation failure', async () => {
    fetchStub.mockRejectedValueOnce({
      data: { statusMessage: 'tmux refused the new window' },
      statusCode: 500,
    })

    const handleAuthError = vi.fn()
    const tmuxWindows = useTmuxWindows(ref('session'), handleAuthError)

    await tmuxWindows.handleCreateWindow(vi.fn())

    expect(tmuxWindows.error.value).toBe('tmux refused the new window')
    expect(handleAuthError).toHaveBeenCalledOnce()
  })

  it('populates windowTabItems with agentStatus when matching agents exist', async () => {
    const window1 = { active: true, id: '@0', index: 0, name: 'agent-win', path: '/workspace' }
    const window2 = { active: false, id: '@1', index: 1, name: 'shell', path: '/workspace' }
    fetchStub.mockResolvedValueOnce({ windows: [window1, window2] })

    const agents = ref([
      {
        defaultLabel: 'Agent',
        id: '%1',
        kind: 'codex' as const,
        label: 'Agent',
        paneId: '%1',
        paneIndex: 0,
        path: '/workspace',
        sessionName: 'session',
        status: 'working' as const,
        windowId: '@0',
        windowIndex: 0,
        windowName: 'agent-win',
      },
    ])

    const activeSession = ref('session')
    const tmuxWindows = useTmuxWindows(activeSession, vi.fn(), agents)
    await tmuxWindows.fetchWindows()

    expect(tmuxWindows.windowTabItems.value).toEqual([
      {
        agentStatus: 'working',
        label: 'agent-win',
        name: 'agent-win',
        title: '/workspace',
        value: '0',
        windowIndex: 0,
      },
      {
        agentStatus: undefined,
        label: 'shell',
        name: 'shell',
        title: '/workspace',
        value: '1',
        windowIndex: 1,
      },
    ])
  })
})
