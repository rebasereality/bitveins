import { describe, expect, it } from 'vitest'
import {
  createLoginRateLimiter,
  isOriginAllowed,
  parseAllowedOrigins,
} from '../../../server/utils/bitveins-auth'

describe('bitveins auth utilities', () => {
  it('allows only configured request origins when an origin is present', () => {
    const origins = parseAllowedOrigins('https://term.example.com,http://localhost:3000')

    expect(isOriginAllowed(null, origins)).toBe(true)
    expect(isOriginAllowed('https://term.example.com', origins)).toBe(true)
    expect(isOriginAllowed('https://evil.example.com', origins)).toBe(false)
  })

  it('rate-limits repeated failed login attempts within the window', () => {
    const limiter = createLoginRateLimiter({
      maxAttempts: 2,
      windowMs: 1000,
    })

    expect(limiter.isLimited('client', 0)).toBe(false)
    limiter.recordFailure('client', 0)
    expect(limiter.isLimited('client', 100)).toBe(false)
    limiter.recordFailure('client', 100)
    expect(limiter.isLimited('client', 200)).toBe(true)
    expect(limiter.isLimited('client', 1101)).toBe(false)
  })

  it('clears login failures after a successful login', () => {
    const limiter = createLoginRateLimiter({
      maxAttempts: 2,
      windowMs: 1000,
    })

    limiter.recordFailure('client', 0)
    limiter.recordSuccess('client')

    expect(limiter.isLimited('client', 100)).toBe(false)
  })
})
