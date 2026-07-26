// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { suppressMobileTerminalKeyboard } from '../../../app/utils/mobile-terminal-input'

describe('mobile terminal input', () => {
  it('suppresses the virtual keyboard on the xterm helper textarea', () => {
    const host = document.createElement('div')
    const input = document.createElement('textarea')
    input.className = 'xterm-helper-textarea'
    host.appendChild(input)

    suppressMobileTerminalKeyboard(host)

    expect(input.inputMode).toBe('none')
  })

  it('is inert before xterm has created its input', () => {
    expect(() => suppressMobileTerminalKeyboard(null)).not.toThrow()
    expect(() => suppressMobileTerminalKeyboard(document.createElement('div'))).not.toThrow()
  })
})
