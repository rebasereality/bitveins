import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DrizzleAttentionRepository } from '../../../../../server/modules/attention/adapters/drizzle-attention-repository'
import { closeDatabase, useDrizzle } from '../../../../../server/utils/db'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bitveins-attention-'))
  process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'history.sqlite')
})

afterEach(() => {
  closeDatabase()
  delete process.env.BITVEINS_DATABASE_PATH
  rmSync(tempDir, { force: true, recursive: true })
})

describe('DrizzleAttentionRepository integration', () => {
  it('persists, orders, reads and dismisses inbox events', () => {
    const repository = new DrizzleAttentionRepository(useDrizzle())
    const first = repository.create({
      createdAt: '2026-08-03T12:00:00.000Z',
      id: 'evt_000000000001',
      source: 'shell',
      title: 'Started',
      type: 'information',
    })
    const second = repository.create({
      createdAt: '2026-08-03T12:01:00.000Z',
      id: 'evt_000000000002',
      source: 'shell',
      title: 'Failed',
      type: 'failed',
    })

    expect(repository.list().map(event => event.id)).toEqual([second.id, first.id])
    expect(repository.markRead(first.id, '2026-08-03T12:02:00.000Z')?.readAt).toBe('2026-08-03T12:02:00.000Z')
    expect(repository.dismiss(second.id, '2026-08-03T12:03:00.000Z')?.dismissedAt).toBe('2026-08-03T12:03:00.000Z')
    expect(repository.dismissAll('2026-08-03T12:04:00.000Z')).toEqual([first.id])
    expect(repository.list().find(event => event.id === first.id)?.dismissedAt)
      .toBe('2026-08-03T12:04:00.000Z')
    expect(repository.dismissAll('2026-08-03T12:05:00.000Z')).toEqual([])
    expect(repository.markRead('evt_missing_000', '2026-08-03T12:04:00.000Z')).toBeNull()
  })
})
