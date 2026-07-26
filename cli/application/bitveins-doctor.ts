import type { InstallationLayout } from '../core/installation-layout'
import type { CliOutput } from '../ports/cli-output'
import type { EnvironmentRepository } from '../ports/environment-repository'
import type { HealthProbe } from '../ports/health-probe'
import type { HostInspector } from '../ports/host-inspector'
import type { ReleaseStore } from '../ports/release-store'
import type { ServiceManager } from '../ports/service-manager'

export interface DoctorReport {
  errors: string[]
  warnings: string[]
}

export class BitveinsDoctor {
  constructor(private readonly dependencies: {
    environment: EnvironmentRepository
    health: HealthProbe
    host: HostInspector
    layout: InstallationLayout
    output: CliOutput
    releases: ReleaseStore
    service: ServiceManager
  }) {}

  async diagnose(): Promise<DoctorReport> {
    const errors: string[] = []
    const warnings: string[] = []
    const runtime = this.dependencies.host.runtime()

    if (runtime.platform !== 'linux' || runtime.architecture !== 'x64') {
      errors.push('This release supports Linux x86_64 only.')
    }
    for (const command of ['systemctl', 'tmux']) {
      if (!await this.dependencies.host.hasCommand(command)) {
        errors.push(`${command} is missing from PATH.`)
      }
    }

    let port = 3000
    try {
      const environment = await this.dependencies.environment.read()
      port = environment.port
      if (environment.host !== '127.0.0.1') {
        errors.push('HOST must be exactly 127.0.0.1.')
      }
    }
    catch (error) {
      errors.push(this.message(error, 'Unable to read Bitveins configuration.'))
    }

    try {
      const bundle = await this.dependencies.releases.current()
      this.dependencies.output.info(
        `Release ${bundle.metadata.version} (${bundle.metadata.commit}, Node ${bundle.metadata.nodeVersion})`,
      )
    }
    catch (error) {
      errors.push(this.message(error, 'Current Bitveins release is invalid.'))
    }

    if (!await this.dependencies.service.isActive()) {
      errors.push('bitveins.service is not active.')
    }
    else {
      try {
        await this.dependencies.health.waitUntilHealthy(port, {
          attempts: 2,
          delayMs: 100,
        })
      }
      catch (error) {
        errors.push(this.message(error, 'Bitveins health check failed.'))
      }
    }

    const addresses = await this.dependencies.host.listenerAddresses(port)
    if (addresses === null) {
      warnings.push(
        'The ss command is unavailable; listener isolation was not inspected.',
      )
    }
    else if (addresses.some(
      address => !address.startsWith('127.0.0.1:'),
    )) {
      errors.push(`Port ${port} is listening on a non-loopback address.`)
    }

    const availableBytes = await this.dependencies.host.availableBytes(
      this.dependencies.layout.installationRoot,
    )
    if (availableBytes === null) {
      warnings.push('Available disk space could not be inspected.')
    }
    else if (availableBytes < 250 * 1024 * 1024) {
      warnings.push('Less than 250 MiB is available for Bitveins updates.')
    }

    if (await this.dependencies.host.lingerEnabled() === false) {
      warnings.push(
        'systemd lingering is disabled; Bitveins may stop after logout.',
      )
    }

    for (const warning of warnings) {
      this.dependencies.output.info(`Warning: ${warning}`)
    }
    for (const error of errors) {
      this.dependencies.output.error(error)
    }
    if (errors.length === 0) {
      this.dependencies.output.success('Bitveins installation is healthy.')
    }
    return { errors, warnings }
  }

  private message(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback
  }
}
