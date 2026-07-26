import { CliExitCode } from '../../core/cli-error'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

interface Doctor {
  diagnose(): Promise<{ errors: readonly string[] }>
}

export class DoctorCommand implements CliCommand {
  readonly description = 'Inspect the native Bitveins installation.'
  readonly name = 'doctor'
  readonly usage = 'bitveins doctor'

  constructor(private readonly doctor: Doctor) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    parser.done()
    const report = await this.doctor.diagnose()
    return report.errors.length > 0
      ? CliExitCode.Unhealthy
      : CliExitCode.Success
  }
}
