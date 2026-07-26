import { describe, expect, it } from 'vitest'
import {
  type ReliableInputEntry,
  acknowledgeReliableInput,
  discardReliableInputSubmission,
  enqueueReliableInput,
  enqueueReliableInputs,
  readReliableInputOutbox,
  recordReliableInputAttempt,
  reliableInputSubmissionCount,
  reliableInputsForWindow,
  RELIABLE_INPUT_OUTBOX_KEY,
  RELIABLE_INPUT_OUTBOX_LIMIT,
  RELIABLE_INPUT_TTL_MS,
} from '../../../app/utils/reliable-input-outbox'

class MemoryStorage implements Storage {
  private items = new Map<string, string>()

  get length(): number { return this.items.size }
  clear(): void { this.items.clear() }
  getItem(key: string): string | null { return this.items.get(key) ?? null }
  key(index: number): string | null { return Array.from(this.items.keys())[index] ?? null }
  removeItem(key: string): void { this.items.delete(key) }
  setItem(key: string, value: string): void { this.items.set(key, value) }
}

function entry(id: string, overrides: Partial<ReliableInputEntry> = {}): ReliableInputEntry {
  return {
    attempts: 0,
    createdAt: 1_000,
    data: `input-${id}`,
    id,
    sessionName: 'main',
    submissionId: `submission-${id}`,
    windowIndex: 1,
    ...overrides,
  }
}

describe('reliable input outbox', () => {
  it('persists entries until they are acknowledged', () => {
    const storage = new MemoryStorage()

    expect(enqueueReliableInput(storage, entry('one'), 1_000)).toBe(true)
    expect(readReliableInputOutbox(storage, 1_000)).toEqual([entry('one')])

    acknowledgeReliableInput(storage, 'one', 1_000)
    expect(storage.getItem(RELIABLE_INPUT_OUTBOX_KEY)).toBeNull()
  })

  it('only returns entries for the attached tmux window', () => {
    const storage = new MemoryStorage()

    enqueueReliableInput(storage, entry('one'), 1_000)
    enqueueReliableInput(storage, entry('two', { windowIndex: 2 }), 1_000)

    expect(reliableInputsForWindow(storage, 'main', 1, 1_000)).toEqual([entry('one')])
  })

  it('expires old entries and refuses to silently evict a full outbox', () => {
    const storage = new MemoryStorage()

    for (let index = 0; index < RELIABLE_INPUT_OUTBOX_LIMIT; index++) {
      expect(enqueueReliableInput(storage, entry(String(index)), 1_000)).toBe(true)
    }

    expect(enqueueReliableInput(storage, entry('overflow'), 1_000)).toBe(false)
    expect(readReliableInputOutbox(storage, 1_000 + RELIABLE_INPUT_TTL_MS + 1)).toEqual([])
  })

  it('persists every entry in an accepted delivery batch', () => {
    const storage = new MemoryStorage()
    const batch = [
      entry('prompt', { submissionId: 'submission' }),
      entry('terminator', { submissionId: 'submission' }),
    ]

    expect(enqueueReliableInputs(storage, batch, 1_000)).toBe(true)
    expect(readReliableInputOutbox(storage, 1_000)).toEqual(batch)
    expect(reliableInputSubmissionCount(batch)).toBe(1)
  })

  it('rejects an oversized delivery batch atomically', () => {
    const storage = new MemoryStorage()

    for (let index = 0; index < RELIABLE_INPUT_OUTBOX_LIMIT - 1; index++) {
      expect(enqueueReliableInput(storage, entry(String(index)), 1_000)).toBe(true)
    }

    expect(enqueueReliableInputs(storage, [
      entry('prompt'),
      entry('terminator'),
    ], 1_000)).toBe(false)
    expect(readReliableInputOutbox(storage, 1_000)).toHaveLength(RELIABLE_INPUT_OUTBOX_LIMIT - 1)
  })

  it('migrates legacy prompt and terminator pairs into separate submissions', () => {
    const storage = new MemoryStorage()
    storage.setItem(RELIABLE_INPUT_OUTBOX_KEY, JSON.stringify([
      {
        createdAt: 1_000,
        data: 'oversized prompt',
        id: 'legacy-prompt',
        sessionName: 'main',
        windowIndex: 1,
      },
      {
        createdAt: 1_000,
        data: '\r',
        id: 'legacy-enter',
        sessionName: 'main',
        windowIndex: 1,
      },
      {
        createdAt: 1_000,
        data: 'next prompt',
        id: 'legacy-next',
        sessionName: 'main',
        windowIndex: 1,
      },
      {
        createdAt: 1_000,
        data: '\r',
        id: 'legacy-next-enter',
        sessionName: 'main',
        windowIndex: 1,
      },
    ]))

    const migrated = readReliableInputOutbox(storage, 1_000)

    expect(migrated.map(item => item.submissionId)).toEqual([
      'legacy:legacy-prompt',
      'legacy:legacy-prompt',
      'legacy:legacy-next',
      'legacy:legacy-next',
    ])
    expect(reliableInputSubmissionCount(migrated)).toBe(2)
  })

  it('tracks attempts and discards one submission without touching the next', () => {
    const storage = new MemoryStorage()
    const first = [
      entry('first-prompt', { submissionId: 'first' }),
      entry('first-enter', { data: '\r', submissionId: 'first' }),
    ]
    const second = [
      entry('second-prompt', { submissionId: 'second' }),
      entry('second-enter', { data: '\r', submissionId: 'second' }),
    ]
    enqueueReliableInputs(storage, [...first, ...second], 1_000)

    expect(recordReliableInputAttempt(storage, 'first-prompt', 1_000)?.attempts).toBe(1)
    expect(discardReliableInputSubmission(storage, 'first', 1_000)).toEqual([
      { ...first[0], attempts: 1 },
      first[1],
    ])
    expect(readReliableInputOutbox(storage, 1_000)).toEqual(second)
  })
})
