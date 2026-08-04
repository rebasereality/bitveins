import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DrizzleHermesNotificationPreferenceRepository } from '../../../../../server/modules/attention/adapters/drizzle-hermes-notification-preference-repository'
import { closeDatabase, useDrizzle } from '../../../../../server/utils/db'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bitveins-hermes-preferences-'))
  process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'history.sqlite')
})

afterEach(() => {
  closeDatabase()
  delete process.env.BITVEINS_DATABASE_PATH
  rmSync(tempDir, { force: true, recursive: true })
})

describe('DrizzleHermesNotificationPreferenceRepository integration', () => {
  it('persists the existing lifecycle behavior as the default', () => {
    const repository = new DrizzleHermesNotificationPreferenceRepository(useDrizzle())

    expect(repository.get()).toEqual({
      completedWithTools: true,
      completedWithoutTools: false,
      failed: true,
      inputRequired: true,
      permissionRequired: true,
    })
  })

  it('merges partial updates without resetting other lifecycle choices', () => {
    const database = useDrizzle()
    const repository = new DrizzleHermesNotificationPreferenceRepository(database)

    expect(repository.update({ completedWithoutTools: true }, 100)).toMatchObject({
      completedWithTools: true,
      completedWithoutTools: true,
      failed: true,
    })
    expect(repository.update({ failed: false }, 200)).toEqual({
      completedWithTools: true,
      completedWithoutTools: true,
      failed: false,
      inputRequired: true,
      permissionRequired: true,
    })
    expect(new DrizzleHermesNotificationPreferenceRepository(database).get()).toEqual({
      completedWithTools: true,
      completedWithoutTools: true,
      failed: false,
      inputRequired: true,
      permissionRequired: true,
    })
  })

  it('updates only patched columns even when a caller has a stale read', () => {
    const database = useDrizzle()
    const repository = new DrizzleHermesNotificationPreferenceRepository(database)
    repository.update({ completedWithoutTools: true }, 100)
    const staleRead = vi.spyOn(repository, 'get').mockReturnValue({
      completedWithTools: true,
      completedWithoutTools: false,
      failed: true,
      inputRequired: true,
      permissionRequired: true,
    })

    repository.update({ permissionRequired: false }, 200)
    staleRead.mockRestore()

    expect(new DrizzleHermesNotificationPreferenceRepository(database).get()).toEqual({
      completedWithTools: true,
      completedWithoutTools: true,
      failed: true,
      inputRequired: true,
      permissionRequired: false,
    })
  })
})
