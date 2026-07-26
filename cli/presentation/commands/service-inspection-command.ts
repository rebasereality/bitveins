import { CliExitCode } from '../../core/cli-error'
import type { ServiceManager } from '../../ports/service-manager'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

export class StatusCommand implements CliCommand {
  readonly description = 'Show the systemd user service status.'
  readonly name = 'status'
  readonly usage = 'bitveins status'

  constructor(private readonly service: ServiceManager) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    parser.done()
    await this.service.status()
    return CliExitCode.Success
  }
}

export class LogsCommand implements CliCommand {
  readonly description = 'Show recent Bitveins service logs.'
  readonly name = 'logs'
  readonly usage = 'bitveins logs [--follow]'
  readonly usageDetails = [
    '--follow  Continue streaming new log entries.',
  ]

  constructor(private readonly service: ServiceManager) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const follow = parser.flag('--follow')
    parser.done()
    await this.service.logs(follow)
    return CliExitCode.Success
  }
}
