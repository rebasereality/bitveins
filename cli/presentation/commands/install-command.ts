import {
  normalizePublicOrigin,
  parseBitveinsPort,
} from '../../core/environment-file'
import {
  CliExitCode,
  CliUsageError,
} from '../../core/cli-error'
import type { OperationLock } from '../../ports/operation-lock'
import type { PasswordReader } from '../../ports/password-reader'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

interface Installer {
  install(options: {
    allowedOrigin?: string
    port: number
    releaseRoot: string
  }): Promise<void>
}

export class InstallCommand implements CliCommand {
  readonly description = 'Install or activate the bundled Bitveins release.'
  readonly name = 'install'
  readonly usage
    = 'bitveins install [--port <port>] [--origin <https-origin>] [--password-file <path>]'

  readonly usageDetails = [
    '--port <port>                 Loopback port, default: 3000.',
    '--origin <https-origin>       Optional public HTTPS origin.',
    '--password-file <path>        Read the new password from a private file.',
  ]

  constructor(private readonly dependencies: {
    createInstaller(passwordReader: PasswordReader): Installer
    createPasswordReader(passwordFile?: string): PasswordReader
    lock: OperationLock
    releaseRoot: string
  }) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const passwordFile = parser.value('--password-file')
    const portValue = parser.value('--port') ?? '3000'
    const originValue = parser.value('--origin')
    parser.done()

    let port: number
    let allowedOrigin: string | undefined
    try {
      port = parseBitveinsPort(portValue)
      allowedOrigin = originValue
        ? normalizePublicOrigin(originValue)
        : undefined
    }
    catch (error) {
      throw new CliUsageError(
        error instanceof Error ? error.message : String(error),
        { cause: error },
      )
    }

    const reader = this.dependencies.createPasswordReader(passwordFile)
    const installer = this.dependencies.createInstaller(reader)
    await this.dependencies.lock.run(async () => await installer.install({
      allowedOrigin,
      port,
      releaseRoot: this.dependencies.releaseRoot,
    }))
    return CliExitCode.Success
  }
}
