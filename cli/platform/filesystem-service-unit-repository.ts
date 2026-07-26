import {
  lstat,
  readFile,
} from 'node:fs/promises'
import type { InstallationLayout } from '../core/installation-layout'
import type { ServiceUnitRepository } from '../ports/service-unit-repository'
import {
  removeFile,
  writeFileAtomic,
} from './secure-filesystem'
import { renderSystemdUserUnit } from './systemd-unit'

export class FilesystemServiceUnitRepository implements ServiceUnitRepository {
  constructor(
    private readonly layout: InstallationLayout,
    private readonly home: string,
  ) {}

  async install(): Promise<void> {
    await writeFileAtomic(
      this.layout.systemdUnit,
      renderSystemdUserUnit(this.layout, this.home),
      0o644,
    )
  }

  async readOptional(): Promise<string | null> {
    try {
      const stats = await lstat(this.layout.systemdUnit)
      if (!stats.isFile()) {
        throw new Error(
          `${this.layout.systemdUnit} must be a regular file.`,
        )
      }
      if (process.getuid && stats.uid !== process.getuid()) {
        throw new Error(
          `${this.layout.systemdUnit} must be owned by the current Unix user.`,
        )
      }
      return await readFile(this.layout.systemdUnit, 'utf8')
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async restore(content: string | null): Promise<void> {
    if (content === null) {
      await removeFile(this.layout.systemdUnit)
      return
    }
    await writeFileAtomic(this.layout.systemdUnit, content, 0o644)
  }
}
