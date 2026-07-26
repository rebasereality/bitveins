import { CliExitCode } from '../../core/cli-error'
import type { CliOutput } from '../../ports/cli-output'
import type { OperationLock } from '../../ports/operation-lock'
import type { ServiceManager } from '../../ports/service-manager'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

type LifecycleAction = 'restart' | 'start' | 'stop'

export class LifecycleCommand implements CliCommand {
  readonly description: string
  readonly name: LifecycleAction
  readonly usage: string

  constructor(
    private readonly action: LifecycleAction,
    private readonly dependencies: {
      configuredPort(): Promise<number>
      healthCheck(port: number): Promise<void>
      lock: OperationLock
      output: CliOutput
      service: ServiceManager
    },
  ) {
    this.name = action
    this.usage = `bitveins ${action}`
    this.description = `${action[0]!.toUpperCase()}${action.slice(1)} the Bitveins service.`
  }

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    parser.done()

    await this.dependencies.lock.run(async () => {
      await this.dependencies.service[this.action]()
      if (this.action !== 'stop') {
        await this.dependencies.healthCheck(
          await this.dependencies.configuredPort(),
        )
      }
    })

    if (this.action === 'stop') {
      this.dependencies.output.success(
        'Bitveins stopped. Existing tmux sessions were left running.',
      )
      return CliExitCode.Success
    }
    this.dependencies.output.success(`Bitveins ${this.action}ed.`)
    return CliExitCode.Success
  }
}
