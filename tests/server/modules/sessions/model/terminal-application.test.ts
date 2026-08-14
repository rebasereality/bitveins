import { describe, expect, it } from 'vitest'
import {
  detectTerminalApplication,
  foregroundApplicationForPane,
  parseProcessCommandSnapshot,
} from '../../../../../server/modules/sessions/model/terminal-application'

describe('terminal application detection', () => {
  it('recognizes Hermes and Grok foreground commands', () => {
    expect(detectTerminalApplication('hermes')).toBe('hermes')
    expect(detectTerminalApplication('grok')).toBe('grok')
    expect(detectTerminalApplication('grok-linux-x86_64')).toBe('grok')
    expect(detectTerminalApplication('bash')).toBeNull()
  })

  it('resolves the foreground process group command for a pane', () => {
    const processes = parseProcessCommandSnapshot([
      '100 200 bash',
      '200 200 grok',
      '300 400 bash',
      '400 400 node',
    ].join('\n'))

    expect(foregroundApplicationForPane(100, processes)).toBe('grok')
    expect(foregroundApplicationForPane(300, processes)).toBeNull()
  })
})
