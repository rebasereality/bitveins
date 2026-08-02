import { describe, expect, it, vi } from 'vitest'
import { createReliableInputDeduplicator } from '../../../../../server/modules/terminal/application/reliable-input-deduplicator'

describe('reliable input deduplication', () => {
  it('waits for an in-flight delivery before completing a duplicate', async () => {
    const deduplicator = createReliableInputDeduplicator()
    let release: (() => void) | undefined
    const operation = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve
    }))

    const first = deduplicator.deliver('one', 'target-a', operation)
    const duplicate = deduplicator.deliver('one', 'target-a', operation)
    await Promise.resolve()

    expect(operation).toHaveBeenCalledOnce()
    let duplicateCompleted = false
    void duplicate.then(() => {
      duplicateCompleted = true
    })
    await Promise.resolve()
    expect(duplicateCompleted).toBe(false)

    if (!release) throw new Error('Delivery did not start.')
    release()
    await Promise.all([first, duplicate])
    expect(duplicateCompleted).toBe(true)
  })

  it('rejects a duplicate id delivered to another target', async () => {
    const deduplicator = createReliableInputDeduplicator()

    await deduplicator.deliver('one', 'target-a', () => {})

    await expect(deduplicator.deliver('one', 'target-b', () => {}))
      .rejects.toThrow('Reliable input target changed.')
  })

  it('allows a failed delivery to be retried', async () => {
    const deduplicator = createReliableInputDeduplicator()
    const failed = vi.fn(() => {
      throw new Error('write failed')
    })
    const retry = vi.fn()

    await expect(deduplicator.deliver('one', 'target-a', failed)).rejects.toThrow('write failed')
    await deduplicator.deliver('one', 'target-a', retry)

    expect(retry).toHaveBeenCalledOnce()
  })

  it('deduplicates completed input only until its TTL expires', async () => {
    const deduplicator = createReliableInputDeduplicator({ maxEntries: 10, ttlMs: 100 })
    const operation = vi.fn()

    await deduplicator.deliver('one', 'target-a', operation, 0)
    await deduplicator.deliver('one', 'target-a', operation, 50)
    await deduplicator.deliver('one', 'target-a', operation, 101)

    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not evict a duplicate merely because the registry is full', async () => {
    const deduplicator = createReliableInputDeduplicator({ maxEntries: 2 })
    const operation = vi.fn()

    await deduplicator.deliver('one', 'target-a', operation, 0)
    await deduplicator.deliver('two', 'target-a', operation, 0)
    await deduplicator.deliver('one', 'target-a', operation, 1)

    expect(operation).toHaveBeenCalledTimes(2)
  })
})
