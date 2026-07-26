import { CliTransactionError } from '../../core/cli-error'
import type { BitveinsEnvironment } from '../../core/environment-file'
import type { CliOutput } from '../../ports/cli-output'
import type { EnvironmentRepository } from '../../ports/environment-repository'
import type { HealthProbe } from '../../ports/health-probe'
import type {
  InstalledRelease,
  ReleaseStore,
} from '../../ports/release-store'
import type { ServiceManager } from '../../ports/service-manager'
import type { ServiceUnitRepository } from '../../ports/service-unit-repository'
import { InstallationSnapshot } from './installation-snapshot'

export class InstallationTransaction {
  constructor(private readonly dependencies: {
    environment: EnvironmentRepository
    health: HealthProbe
    output: CliOutput
    releases: ReleaseStore
    service: ServiceManager
    serviceUnit: ServiceUnitRepository
  }) {}

  async capture(): Promise<InstallationSnapshot> {
    const [environment, release, serviceUnit] = await Promise.all([
      this.dependencies.environment.readOptional(),
      this.dependencies.releases.snapshot(),
      this.dependencies.serviceUnit.readOptional(),
    ])
    return new InstallationSnapshot({ environment, release, serviceUnit })
  }

  async activate(options: {
    environment: BitveinsEnvironment
    release: InstalledRelease
    snapshot: InstallationSnapshot
    writeEnvironment: boolean
  }): Promise<void> {
    try {
      if (options.writeEnvironment) {
        await this.dependencies.environment.write(options.environment)
      }
      await this.dependencies.releases.activate(options.release.path)
      await this.dependencies.serviceUnit.install()
      await this.dependencies.service.daemonReload()
      await this.dependencies.service.enableAndStart()
      if (options.snapshot.release.currentTarget !== null) {
        await this.dependencies.service.restart()
      }
      await this.dependencies.health.waitUntilHealthy(options.environment.port)
      await this.dependencies.releases.recordActivation(
        options.release.path,
        options.snapshot.release.currentTarget,
      )
    }
    catch (operationError) {
      await this.recover(options, operationError)
    }
  }

  private async recover(
    options: {
      environment: BitveinsEnvironment
      release: InstalledRelease
      snapshot: InstallationSnapshot
      writeEnvironment: boolean
    },
    operationError: unknown,
  ): Promise<never> {
    this.dependencies.output.error(
      'Installation failed; restoring the previous Bitveins state.',
    )

    try {
      await this.rollback(options.snapshot)
    }
    catch (rollbackError) {
      throw new CliTransactionError(
        'Installation and automatic rollback both failed.',
        {
          cause: new AggregateError([operationError, rollbackError]),
          details: [
            `operation: ${this.message(operationError)}`,
            `rollback: ${this.message(rollbackError)}`,
          ],
          hint: 'Run bitveins doctor before attempting another operation.',
        },
      )
    }

    if (options.release.created) {
      try {
        await this.dependencies.releases.removeInstalledRelease(
          options.release.path,
          'failed release',
        )
      }
      catch (cleanupError) {
        this.dependencies.output.error(
          `Failed release cleanup also failed: ${this.message(cleanupError)}`,
        )
      }
    }
    throw operationError
  }

  private async rollback(snapshot: InstallationSnapshot): Promise<void> {
    await this.dependencies.releases.restore(snapshot.release)
    if (snapshot.environment) {
      await this.dependencies.environment.write(snapshot.environment)
    }
    else {
      await this.dependencies.environment.remove()
    }
    await this.dependencies.serviceUnit.restore(snapshot.serviceUnit)
    await this.dependencies.service.daemonReload()

    if (snapshot.release.currentTarget && snapshot.environment) {
      await this.dependencies.service.restart()
      await this.dependencies.health.waitUntilHealthy(
        snapshot.environment.port,
      )
      return
    }
    await this.dependencies.service.disable()
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
