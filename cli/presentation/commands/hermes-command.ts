import {
  CliExitCode,
  CliUsageError,
} from '../../core/cli-error'
import { isValidHermesProfileName } from '../../core/hermes-profile'
import type { CliOutput } from '../../ports/cli-output'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

interface HermesPluginInstaller {
  install(profile: string): Promise<string>
}

export class HermesCommand implements CliCommand {
  readonly description = 'Install the bundled Hermes lifecycle notification plugin.'
  readonly name = 'hermes'
  readonly usage = 'bitveins hermes install [--profile <name>]'
  readonly usageDetails = [
    '--profile <name>    Hermes profile to configure, default: default.',
  ]

  constructor(
    private readonly installer: HermesPluginInstaller,
    private readonly output: CliOutput,
  ) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const profile = parser.value('--profile') ?? 'default'
    const action = parser.positional('Hermes action')
    parser.done()

    if (!action) {
      throw new CliUsageError('Hermes action is required.', {
        hint: `Usage: ${this.usage}`,
      })
    }
    if (action !== 'install') {
      throw new CliUsageError(`Unsupported Hermes action: ${action}`, {
        hint: `Usage: ${this.usage}`,
      })
    }
    if (!isValidHermesProfileName(profile)) {
      throw new CliUsageError('Invalid Hermes profile name.', {
        hint: 'Use letters, numbers, underscores or hyphens.',
      })
    }

    const target = await this.installer.install(profile)
    this.output.success(`Installed the Hermes notification plugin in ${target}.`)
    this.output.info('Restart Hermes Gateway and open a new CLI session to load the plugin.')
    return CliExitCode.Success
  }
}
