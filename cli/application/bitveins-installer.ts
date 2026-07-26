import { CliPrerequisiteError } from '../core/cli-error'
import {
  createBitveinsEnvironment,
  type BitveinsEnvironment,
} from '../core/environment-file'
import type { InstallationLayout } from '../core/installation-layout'
import type { HostInspector } from '../ports/host-inspector'
import type { PasswordReader } from '../ports/password-reader'
import type { CliOutput } from '../ports/cli-output'
import type { ReleaseStore } from '../ports/release-store'
import { hashBitveinsPassword } from '../../shared/security/password-hasher'
import type { InstallationTransaction } from './installation/installation-transaction'

export interface InstallOptions {
  allowedOrigin?: string
  port: number
  releaseRoot: string
}

interface InstallerDependencies {
  host: HostInspector
  layout: InstallationLayout
  output: CliOutput
  passwordReader: PasswordReader
  releases: ReleaseStore
  transaction: InstallationTransaction
}

export class BitveinsInstaller {
  constructor(private readonly dependencies: InstallerDependencies) {}

  async install(options: InstallOptions): Promise<void> {
    const source = await this.dependencies.releases.load(options.releaseRoot)
    const snapshot = await this.dependencies.transaction.capture()
    await this.preflight(
      source.metadata.platform,
      source.metadata.architecture,
      options.port,
      snapshot.environment === null,
    )

    this.dependencies.output.info(
      `Installing Bitveins ${source.metadata.version}...`,
    )
    const installed = await this.dependencies.releases.install(
      options.releaseRoot,
    )
    const environment = snapshot.environment
      ?? await this.createEnvironment(options)

    if (snapshot.environment) {
      this.dependencies.output.info(
        'Keeping the existing Bitveins configuration.',
      )
    }

    await this.dependencies.transaction.activate({
      environment,
      release: installed,
      snapshot,
      writeEnvironment: snapshot.environment === null,
    })

    this.dependencies.output.success(
      `Bitveins ${installed.bundle.metadata.version} is ready.`,
    )
    this.dependencies.output.info(
      `Local URL: http://127.0.0.1:${environment.port}`,
    )
  }

  private async createEnvironment(
    options: InstallOptions,
  ): Promise<BitveinsEnvironment> {
    const password = await this.dependencies.passwordReader.readNewPassword()
    return createBitveinsEnvironment({
      allowedOrigin: options.allowedOrigin,
      databasePath: `${this.dependencies.layout.dataDirectory}/history.sqlite`,
      passwordHash: await hashBitveinsPassword(password),
      port: options.port,
    })
  }

  private async preflight(
    platform: string,
    architecture: string,
    port: number,
    checkPort: boolean,
  ): Promise<void> {
    const runtime = this.dependencies.host.runtime()
    if (runtime.uid === 0) {
      throw new CliPrerequisiteError(
        'Run bitveins install as the Unix user who owns the tmux sessions, not root.',
      )
    }
    if (
      runtime.platform !== 'linux'
      || runtime.architecture !== 'x64'
      || platform !== 'linux'
      || architecture !== 'x64'
    ) {
      throw new CliPrerequisiteError(
        'This Bitveins release supports Linux x86_64 only.',
      )
    }

    for (const command of ['systemctl', 'tmux']) {
      if (!await this.dependencies.host.hasCommand(command)) {
        throw new CliPrerequisiteError(
          `${command} is required but was not found in PATH.`,
        )
      }
    }
    if (
      checkPort
      && !await this.dependencies.host.loopbackPortAvailable(port)
    ) {
      throw new CliPrerequisiteError(
        `Port ${port} is already in use on 127.0.0.1.`,
      )
    }
  }
}
