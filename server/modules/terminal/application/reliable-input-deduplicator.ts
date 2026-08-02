interface ReliableInputDeduplicatorOptions {
  maxEntries?: number
  ttlMs?: number
}

interface DeliveryEntry {
  completedAt?: number
  promise: Promise<void>
  target: string
}

export function createReliableInputDeduplicator(options: ReliableInputDeduplicatorOptions = {}) {
  const maxEntries = options.maxEntries ?? 2_000
  const ttlMs = options.ttlMs ?? 24 * 60 * 60_000
  const deliveries = new Map<string, DeliveryEntry>()

  function pruneExpired(now: number): void {
    for (const [id, delivery] of deliveries) {
      if (delivery.completedAt !== undefined && now - delivery.completedAt > ttlMs) {
        deliveries.delete(id)
      }
    }
  }

  function makeRoom(): void {
    while (deliveries.size >= maxEntries) {
      const completed = [...deliveries].find(([, delivery]) => delivery.completedAt !== undefined)
      if (!completed) {
        throw new Error('Reliable input deduplicator capacity exceeded.')
      }
      deliveries.delete(completed[0])
    }
  }

  return {
    async deliver(
      id: string,
      target: string,
      operation: () => Promise<void> | void,
      now = Date.now(),
    ): Promise<void> {
      pruneExpired(now)

      const existing = deliveries.get(id)
      if (existing) {
        if (existing.target !== target) {
          throw new Error('Reliable input target changed.')
        }
        await existing.promise
        return
      }

      makeRoom()
      const delivery: DeliveryEntry = {
        promise: Promise.resolve().then(operation),
        target,
      }
      deliveries.set(id, delivery)

      try {
        await delivery.promise
        delivery.completedAt = now
      }
      catch (error) {
        if (deliveries.get(id) === delivery) {
          deliveries.delete(id)
        }
        throw error
      }
    },
  }
}
