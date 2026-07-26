import { CliExitCode } from '../core/cli-error'
import type { CliOutput } from '../ports/cli-output'
import { CliErrorPresenter } from './cli-error-presenter'
import { extractGlobalVerbose } from './command-parser'
import type { CommandRegistry } from './command-registry'

export class CliApplication {
  private readonly errorPresenter: CliErrorPresenter

  constructor(
    private readonly dependencies: {
      commands: CommandRegistry
      output: CliOutput
    },
  ) {
    this.errorPresenter = new CliErrorPresenter(dependencies.output)
  }

  async run(argv: readonly string[]): Promise<number> {
    let verbose = false

    try {
      const global = extractGlobalVerbose(argv)
      verbose = global.verbose
      const [name = 'help', ...args] = global.args
      const command = this.dependencies.commands.resolve(name)

      if (
        command.name !== 'help'
        && args.length === 1
        && (args[0] === '--help' || args[0] === '-h')
      ) {
        this.dependencies.output.info(
          this.dependencies.commands.commandHelp(command),
        )
        return CliExitCode.Success
      }

      return await command.run(args)
    }
    catch (error) {
      return this.errorPresenter.present(error, verbose)
    }
  }
}
