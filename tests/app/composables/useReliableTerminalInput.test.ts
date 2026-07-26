// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RELIABLE_INPUT_ACK_TIMEOUT_MS,
  RELIABLE_INPUT_MAX_ATTEMPTS,
  useReliableTerminalInput,
} from '../../../app/composables/useReliableTerminalInput'
import {
  readReliableInputOutbox,
  RELIABLE_INPUT_OUTBOX_KEY,
} from '../../../app/utils/reliable-input-outbox'
import { MAX_INPUT_BYTES } from '../../../shared/contracts/terminal'

class MemoryStorage implements Storage {
  private items = new Map<string, string>()

  get length(): number { return this.items.size }
  clear(): void { this.items.clear() }
  getItem(key: string): string | null { return this.items.get(key) ?? null }
  key(index: number): string | null { return Array.from(this.items.keys())[index] ?? null }
  removeItem(key: string): void { this.items.delete(key) }
  setItem(key: string, value: string): void { this.items.set(key, value) }
}

function setup(storage = new MemoryStorage()) {
  const abandoned: string[][] = []
  const posted: string[] = []
  const statuses: string[] = []
  const onTimeout = vi.fn()
  const input = useReliableTerminalInput({
    attachment: () => ({ sessionName: 'main', windowIndex: 1 }),
    onAbandon: data => abandoned.push([...data]),
    onStatus: status => statuses.push(status),
    onTimeout,
    post(message) {
      posted.push(message.payload.data)
      return true
    },
    storage: () => storage,
  })

  return {
    abandoned,
    input,
    onTimeout,
    posted,
    statuses,
    storage,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useReliableTerminalInput', () => {
  it('keeps oversized commands out of the queue and reports them for recovery', () => {
    const context = setup()
    const oversized = 'x'.repeat(MAX_INPUT_BYTES + 1)

    expect(context.input.enqueueAll([oversized, '\r'])).toBe(false)
    expect(context.abandoned).toEqual([[oversized, '\r']])
    expect(context.statuses[0]).toContain('exceeds 64 KiB')
    expect(readReliableInputOutbox(context.storage)).toEqual([])
  })

  it('drops a failed command after bounded retries and leaves the next command deliverable', () => {
    vi.useFakeTimers()
    const context = setup()
    context.input.enqueueAll(['blocked', '\r'])
    context.input.enqueueAll(['next', '\r'])

    expect(context.input.pendingCount.value).toBe(2)
    context.input.flush()

    for (let attempt = 1; attempt <= RELIABLE_INPUT_MAX_ATTEMPTS; attempt += 1) {
      expect(context.posted).toEqual(Array.from({ length: attempt }, () => 'blocked'))
      vi.advanceTimersByTime(RELIABLE_INPUT_ACK_TIMEOUT_MS)

      if (attempt < RELIABLE_INPUT_MAX_ATTEMPTS) {
        context.input.resetConnection()
        context.input.flush()
      }
    }

    expect(context.onTimeout).toHaveBeenCalledTimes(RELIABLE_INPUT_MAX_ATTEMPTS)
    expect(context.abandoned).toEqual([['blocked', '\r']])
    expect(context.input.pendingCount.value).toBe(1)
    expect(context.statuses.at(-1)).toContain('3 failed delivery attempts')

    context.input.resetConnection()
    context.input.flush()
    expect(context.posted.at(-1)).toBe('next')
    context.input.resetConnection()
  })

  it('unblocks a legacy queue by discarding an oversized pair before sending the next prompt', () => {
    const storage = new MemoryStorage()
    const oversized = 'x'.repeat(MAX_INPUT_BYTES + 1)
    const createdAt = Date.now()
    storage.setItem(RELIABLE_INPUT_OUTBOX_KEY, JSON.stringify([
      {
        createdAt,
        data: oversized,
        id: 'legacy-oversized',
        sessionName: 'main',
        windowIndex: 1,
      },
      {
        createdAt,
        data: '\r',
        id: 'legacy-oversized-enter',
        sessionName: 'main',
        windowIndex: 1,
      },
      {
        createdAt,
        data: 'next',
        id: 'legacy-next',
        sessionName: 'main',
        windowIndex: 1,
      },
      {
        createdAt,
        data: '\r',
        id: 'legacy-next-enter',
        sessionName: 'main',
        windowIndex: 1,
      },
    ]))
    const context = setup(storage)

    context.input.refresh()
    expect(context.input.pendingCount.value).toBe(2)
    context.input.flush()

    expect(context.abandoned).toEqual([[oversized, '\r']])
    expect(context.posted).toEqual(['next'])
    expect(context.input.pendingCount.value).toBe(1)
    context.input.resetConnection()
  })
})
