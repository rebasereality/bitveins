import { describe, expect, it, vi } from 'vitest'
import { AttentionService } from '../../../../../server/modules/attention/application/attention-service'
import type { AttentionRepository } from '../../../../../server/modules/attention/ports/attention-repository'
import type { AttentionEvent, CreateAttentionEvent } from '../../../../../shared/contracts/attention'

class MemoryRepository implements AttentionRepository {
  readonly events: AttentionEvent[] = []

  create(event: AttentionEvent): AttentionEvent {
    this.events.push(event)
    return event
  }

  dismiss(id: string, dismissedAt: string): AttentionEvent | null {
    return this.update(id, { dismissedAt })
  }

  list(): AttentionEvent[] {
    return this.events.toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  markRead(id: string, readAt: string): AttentionEvent | null {
    return this.update(id, { readAt })
  }

  private update(id: string, patch: Partial<AttentionEvent>): AttentionEvent | null {
    const index = this.events.findIndex(event => event.id === id)
    if (index < 0) return null
    this.events[index] = { ...this.events[index]!, ...patch }
    return this.events[index]!
  }
}

const input: CreateAttentionEvent = {
  project: 'Kouizine',
  sessionName: 'kouizine',
  source: 'codex',
  summary: 'Run database migrations?',
  title: 'Permission required',
  type: 'permission_required',
  windowId: '@4',
}

describe('AttentionService', () => {
  it('persists before broadcasting and attempting push delivery', async () => {
    const repository = new MemoryRepository()
    const sequence: string[] = []
    const service = new AttentionService({
      clock: () => new Date('2026-08-03T12:00:00.000Z'),
      createId: () => 'evt_123456789012',
      publisher: { publish: vi.fn(() => sequence.push(`publish:${repository.events.length}`)) },
      push: { notify: vi.fn(async () => sequence.push(`push:${repository.events.length}`)) },
      repository: {
        ...repository,
        create(event) {
          sequence.push('persist')
          return repository.create(event)
        },
        dismiss: repository.dismiss.bind(repository),
        list: repository.list.bind(repository),
        markRead: repository.markRead.bind(repository),
      },
    })

    const created = await service.create(input)

    expect(created).toMatchObject({ id: 'evt_123456789012', ...input })
    expect(sequence).toEqual(['persist', 'publish:1', 'push:1'])
  })

  it('still creates and broadcasts when push delivery fails', async () => {
    const repository = new MemoryRepository()
    const publish = vi.fn()
    const service = new AttentionService({
      createId: () => 'evt_123456789012',
      publisher: { publish },
      push: { notify: vi.fn().mockRejectedValue(new Error('sensitive endpoint')) },
      repository,
    })

    await expect(service.create(input)).resolves.toMatchObject({ id: 'evt_123456789012' })
    expect(repository.events).toHaveLength(1)
    expect(publish).toHaveBeenCalledOnce()
  })

  it('keeps generic Hermes input blocked while accepting only fixed internal Hermes events', async () => {
    const repository = new MemoryRepository()
    const service = new AttentionService({
      createId: () => 'evt_123456789012',
      publisher: { publish: vi.fn() },
      push: { notify: vi.fn().mockResolvedValue(undefined) },
      repository,
    })

    await expect(service.create({
      source: 'Hermes',
      title: 'Generic bypass',
      type: 'completed',
    })).rejects.toThrow(/dedicated lifecycle integration/i)
    await expect(service.createHermes({
      source: 'hermes',
      title: 'Hermes turn completed',
      type: 'completed',
    })).resolves.toMatchObject({
      source: 'hermes',
      title: 'Hermes turn completed',
      type: 'completed',
    })
    await expect(service.createHermes({
      source: 'hermes',
      title: 'Arbitrary client text',
      type: 'completed',
    } as never)).rejects.toThrow()
  })

  it('returns after persistence without waiting for push delivery', async () => {
    const repository = new MemoryRepository()
    const pushDelivery = new Promise<void>(() => {})
    const service = new AttentionService({
      createId: () => 'evt_123456789012',
      publisher: { publish: vi.fn() },
      push: { notify: vi.fn().mockReturnValue(pushDelivery) },
      repository,
    })

    await expect(service.create(input)).resolves.toMatchObject({ id: 'evt_123456789012' })
    expect(repository.events).toHaveLength(1)
  })

  it('lists newest-first and records read and dismissed lifecycle state', async () => {
    const repository = new MemoryRepository()
    let id = 0
    let minute = 0
    const service = new AttentionService({
      clock: () => new Date(`2026-08-03T12:${String(minute++).padStart(2, '0')}:00.000Z`),
      createId: () => `evt_${String(++id).padStart(12, '0')}`,
      publisher: { publish: vi.fn() },
      push: { notify: vi.fn().mockResolvedValue(undefined) },
      repository,
    })

    const first = await service.create(input)
    const second = await service.create({ ...input, title: 'Completed', type: 'completed' })

    expect(service.list().map(event => event.id)).toEqual([second.id, first.id])
    expect(service.markRead(first.id)?.readAt).toBe('2026-08-03T12:02:00.000Z')
    expect(service.dismiss(second.id)?.dismissedAt).toBe('2026-08-03T12:03:00.000Z')
    expect(service.markRead('evt_missing_000')).toBeNull()
  })
})
