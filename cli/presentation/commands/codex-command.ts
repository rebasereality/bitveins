import {
  CliExitCode,
  CliUsageError,
} from '../../core/cli-error'
import type { CliOutput } from '../../ports/cli-output'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

interface CodexPluginInstaller {
  install(): Promise<string>
}

export class CodexCommand implements CliCommand {
  readonly description = 'Install the bundled Codex lifecycle notification plugin.'
  readonly name = 'codex'
  readonly usage = 'bitveins codex install'

  constructor(
    private readonly installer: CodexPluginInstaller,
    private readonly output: CliOutput,
  ) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const action = parser.positional('Codex action')
    parser.done()

    if (!action) {
      throw new CliUsageError('Codex action is required.', {
        hint: `Usage: ${this.usage}`,
      })
    }
    if (action !== 'install') {
      throw new CliUsageError(`Unsupported Codex action: ${action}`, {
        hint: `Usage: ${this.usage}`,
      })
    }

    const target = await this.installer.install()
    this.output.success(`Installed the Codex notification plugin in ${target}.`)
    this.output.info('Start a new Codex session, open /hooks, and trust the Bitveins hook definition.')
    return CliExitCode.Success
  }
}
