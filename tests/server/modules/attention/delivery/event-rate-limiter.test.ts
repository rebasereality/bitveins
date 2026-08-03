import { describe, expect, it } from 'vitest'
import { FixedWindowRateLimiter } from '../../../../../server/modules/attention/delivery/event-rate-limiter'

describe('FixedWindowRateLimiter', () => {
  it('bounds a window and resets after it expires', () => {
    const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 100 })
    expect(limiter.consume('local', 1_000)).toBe(true)
    expect(limiter.consume('local', 1_001)).toBe(true)
    expect(limiter.consume('local', 1_002)).toBe(false)
    expect(limiter.consume('local', 1_100)).toBe(true)
  })
})
