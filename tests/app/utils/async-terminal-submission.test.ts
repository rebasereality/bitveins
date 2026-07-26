import { describe, expect, it } from 'vitest'
import {
  asyncTerminalSubmissionChunks,
  recoverAsyncTerminalPrompt,
} from '../../../app/utils/async-terminal-submission'

describe('async terminal submission', () => {
  it('separates a single-line prompt from its terminator regardless of length', () => {
    const shortPrompt = 'Impressionnant. Tu peux commit/push'
    const longPrompt = 'L'.repeat(81)

    expect(asyncTerminalSubmissionChunks(shortPrompt, '\r')).toEqual([shortPrompt, '\r'])
    expect(asyncTerminalSubmissionChunks(longPrompt, '\r')).toEqual([longPrompt, '\r'])
  })

  it('uses bracketed paste only for multiline prompts', () => {
    const chunks = asyncTerminalSubmissionChunks('first\nsecond', '\t')

    expect(chunks).toEqual([
      '\x1b[200~first\nsecond\x1b[201~',
      '\t',
    ])
    expect(recoverAsyncTerminalPrompt(chunks)).toBe('first\nsecond')
  })

  it('recovers a single-line prompt while ignoring its terminator', () => {
    expect(recoverAsyncTerminalPrompt(['retry me', '\r'])).toBe('retry me')
  })
})
