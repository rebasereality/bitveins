import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DrizzleDropzoneRepository } from '../../../../../server/modules/dropzones/adapters/drizzle-dropzone-repository'
import { closeDatabase, useDrizzle } from '../../../../../server/utils/db'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bitveins-dropzones-'))
  process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'dropzones.sqlite')
})

afterEach(() => {
  closeDatabase()
  delete process.env.BITVEINS_DATABASE_PATH
  rmSync(tempDir, {
    force: true,
    recursive: true,
  })
})

describe('DrizzleDropzoneRepository integration', () => {
  it('replaces dropzones in their supplied order', () => {
    const repository = new DrizzleDropzoneRepository(useDrizzle())

    repository.replace([
      { name: 'Home', path: '~' },
      { name: 'Projects', path: '~/code' },
    ], 42)
    expect(repository.list()).toEqual([
      { name: 'Home', path: '~' },
      { name: 'Projects', path: '~/code' },
    ])

    repository.replace([{ name: 'Only', path: '/tmp' }], 43)
    expect(repository.list()).toEqual([{ name: 'Only', path: '/tmp' }])

    repository.replace([], 44)
    expect(repository.list()).toEqual([])
  })

  it('rolls back the replacement when an insert violates an invariant', () => {
    const repository = new DrizzleDropzoneRepository(useDrizzle())
    repository.replace([{ name: 'Stable', path: '~' }], 42)

    expect(() => repository.replace([
      { name: 'Duplicate', path: '/one' },
      { name: 'Duplicate', path: '/two' },
    ], 43)).toThrow()
    expect(repository.list()).toEqual([{ name: 'Stable', path: '~' }])
  })
})
