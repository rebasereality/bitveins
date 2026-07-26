import { CliExitCode } from '../../core/cli-error'
import type { CliOutput } from '../../ports/cli-output'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'
import type { CommandRegistry } from '../command-registry'

export class HelpCommand implements CliCommand {
  readonly aliases = ['--help', '-h']
  readonly description = 'Show Bitveins command help.'
  readonly name = 'help'
  readonly usage = 'bitveins help [command]'

  constructor(
    private readonly registry: CommandRegistry,
    private readonly output: CliOutput,
    private readonly version: string,
  ) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const target = parser.positional('command')
    parser.done()
    this.output.info(
      target
        ? this.registry.commandHelp(this.registry.resolve(target))
        : this.registry.overview(this.version),
    )
    return CliExitCode.Success
  }
}
