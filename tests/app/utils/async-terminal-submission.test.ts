import { describe, expect, it } from 'vitest'
import {
  asyncTerminalSubmissionChunks,
  recoverAsyncTerminalPrompt,
} from '../../../app/utils/async-terminal-submission'

describe('async terminal submission', () => {
  it('wraps single-line and multiline prompts in bracketed paste mode', () => {
    const shortPrompt = 'Impressionnant. Tu peux commit/push'
    const longPrompt = 'L'.repeat(81)
    const multilinePrompt = 'first\nsecond'

    expect(asyncTerminalSubmissionChunks(shortPrompt, '\r')).toEqual([
      `\x1b[200~${shortPrompt}\x1b[201~`,
      '\r',
    ])
    expect(asyncTerminalSubmissionChunks(longPrompt, '\r')).toEqual([
      `\x1b[200~${longPrompt}\x1b[201~`,
      '\r',
    ])
    expect(asyncTerminalSubmissionChunks(multilinePrompt, '\t')).toEqual([
      '\x1b[200~first\nsecond\x1b[201~',
      '\t',
    ])
  })

  it('recovers single-line and multiline prompts while ignoring the terminator', () => {
    expect(recoverAsyncTerminalPrompt(['\x1b[200~retry me\x1b[201~', '\r'])).toBe('retry me')
    expect(recoverAsyncTerminalPrompt(['\x1b[200~first\nsecond\x1b[201~', '\t'])).toBe('first\nsecond')
    expect(recoverAsyncTerminalPrompt(['plain text', '\r'])).toBe('plain text')
  })

  it('handles empty prompt submissions without bracketed paste', () => {
    expect(asyncTerminalSubmissionChunks('', '\r')).toEqual(['', '\r'])
  })
})
