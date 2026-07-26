import { readFile } from 'node:fs/promises'
import {
  basename,
  dirname,
  join,
  resolve,
} from 'node:path'
import type { InstallationLayout } from '../core/installation-layout'
import type { ReleaseActivationHistory } from '../ports/release-store'
import {
  assertSafeChild,
  removeFile,
  writeFileAtomic,
} from './secure-filesystem'

function releaseName(path: string, releasesDirectory: string): string {
  assertSafeChild(path, releasesDirectory, 'activation history release')
  const name = basename(path)
  if (join(releasesDirectory, name) !== resolve(path)) {
    throw new Error(`Release path is not a direct child: ${path}`)
  }
  return name
}

function parseHistory(value: unknown): ReleaseActivationHistory {
  if (!value || typeof value !== 'object') {
    throw new Error('Release activation history must be an object.')
  }
  const candidate = value as Partial<ReleaseActivationHistory>
  if (
    candidate.version !== 1
    || typeof candidate.current !== 'string'
    || !candidate.current
    || (
      candidate.previous !== null
      && typeof candidate.previous !== 'string'
    )
  ) {
    throw new Error('Release activation history is invalid.')
  }
  return {
    current: candidate.current,
    previous: candidate.previous,
    version: 1,
  }
}

export class FilesystemReleaseActivationHistory {
  private readonly path: string

  constructor(private readonly layout: InstallationLayout) {
    this.path = join(layout.installationRoot, 'activation-history.json')
  }

  async readOptional(): Promise<ReleaseActivationHistory | null> {
    try {
      const history = parseHistory(
        JSON.parse(await readFile(this.path, 'utf8')),
      )
      this.resolveRelease(history.current)
      if (history.previous) {
        this.resolveRelease(history.previous)
      }
      return history
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async record(path: string, previousTarget: string | null): Promise<void> {
    const current = releaseName(path, this.layout.releasesDirectory)
    const existing = await this.readOptional()
    const previousPath = previousTarget
      ? resolve(dirname(this.layout.currentReleaseLink), previousTarget)
      : null
    const previous = previousPath
      ? releaseName(previousPath, this.layout.releasesDirectory)
      : null

    await this.write({
      current,
      previous: previous === current ? existing?.previous ?? null : previous,
      version: 1,
    })
  }

  resolveRelease(name: string): string {
    if (
      !name
      || name === '.'
      || name === '..'
      || basename(name) !== name
    ) {
      throw new Error(`Invalid release name in activation history: ${name}`)
    }
    const path = join(this.layout.releasesDirectory, name)
    assertSafeChild(
      path,
      this.layout.releasesDirectory,
      'activation history release',
    )
    return path
  }

  async restore(history: ReleaseActivationHistory | null): Promise<void> {
    if (history) {
      await this.write(history)
      return
    }
    await removeFile(this.path)
  }

  private async write(history: ReleaseActivationHistory): Promise<void> {
    await writeFileAtomic(
      this.path,
      `${JSON.stringify(history, null, 2)}\n`,
      0o600,
    )
  }
}
