import { describe, expect, it } from 'vitest'
import {
  extractCodexThreadIdFromPath,
  normalizeCodexThreadId,
} from '../../../../../server/modules/agents/model/codex-thread-id'

describe('Codex thread ids', () => {
  it('accepts current UUIDs and future opaque ids without accepting paths', () => {
    expect(normalizeCodexThreadId(' 019ff7b9-2d85-78d2-9cea-eaff30ed6cef '))
      .toBe('019ff7b9-2d85-78d2-9cea-eaff30ed6cef')
    expect(normalizeCodexThreadId('thread_123')).toBe('thread_123')
    expect(normalizeCodexThreadId('../thread')).toBeNull()
    expect(normalizeCodexThreadId('short')).toBeNull()
  })

  it('extracts ids from rollout and writer-lock paths', () => {
    expect(extractCodexThreadIdFromPath(
      '/home/test/.codex/sessions/2026/08/12/rollout-2026-08-12T20-45-36-019ff7b9-2d85-78d2-9cea-eaff30ed6cef.jsonl',
    )).toBe('019ff7b9-2d85-78d2-9cea-eaff30ed6cef')
    expect(extractCodexThreadIdFromPath('/tmp/thread_123.lock')).toBe('thread_123')
    expect(extractCodexThreadIdFromPath('/tmp/unrelated.jsonl')).toBeNull()
  })
})
