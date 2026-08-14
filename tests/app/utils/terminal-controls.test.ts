import { describe, expect, it } from 'vitest'
import { terminalSequenceForLiveControl, terminalSequenceForPrintableKey } from '../../../app/utils/terminal-controls'

describe('live terminal modifier controls', () => {
  it('maps control letters to terminal control bytes', () => {
    expect(terminalSequenceForLiveControl('c', { alt: false, ctrl: true, shift: false })).toBe('\x03')
    expect(terminalSequenceForLiveControl('d', { alt: false, ctrl: true, shift: false })).toBe('\x04')
  })

  it('maps a physical key after a mobile modifier toggle', () => {
    expect(terminalSequenceForPrintableKey('r', { alt: false, ctrl: true, shift: false })).toBe('\x12')
    expect(terminalSequenceForPrintableKey('r', { alt: false, ctrl: false, shift: true })).toBe('R')
  })

  it('prefixes printable controls with Escape for Alt', () => {
    expect(terminalSequenceForLiveControl('comma', { alt: true, ctrl: false, shift: false })).toBe('\x1b,')
    expect(terminalSequenceForLiveControl('period', { alt: true, ctrl: false, shift: false })).toBe('\x1b.')
  })

  it('uses CSI modifier forms for shifted and controlled arrows', () => {
    expect(terminalSequenceForLiveControl('arrowUp', { alt: false, ctrl: false, shift: true })).toBe('\x1b[1;2A')
    expect(terminalSequenceForLiveControl('arrowLeft', { alt: false, ctrl: true, shift: false })).toBe('\x1b[1;5D')
    expect(terminalSequenceForLiveControl('arrowRight', { alt: true, ctrl: true, shift: true })).toBe('\x1b[1;8C')
  })

  it('keeps existing one-tap terminal controls expressible as default modifiers', () => {
    expect(terminalSequenceForLiveControl('pageUp', { alt: false, ctrl: true, shift: false })).toBe('\x02\x1b[5~')
    expect(terminalSequenceForLiveControl('pageUp', { alt: false, ctrl: false, shift: false })).toBe('\x1b[5~')
    expect(terminalSequenceForLiveControl('pageDown', { alt: false, ctrl: false, shift: false })).toBe('\x1b[6~')
    expect(terminalSequenceForLiveControl('pageDown', { alt: true, ctrl: false, shift: false })).toBe('\x1b\x1b[6~')
    expect(terminalSequenceForLiveControl('tab', { alt: false, ctrl: false, shift: true })).toBe('\x1b[Z')
    expect(terminalSequenceForLiveControl('tab', { alt: false, ctrl: false, shift: false })).toBe('\t')
    expect(terminalSequenceForLiveControl('enter', { alt: false, ctrl: false, shift: false })).toBe('\r')
    expect(terminalSequenceForLiveControl('enter', { alt: true, ctrl: false, shift: false })).toBe('\x1b\r')
    expect(terminalSequenceForLiveControl('backspace', { alt: false, ctrl: true, shift: false })).toBe('\x17')
    expect(terminalSequenceForLiveControl('backspace', { alt: false, ctrl: false, shift: false })).toBe('\x7f')
    expect(terminalSequenceForLiveControl('escape', { alt: false, ctrl: false, shift: false })).toBe('\x1b')
    expect(terminalSequenceForLiveControl('arrowDown', { alt: false, ctrl: false, shift: false })).toBe('\x1b[B')
  })

  it('handles punctuation and multi-char inputs correctly', () => {
    expect(terminalSequenceForLiveControl('comma', { alt: false, ctrl: false, shift: true })).toBe('<')
    expect(terminalSequenceForLiveControl('period', { alt: false, ctrl: false, shift: true })).toBe('>')
    expect(terminalSequenceForPrintableKey('', { alt: false, ctrl: false, shift: false })).toBe('')
    expect(terminalSequenceForPrintableKey('abc', { alt: false, ctrl: false, shift: false })).toBe('')
  })
})
