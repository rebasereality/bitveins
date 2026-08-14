import { describe, expect, it } from 'vitest'
import { terminalClientEnvironment } from '../../../../../server/modules/terminal/model/terminal-client-environment'

describe('terminal client environment', () => {
  it('advertises truecolor and Grok auto theme without forcing appearance', () => {
    expect(terminalClientEnvironment({ PATH: '/usr/bin', TMUX: '/tmp/tmux' })).toEqual({
      COLORTERM: 'truecolor',
      LC_GROK_THEME: 'auto',
      PATH: '/usr/bin',
      TERM: 'xterm-256color',
      TMUX: '/tmp/tmux',
    })
  })

  it('stamps Grok appearance hints for light and dark Bitveins themes', () => {
    expect(terminalClientEnvironment({}, 'light')).toMatchObject({
      COLORFGBG: '0;15',
      LC_GROK_APPEARANCE: 'light',
    })
    expect(terminalClientEnvironment({}, 'dark')).toMatchObject({
      COLORFGBG: '15;0',
      LC_GROK_APPEARANCE: 'dark',
    })
  })
})
