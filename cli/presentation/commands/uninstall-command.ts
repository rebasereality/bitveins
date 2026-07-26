import {
  CliExitCode,
  CliUsageError,
} from '../../core/cli-error'
import type { OperationLock } from '../../ports/operation-lock'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

interface Uninstaller {
  uninstall(purge: boolean): Promise<void>
}

export class UninstallCommand implements CliCommand {
  readonly description = 'Remove Bitveins while preserving configuration and data by default.'
  readonly name = 'uninstall'
  readonly usage = 'bitveins uninstall [--purge]'
  readonly usageDetails = [
    '--purge  Also remove Bitveins configuration, state and history.',
  ]

  constructor(private readonly dependencies: {
    confirmPurge(): Promise<boolean>
    lock: OperationLock
    uninstaller: Uninstaller
  }) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const purge = parser.flag('--purge')
    parser.done()

    if (purge && !await this.dependencies.confirmPurge()) {
      throw new CliUsageError('Purge cancelled.')
    }
    await this.dependencies.lock.run(async () => {
      await this.dependencies.uninstaller.uninstall(purge)
    })
    return CliExitCode.Success
  }
}
