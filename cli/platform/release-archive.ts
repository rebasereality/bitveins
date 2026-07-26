import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  mkdir,
  readFile,
} from 'node:fs/promises'
import {
  basename,
  isAbsolute,
  join,
  normalize,
  relative,
} from 'node:path'
import { pipeline } from 'node:stream/promises'
import * as tar from 'tar'
import { CliIntegrityError } from '../core/cli-error.ts'

export interface ReleaseArchiveLimits {
  entries: number
  extractedBytes: number
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

const defaultLimits: ReleaseArchiveLimits = {
  entries: 100_000,
  extractedBytes: 1024 * 1024 * 1024,
}

function validateArchivePath(path: string): void {
  const normalized = normalize(path)
  if (
    !path
    || isAbsolute(path)
    || normalized === '..'
    || normalized.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new CliIntegrityError(
      `Release archive contains an unsafe path: ${path}`,
    )
  }
}

export class ReleaseArchive {
  private readonly limits: ReleaseArchiveLimits

  constructor(limits = defaultLimits) {
    this.limits = limits
  }

  async digest(path: string): Promise<string> {
    return await sha256File(path)
  }

  async verifyChecksum(
    archivePath: string,
    checksumPath: string,
  ): Promise<string> {
    const checksum = (await readFile(checksumPath, 'utf8')).trim()
    const match = /^([0-9a-f]{64}) {2}([^\s/]+)$/u.exec(checksum)
    if (!match || match[2] !== basename(archivePath)) {
      throw new CliIntegrityError(
        'Release checksum file has an invalid format.',
      )
    }

    const digest = await this.digest(archivePath)
    if (digest !== match[1]) {
      throw new CliIntegrityError('Release checksum verification failed.')
    }
    return digest
  }

  async extract(
    archivePath: string,
    destination: string,
    expectedRoot: string,
  ): Promise<string> {
    const entries: string[] = []
    let validationError: Error | null = null
    let extractedBytes = 0

    await tar.t({
      file: archivePath,
      onentry: (entry) => {
        try {
          validateArchivePath(entry.path)
          const normalized = normalize(entry.path)
          if (
            normalized !== expectedRoot
            && !normalized.startsWith(`${expectedRoot}/`)
          ) {
            throw new CliIntegrityError(
              `Release archive entry is outside ${expectedRoot}: ${entry.path}`,
            )
          }
          if (!['File', 'Directory'].includes(entry.type)) {
            throw new CliIntegrityError(
              `Release archive contains unsupported entry type ${entry.type}.`,
            )
          }
          entries.push(entry.path)
          extractedBytes += entry.size
          if (
            entries.length > this.limits.entries
            || extractedBytes > this.limits.extractedBytes
          ) {
            throw new CliIntegrityError(
              'Release archive exceeds the extraction safety limits.',
            )
          }
        }
        catch (error) {
          validationError ??= error instanceof Error
            ? error
            : new Error(String(error))
        }
      },
    })

    if (validationError) {
      throw validationError
    }
    if (entries.length === 0) {
      throw new CliIntegrityError('Release archive is empty.')
    }

    await mkdir(destination, { mode: 0o700, recursive: true })
    await tar.x({
      cwd: destination,
      file: archivePath,
      preservePaths: false,
      strict: true,
    })

    const root = join(destination, expectedRoot)
    if (relative(destination, root).startsWith('..')) {
      throw new CliIntegrityError(
        'Release extraction escaped its destination.',
      )
    }
    return root
  }
}
