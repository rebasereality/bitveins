import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DrizzleCodexNotificationPreferenceRepository } from '../../../../../server/modules/attention/adapters/drizzle-codex-notification-preference-repository'
import { closeDatabase, useDrizzle } from '../../../../../server/utils/db'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bitveins-codex-preferences-'))
  process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'history.sqlite')
})

afterEach(() => {
  closeDatabase()
  delete process.env.BITVEINS_DATABASE_PATH
  rmSync(tempDir, { force: true, recursive: true })
})

describe('DrizzleCodexNotificationPreferenceRepository integration', () => {
  it('persists the supported lifecycle defaults', () => {
    const repository = new DrizzleCodexNotificationPreferenceRepository(useDrizzle())

    expect(repository.get()).toEqual({
      completedWithTools: true,
      completedWithoutTools: false,
      permissionRequired: true,
    })
  })

  it('merges partial updates without resetting other choices', () => {
    const database = useDrizzle()
    const repository = new DrizzleCodexNotificationPreferenceRepository(database)

    expect(repository.update({ completedWithoutTools: true }, 100)).toEqual({
      completedWithTools: true,
      completedWithoutTools: true,
      permissionRequired: true,
    })
    expect(repository.update({ permissionRequired: false }, 200)).toEqual({
      completedWithTools: true,
      completedWithoutTools: true,
      permissionRequired: false,
    })
  })

  it('updates only patched columns after a stale read', () => {
    const database = useDrizzle()
    const repository = new DrizzleCodexNotificationPreferenceRepository(database)
    repository.update({ completedWithoutTools: true }, 100)
    const staleRead = vi.spyOn(repository, 'get').mockReturnValue({
      completedWithTools: true,
      completedWithoutTools: false,
      permissionRequired: true,
    })

    repository.update({ permissionRequired: false }, 200)
    staleRead.mockRestore()

    expect(new DrizzleCodexNotificationPreferenceRepository(database).get()).toEqual({
      completedWithTools: true,
      completedWithoutTools: true,
      permissionRequired: false,
    })
  })
})
