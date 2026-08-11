import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withOperationLock } from '../../../cli/platform/operation-lock'

const temporaryDirectories: string[] = []

async function runConcurrentAcquisitionBurst(lock: string): Promise<{
  attempts: PromiseSettledResult<void>[]
  maximum: number
}> {
  let active = 0
  let maximum = 0
  let rejected = 0
  let releaseWinner: (() => void) | undefined
  let markWinnerEntered: (() => void) | undefined
  let markContendersSettled: (() => void) | undefined
  const winnerRelease = new Promise<void>((resolve) => {
    releaseWinner = resolve
  })
  const winnerEntered = new Promise<void>((resolve) => {
    markWinnerEntered = resolve
  })
  const contendersSettled = new Promise<void>((resolve) => {
    markContendersSettled = resolve
  })

  const pendingAttempts = Array.from({ length: 20 }, () => (
    withOperationLock(lock, async () => {
      active += 1
      maximum = Math.max(maximum, active)
      markWinnerEntered?.()
      await winnerRelease
      active -= 1
    }).then<PromiseSettledResult<void>>(
      value => ({ status: 'fulfilled', value }),
      (error: unknown) => {
        rejected += 1
        if (rejected === 19) markContendersSettled?.()
        return { status: 'rejected', reason: error }
      },
    )
  ))

  await winnerEntered
  await contendersSettled
  releaseWinner?.()

  return {
    attempts: await Promise.all(pendingAttempts),
    maximum,
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
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
    expect(await readFile(lock, 'utf8')).toBe('2147483647\n')
  })

  it('treats lock-file contents as opaque kernel-lock metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-initializing-lock-'))
    temporaryDirectories.push(directory)
    const lock = join(directory, 'state', 'operation.lock')
    await mkdir(join(directory, 'state'), { recursive: true })
    await writeFile(lock, '', { mode: 0o600 })
    let entered = false

    await expect(withOperationLock(lock, async () => {
      entered = true
    })).resolves.toBeUndefined()
    expect(entered).toBe(true)
  })

  it('allows only one operation to enter under a concurrent acquisition burst', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-burst-lock-'))
    temporaryDirectories.push(directory)
    const lock = join(directory, 'state', 'operation.lock')
    const { attempts, maximum } = await runConcurrentAcquisitionBurst(lock)

    expect(maximum).toBe(1)
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  })

  it('allows only one stale-lock recoverer to enter under a concurrent burst', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-stale-burst-lock-'))
    temporaryDirectories.push(directory)
    const state = join(directory, 'state')
    const lock = join(state, 'operation.lock')
    await mkdir(state)
    await writeFile(lock, '2147483647\n', { mode: 0o600 })
    const { attempts, maximum } = await runConcurrentAcquisitionBurst(lock)

    expect(maximum).toBe(1)
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  })

  it('rejects non-file locks and accepts arbitrary file contents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-invalid-lock-'))
    temporaryDirectories.push(directory)
    const state = join(directory, 'state')
    await mkdir(state)

    const directoryLock = join(state, 'directory.lock')
    await mkdir(directoryLock)
    await expect(withOperationLock(directoryLock, async () => {}))
      .rejects.toThrow(/lock is invalid/i)

    for (const [index, content] of ['', '0\n', 'not-a-pid\n'].entries()) {
      const malformedLock = join(state, `malformed-${index}.lock`)
      await writeFile(malformedLock, content, { mode: 0o600 })
      await expect(withOperationLock(malformedLock, async () => 'locked')).resolves.toBe('locked')
      expect(await readFile(malformedLock, 'utf8')).toBe(content)
    }
  })

  it('never probes a PID parsed from lock-file contents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-denied-lock-'))
    temporaryDirectories.push(directory)
    const lock = join(directory, 'state', 'operation.lock')
    await mkdir(join(directory, 'state'), { recursive: true })
    await writeFile(lock, '2147483647\n', { mode: 0o600 })
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' })
    })

    await expect(withOperationLock(lock, async () => 'locked')).resolves.toBe('locked')
    expect(process.kill).not.toHaveBeenCalled()
    expect(await readFile(lock, 'utf8')).toBe('2147483647\n')
  })

  it('does not delete a lock that was replaced while the operation was running', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-replaced-lock-'))
    temporaryDirectories.push(directory)
    const lock = join(directory, 'state', 'operation.lock')

    await withOperationLock(lock, async () => {
      await rm(lock)
      await writeFile(lock, '2147483647\n', { mode: 0o600 })
    })

    expect(await readFile(lock, 'utf8')).toBe('2147483647\n')
  })

  it('creates no sidecars and keeps the persistent lock after operation failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-lock-cleanup-'))
    temporaryDirectories.push(directory)
    const state = join(directory, 'state')
    const disappearingLock = join(state, 'disappearing.lock')

    await withOperationLock(disappearingLock, async () => {
      await rm(disappearingLock)
    })
    await expect(withOperationLock(join(state, 'failing.lock'), async () => {
      throw new Error('operation failed')
    })).rejects.toThrow('operation failed')

    expect(await readdir(state)).toEqual(['failing.lock'])
  })

  it('refuses a symbolic lock without reading its target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-symbolic-lock-'))
    temporaryDirectories.push(directory)
    const state = join(directory, 'state')
    const target = join(state, 'target')
    const lock = join(state, 'operation.lock')
    await mkdir(state)
    await writeFile(target, `${process.pid}\n`, { mode: 0o600 })
    await symlink(target, lock)

    await expect(withOperationLock(lock, async () => {})).rejects.toMatchObject({ code: 'ELOOP' })
  })
})
