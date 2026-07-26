import type { CliOutput } from '../ports/cli-output'
import type { InstallationCleaner } from '../ports/installation-cleaner'
import type { ReleaseStore } from '../ports/release-store'
import type { ServiceManager } from '../ports/service-manager'
import type { ServiceUnitRepository } from '../ports/service-unit-repository'

export class BitveinsUninstaller {
  constructor(private readonly dependencies: {
    cleaner: InstallationCleaner
    output: CliOutput
    releases: ReleaseStore
    service: ServiceManager
    serviceUnit: ServiceUnitRepository
  }) {}

  async uninstall(purge: boolean): Promise<void> {
    await this.dependencies.service.disable()
    await this.dependencies.serviceUnit.restore(null)
    await this.dependencies.service.daemonReload()
    await this.dependencies.releases.removeInstallation()

    if (purge) {
      await this.dependencies.cleaner.purgeData()
      this.dependencies.output.success(
        'Bitveins and its configuration data were removed.',
      )
      return
    }
    this.dependencies.output.success(
      'Bitveins was removed. Configuration and data were preserved.',
    )
  }
}
