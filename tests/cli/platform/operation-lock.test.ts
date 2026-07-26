import {
  access,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { withOperationLock } from '../../../cli/platform/operation-lock'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

describe('operation lock', () => {
  it('prevents concurrent installation mutations and releases afterward', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-lock-'))
    temporaryDirectories.push(directory)
    const lock = join(directory, 'state', 'operation.lock')
    let releaseFirst: (() => void) | undefined
    const first = withOperationLock(lock, async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
    })
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await access(lock).then(() => true, () => false)) {
        break
      }
      await new Promise(resolve => setImmediate(resolve))
    }

    await expect(withOperationLock(lock, async () => {}))
      .rejects.toThrow(/already running/)
    releaseFirst?.()
    await first
    await expect(withOperationLock(lock, async () => 'done')).resolves.toBe('done')
  })

  it('recovers a lock left by a process that no longer exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-stale-lock-'))
    temporaryDirectories.push(directory)
    const lock = join(directory, 'state', 'operation.lock')
    await mkdir(join(directory, 'state'), { recursive: true })
    await writeFile(lock, '2147483647\n', { mode: 0o600 })

    await expect(withOperationLock(lock, async () => 'recovered')).resolves.toBe('recovered')
  })
})
