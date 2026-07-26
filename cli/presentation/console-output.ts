import type { CliOutput } from '../ports/cli-output'

export class ConsoleOutput implements CliOutput {
  diagnostic(message: string): void {
    process.stderr.write(`${message}\n`)
  }

  error(message: string): void {
    process.stderr.write(`error: ${message}\n`)
  }

  info(message: string): void {
    process.stdout.write(`${message}\n`)
  }

  success(message: string): void {
    process.stdout.write(`✓ ${message}\n`)
  }
}
