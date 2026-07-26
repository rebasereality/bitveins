import { dirname } from 'node:path'
import type { InstallationLayout } from '../core/installation-layout'
import type { InstallationCleaner } from '../ports/installation-cleaner'
import { removeSafeChild } from './secure-filesystem'

export class FilesystemInstallationCleaner implements InstallationCleaner {
  constructor(private readonly layout: InstallationLayout) {}

  async purgeData(): Promise<void> {
    await removeSafeChild(
      this.layout.configDirectory,
      dirname(this.layout.configDirectory),
      'configuration',
    )
    await removeSafeChild(
      this.layout.dataDirectory,
      dirname(this.layout.dataDirectory),
      'data',
    )
    await removeSafeChild(
      this.layout.stateDirectory,
      dirname(this.layout.stateDirectory),
      'state',
    )
  }
}
