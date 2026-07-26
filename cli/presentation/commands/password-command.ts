import { CliExitCode } from '../../core/cli-error'
import type { CliOutput } from '../../ports/cli-output'
import type { OperationLock } from '../../ports/operation-lock'
import type { PasswordReader } from '../../ports/password-reader'
import type { CliCommand } from '../cli-command'
import { CommandArguments } from '../command-parser'

interface PasswordManager {
  rotate(): Promise<void>
}

export class PasswordCommand implements CliCommand {
  readonly description = 'Change the Bitveins password and revoke existing sessions.'
  readonly name = 'password'
  readonly usage = 'bitveins password [--password-file <path>]'
  readonly usageDetails = [
    '--password-file <path>  Read the new password from a private file.',
  ]

  constructor(private readonly dependencies: {
    createManager(passwordReader: PasswordReader): PasswordManager
    createPasswordReader(passwordFile?: string): PasswordReader
    lock: OperationLock
  }) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const reader = this.dependencies.createPasswordReader(
      parser.value('--password-file'),
    )
    parser.done()
    await this.dependencies.lock.run(async () => {
      await this.dependencies.createManager(reader).rotate()
    })
    return CliExitCode.Success
  }
}

export class HashPasswordCommand implements CliCommand {
  readonly description = 'Generate a Bitveins password hash for advanced setup.'
  readonly name = 'hash-password'
  readonly usage = 'bitveins hash-password [--password-file <path>]'
  readonly usageDetails = [
    '--password-file <path>  Read the password from a private file.',
  ]

  constructor(private readonly dependencies: {
    createPasswordReader(passwordFile?: string): PasswordReader
    hashPassword(password: string): Promise<string>
    output: CliOutput
  }) {}

  async run(args: readonly string[]): Promise<CliExitCode> {
    const parser = new CommandArguments(args)
    const reader = this.dependencies.createPasswordReader(
      parser.value('--password-file'),
    )
    parser.done()
    this.dependencies.output.info(
      await this.dependencies.hashPassword(await reader.readNewPassword()),
    )
    return CliExitCode.Success
  }
}
