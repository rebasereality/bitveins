import {
  open,
  readFile,
  rm,
} from 'node:fs/promises'
import { dirname } from 'node:path'
import { ensurePrivateDirectory } from './secure-filesystem'
import type { OperationLock } from '../ports/operation-lock'

export async function withOperationLock<T>(
  lockFile: string,
  operation: () => Promise<T>,
): Promise<T> {
  await ensurePrivateDirectory(dirname(lockFile))
  let handle

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = await open(lockFile, 'wx', 0o600)
      break
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }

      const existingPid = Number.parseInt((await readFile(lockFile, 'utf8')).trim(), 10)
      let active = Number.isSafeInteger(existingPid) && existingPid > 0
      if (active) {
        try {
          process.kill(existingPid, 0)
        }
        catch (signalError) {
          active = (signalError as NodeJS.ErrnoException).code !== 'ESRCH'
        }
      }

      if (active || attempt > 0) {
        throw new Error('Another Bitveins installation operation is already running.', {
          cause: error,
        })
      }

      await rm(lockFile, { force: true })
    }
  }

  if (!handle) {
    throw new Error('Unable to acquire the Bitveins installation lock.')
  }

  try {
    await handle.writeFile(`${process.pid}\n`, 'utf8')
    return await operation()
  }
  finally {
    await handle.close()
    await rm(lockFile, { force: true })
  }
}

export class FileOperationLock implements OperationLock {
  constructor(private readonly lockFile: string) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    return await withOperationLock(this.lockFile, operation)
  }
}
