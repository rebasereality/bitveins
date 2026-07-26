import { CliExitCode } from '../../core/cli-error'
import type { OperationLock } from '../../ports/operation-lock'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

interface Updater {
  update(version?: string): Promise<void>
}

export class UpdateCommand implements CliCommand {
  readonly description = 'Download, verify and activate a Bitveins release.'
  readonly name = 'update'
  readonly usage = 'bitveins update [--version <version>]'
  readonly usageDetails = [
    '--version <version>  Install an explicit semantic version.',
  ]

  constructor(
    private readonly updater: Updater,
    private readonly lock: OperationLock,
  ) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const version = parser.value('--version')
    parser.done()
    await this.lock.run(async () => await this.updater.update(version))
    return CliExitCode.Success
  }
}
