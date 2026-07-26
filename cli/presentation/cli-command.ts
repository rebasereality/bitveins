import type { CliExitCode } from '../core/cli-error'

export interface CliCommand {
  readonly aliases?: readonly string[]
  readonly description: string
  readonly name: string
  readonly usage: string
  readonly usageDetails?: readonly string[]
  run(args: readonly string[]): Promise<CliExitCode>
}
