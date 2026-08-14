import {
  CliExitCode,
  CliUsageError,
} from '../../core/cli-error'
import type { CliOutput } from '../../ports/cli-output'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

interface AntigravityPluginInstaller {
  install(): Promise<{ hooksPath: string, scriptPath: string }>
}

export class AntigravityCommand implements CliCommand {
  readonly description = 'Install the bundled Antigravity lifecycle notification hooks.'
  readonly name = 'antigravity'
  readonly usage = 'bitveins antigravity install'

  constructor(
    private readonly installer: AntigravityPluginInstaller,
    private readonly output: CliOutput,
  ) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const action = parser.positional('Antigravity action')
    parser.done()

    if (!action) {
      throw new CliUsageError('Antigravity action is required.', {
        hint: `Usage: ${this.usage}`,
      })
    }
    if (action !== 'install') {
      throw new CliUsageError(`Unsupported Antigravity action: ${action}`, {
        hint: `Usage: ${this.usage}`,
      })
    }

    const { hooksPath } = await this.installer.install()
    this.output.success(`Installed Antigravity notification hooks in ${hooksPath}.`)
    this.output.info('Antigravity sessions will automatically emit attention events to Bitveins.')
    return CliExitCode.Success
  }
}
