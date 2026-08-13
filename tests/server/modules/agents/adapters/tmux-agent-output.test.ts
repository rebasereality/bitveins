import { describe, expect, it } from 'vitest'
import {
  normalizeTmuxAgentTitle,
  parseTmuxAgentPaneCandidates,
} from '../../../../../server/modules/agents/adapters/tmux-agent-output'

describe('tmux agent output', () => {
  it('parses live user panes and preserves paths containing delimiters', () => {
    expect(parseTmuxAgentPaneCandidates([
      'main\t@1\t0\twork\t%7\t1\t101\t0\treviewer\tthread_123\t/work/project\tpart',
      '_bitveins_helper\t@1\t0\twork\t%8\t0\t102\t0\t\t\t/tmp',
      'main\t@1\t0\twork\t%9\t2\t103\t1\t\t\t/tmp',
    ].join('\n'))).toEqual([{
      codexThreadId: 'thread_123',
      customLabel: 'reviewer',
      paneId: '%7',
      paneIndex: 1,
      panePid: 101,
      path: '/work/project\tpart',
      sessionName: 'main',
      windowId: '@1',
      windowIndex: 0,
      windowName: 'work',
    }])
  })

  it('drops malformed rows and unsafe external labels', () => {
    const candidates = parseTmuxAgentPaneCandidates([
      'main\tbad\t0\twork\t%7\t0\t101\t0\tlabel\t\t/tmp',
      'main\t@1\t0\twork\t%7\t0\t101\t0\tbad\rlabel\tbad id\t/tmp',
    ].join('\n'))

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.customLabel).toBeUndefined()
  })

  it('uses stable fallbacks when tmux omits a window name and path', () => {
    expect(parseTmuxAgentPaneCandidates('main\t@1\t3\t\t%7\t0\t101\t0\t\t\t')).toEqual([{
      codexThreadId: undefined,
      customLabel: undefined,
      paneId: '%7',
      paneIndex: 0,
      panePid: 101,
      path: '~',
      sessionName: 'main',
      windowId: '@1',
      windowIndex: 3,
      windowName: 'window-3',
    }])
  })

  it('normalizes terminal titles before using them as labels', () => {
    expect(normalizeTmuxAgentTitle('  ⠦ project\r\n')).toBe('⠦ project')
    expect(normalizeTmuxAgentTitle('\n\t')).toBeNull()
  })
})
