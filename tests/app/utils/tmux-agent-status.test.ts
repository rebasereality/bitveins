import { describe, expect, it } from 'vitest'
import type { TmuxAgent } from '#shared/contracts/agents'
import type { TmuxWindow } from '~/types/session'
import { resolveWindowAgentStatus } from '../../../app/utils/tmux-agent-status'

function createAgent(overrides: Partial<TmuxAgent> = {}): TmuxAgent {
  return {
    defaultLabel: 'Agent',
    id: '%1',
    kind: 'codex',
    label: 'Agent',
    paneId: '%1',
    paneIndex: 0,
    path: '/workspace',
    sessionName: 'dev',
    status: 'idle',
    windowId: '@0',
    windowIndex: 0,
    windowName: 'agent-win',
    ...overrides,
  }
}

function createWindow(overrides: Partial<TmuxWindow> = {}): TmuxWindow {
  return {
    active: true,
    id: '@0',
    index: 0,
    name: 'agent-win',
    path: '/workspace',
    ...overrides,
  }
}

describe('resolveWindowAgentStatus', () => {
  it('returns undefined when sessionName is null or agentList is empty', () => {
    const win = createWindow()
    expect(resolveWindowAgentStatus(win, null, [createAgent()])).toBeUndefined()
    expect(resolveWindowAgentStatus(win, 'dev', [])).toBeUndefined()
  })

  it('returns undefined when no agent matches the session and window', () => {
    const win = createWindow({ id: '@1', index: 1 })
    const agents = [
      createAgent({ sessionName: 'other', windowId: '@1', windowIndex: 1 }),
      createAgent({ sessionName: 'dev', windowId: '@2', windowIndex: 2 }),
    ]
    expect(resolveWindowAgentStatus(win, 'dev', agents)).toBeUndefined()
  })

  it('resolves matching agent status for a window', () => {
    const win = createWindow({ id: '@0', index: 0 })
    const agents = [createAgent({ sessionName: 'dev', status: 'working', windowId: '@0', windowIndex: 0 })]
    expect(resolveWindowAgentStatus(win, 'dev', agents)).toBe('working')
  })

  it('prioritizes failed > blocked > working > idle > unknown when multiple agents match the window', () => {
    const win = createWindow({ id: '@0', index: 0 })

    const agentsWithFailedAndWorking = [
      createAgent({ paneId: '%1', sessionName: 'dev', status: 'working', windowId: '@0', windowIndex: 0 }),
      createAgent({ paneId: '%2', sessionName: 'dev', status: 'failed', windowId: '@0', windowIndex: 0 }),
    ]
    expect(resolveWindowAgentStatus(win, 'dev', agentsWithFailedAndWorking)).toBe('failed')

    const agentsWithBlockedAndWorking = [
      createAgent({ paneId: '%1', sessionName: 'dev', status: 'working', windowId: '@0', windowIndex: 0 }),
      createAgent({ paneId: '%2', sessionName: 'dev', status: 'blocked', windowId: '@0', windowIndex: 0 }),
    ]
    expect(resolveWindowAgentStatus(win, 'dev', agentsWithBlockedAndWorking)).toBe('blocked')

    const agentsWithWorkingAndIdle = [
      createAgent({ paneId: '%1', sessionName: 'dev', status: 'idle', windowId: '@0', windowIndex: 0 }),
      createAgent({ paneId: '%2', sessionName: 'dev', status: 'working', windowId: '@0', windowIndex: 0 }),
    ]
    expect(resolveWindowAgentStatus(win, 'dev', agentsWithWorkingAndIdle)).toBe('working')

    const agentsWithIdleAndUnknown = [
      createAgent({ paneId: '%1', sessionName: 'dev', status: 'unknown', windowId: '@0', windowIndex: 0 }),
      createAgent({ paneId: '%2', sessionName: 'dev', status: 'idle', windowId: '@0', windowIndex: 0 }),
    ]
    expect(resolveWindowAgentStatus(win, 'dev', agentsWithIdleAndUnknown)).toBe('idle')
  })
})
