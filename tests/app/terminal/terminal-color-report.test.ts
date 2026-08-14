import { describe, expect, it } from 'vitest'
import { isOscColorReport } from '../../../app/terminal/terminal-color-report'

describe('OSC color reports', () => {
  it('accepts xterm.js OSC 10-12 replies', () => {
    expect(isOscColorReport('\u001B]11;rgb:fafa/fafb/fafb\u001B\\')).toBe(true)
    expect(isOscColorReport('\u001B]10;#24262b\u0007')).toBe(true)
    expect(isOscColorReport('\u001B]12;rgb:4f46/e5e5/e5e5\u001B\\')).toBe(true)
  })

  it('rejects ordinary terminal input', () => {
    expect(isOscColorReport('grok')).toBe(false)
    expect(isOscColorReport('\u001B[<64;20;8M')).toBe(false)
  })
})
