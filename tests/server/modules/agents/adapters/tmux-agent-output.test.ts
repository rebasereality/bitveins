import { describe, expect, it } from 'vitest'
import {
  normalizeTmuxAgentTitle,
  parseTmuxAgentPaneCandidates,
} from '../../../../../server/modules/agents/adapters/tmux-agent-output'

describe('tmux agent output', () => {
  it('parses live user panes and preserves paths containing delimiters', () => {
    expect(parseTmuxAgentPaneCandidates([
      'main\t@1\t0\twork\t%7\t1\t101\t0\treviewer\t/work/project\tpart',
      '_bitveins_helper\t@1\t0\twork\t%8\t0\t102\t0\t\t/tmp',
      'main\t@1\t0\twork\t%9\t2\t103\t1\t\t/tmp',
    ].join('\n'))).toEqual([{
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
      'main\tbad\t0\twork\t%7\t0\t101\t0\tlabel\t/tmp',
      'main\t@1\t0\twork\t%7\t0\t101\t0\tbad\rlabel\t/tmp',
    ].join('\n'))

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.customLabel).toBeUndefined()
  })

  it('normalizes terminal titles before using them as labels', () => {
    expect(normalizeTmuxAgentTitle('  ⠦ project\r\n')).toBe('⠦ project')
    expect(normalizeTmuxAgentTitle('\n\t')).toBeNull()
  })
})
