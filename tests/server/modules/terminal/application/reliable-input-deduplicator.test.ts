import { describe, expect, it } from 'vitest'
import { createReliableInputDeduplicator } from '../../../../../server/modules/terminal/application/reliable-input-deduplicator'

describe('reliable input deduplication', () => {
  it('claims an input only once until its TTL expires', () => {
    const deduplicator = createReliableInputDeduplicator({ maxEntries: 10, ttlMs: 100 })

    expect(deduplicator.claim('one', 0)).toBe(true)
    expect(deduplicator.claim('one', 50)).toBe(false)
    expect(deduplicator.claim('one', 101)).toBe(true)
  })

  it('allows a failed write to release its claim', () => {
    const deduplicator = createReliableInputDeduplicator()

    expect(deduplicator.claim('one')).toBe(true)
    deduplicator.release('one')
    expect(deduplicator.claim('one')).toBe(true)
  })

  it('does not evict a duplicate merely because the registry is full', () => {
    const deduplicator = createReliableInputDeduplicator({ maxEntries: 2 })

    expect(deduplicator.claim('one', 0)).toBe(true)
    expect(deduplicator.claim('two', 0)).toBe(true)
    expect(deduplicator.claim('one', 1)).toBe(false)
  })
})
