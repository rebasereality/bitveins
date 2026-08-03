import type { BitveinsEnvironment } from '../core/environment-file'
import {
  parseEnvironmentFile,
  serializeEnvironmentFile,
} from '../core/environment-file'
import type { EnvironmentRepository } from '../ports/environment-repository'
import type { InstallationLayout } from '../core/installation-layout'
import {
  readPrivateFile,
  removeFile,
  writePrivateFileAtomic,
} from './secure-filesystem'

export class FilesystemEnvironmentRepository implements EnvironmentRepository {
  constructor(private readonly layout: InstallationLayout) {}

  async read(): Promise<BitveinsEnvironment> {
    const content = await readPrivateFile(this.layout.environmentFile)
    const environment = parseEnvironmentFile(content)
    const serialized = serializeEnvironmentFile(environment)
    if (serialized !== content) {
      await writePrivateFileAtomic(this.layout.environmentFile, serialized)
    }
    return environment
  }

  async readOptional(): Promise<BitveinsEnvironment | null> {
    try {
      return await this.read()
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async remove(): Promise<void> {
    await removeFile(this.layout.environmentFile)
  }

  async write(environment: BitveinsEnvironment): Promise<void> {
    await writePrivateFileAtomic(
      this.layout.environmentFile,
      serializeEnvironmentFile(environment),
    )
  }
}
