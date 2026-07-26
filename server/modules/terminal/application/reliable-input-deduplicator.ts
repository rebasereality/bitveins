interface ReliableInputDeduplicatorOptions {
  maxEntries?: number
  ttlMs?: number
}

export function createReliableInputDeduplicator(options: ReliableInputDeduplicatorOptions = {}) {
  const maxEntries = options.maxEntries ?? 2_000
  const ttlMs = options.ttlMs ?? 24 * 60 * 60_000
  const claims = new Map<string, number>()

  function pruneExpired(now: number): void {
    for (const [id, claimedAt] of claims) {
      if (now - claimedAt > ttlMs) {
        claims.delete(id)
      }
    }
  }

  function makeRoom(): void {
    while (claims.size >= maxEntries) {
      const oldest = claims.keys().next().value

      if (oldest === undefined) {
        break
      }

      claims.delete(oldest)
    }
  }

  return {
    claim(id: string, now = Date.now()): boolean {
      pruneExpired(now)

      if (claims.has(id)) {
        return false
      }

      makeRoom()
      claims.set(id, now)
      return true
    },
    release(id: string): void {
      claims.delete(id)
    },
  }
}
