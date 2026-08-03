import { createError } from 'h3'
import { FixedWindowRateLimiter } from './event-rate-limiter'

export const browserAttentionRateLimiter = new FixedWindowRateLimiter({
  limit: 60,
  windowMs: 60_000,
})

export function assertBrowserAttentionRateLimit(): void {
  if (!browserAttentionRateLimiter.consume('authenticated-browser')) {
    throw createError({ statusCode: 429, statusMessage: 'Event rate limit exceeded.' })
  }
}
