import { CliExitCode } from '../../core/cli-error'
import type { CliOutput } from '../../ports/cli-output'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

export class VersionCommand implements CliCommand {
  readonly aliases = ['--version', '-v']
  readonly description = 'Print the installed Bitveins CLI version.'
  readonly name = 'version'
  readonly usage = 'bitveins version'

  constructor(
    private readonly output: CliOutput,
    private readonly version: string,
  ) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    parser.done()
    this.output.info(this.version)
    return CliExitCode.Success
  }
}
