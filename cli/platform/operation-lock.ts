import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { constants } from 'node:fs'
import {
  open,
} from 'node:fs/promises'
import { dirname } from 'node:path'
import { ensurePrivateDirectory } from './secure-filesystem'
import type { OperationLock } from '../ports/operation-lock'

const FLOCK_EXECUTABLE = '/usr/bin/flock'
const LOCK_HOLDER_EXECUTABLE = '/bin/cat'
const LOCK_READY_MARKER = 'bitveins-lock-ready\n'

async function acquireKernelLock(lockFile: string): Promise<ChildProcessWithoutNullStreams> {
  const handle = await open(
    lockFile,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  ).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
      throw new Error('The Bitveins installation lock is invalid.')
    }
    throw error
  })
  try {
    const stats = await handle.stat({ bigint: true })
    if (!stats.isFile()
      || (typeof process.getuid === 'function' && stats.uid !== BigInt(process.getuid()))
      || (stats.mode & 0o022n) !== 0n) {
      throw new Error('The Bitveins installation lock is invalid.')
    }

    const child = spawn(
      FLOCK_EXECUTABLE,
      ['--exclusive', '--nonblock', '/proc/self/fd/3', LOCK_HOLDER_EXECUTABLE],
      { stdio: ['pipe', 'pipe', 'pipe', handle.fd] },
    ) as ChildProcessWithoutNullStreams
    await new Promise<void>((resolve, reject) => {
      let output = ''
      let settled = false
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        reject(error)
      }
      child.once('error', () => fail(new Error('Unable to start the Bitveins installation lock.')))
      child.once('exit', code => fail(new Error(
        code === 1
          ? 'Another Bitveins installation operation is already running.'
          : 'Unable to acquire the Bitveins installation lock.',
      )))
      child.stdout.on('data', (chunk: Buffer) => {
        if (settled) return
        output += chunk.toString('utf8')
        if (output.includes(LOCK_READY_MARKER)) {
          settled = true
          resolve()
        }
      })
      child.stdin.on('error', () => {})
      child.stdin.write(LOCK_READY_MARKER)
    })
    return child
  }
  finally {
    await handle.close()
  }
}

async function releaseKernelLock(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.stdin.end()
  await exited
}

export async function withOperationLock<T>(
  lockFile: string,
  operation: () => Promise<T>,
): Promise<T> {
  await ensurePrivateDirectory(dirname(lockFile))
  const child = await acquireKernelLock(lockFile)
  try {
    return await operation()
  }
  finally {
    await releaseKernelLock(child)
  }
}

export class FileOperationLock implements OperationLock {
  constructor(private readonly lockFile: string) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    return await withOperationLock(this.lockFile, operation)
  }
}
