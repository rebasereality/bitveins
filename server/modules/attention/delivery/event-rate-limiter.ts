export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { count: number, startedAt: number }>()

  constructor(private readonly options: { limit: number, windowMs: number }) {}

  consume(key: string, now = Date.now()): boolean {
    const current = this.windows.get(key)
    if (!current || now - current.startedAt >= this.options.windowMs) {
      this.windows.set(key, { count: 1, startedAt: now })
      return true
    }
    if (current.count >= this.options.limit) return false
    current.count += 1
    return true
  }
}
