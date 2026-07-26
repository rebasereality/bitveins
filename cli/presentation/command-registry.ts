import { CliUsageError } from '../core/cli-error'
import type { CliCommand } from './cli-command'

export class CommandRegistry {
  private readonly commands = new Map<string, CliCommand>()
  private readonly primaryCommands: CliCommand[] = []

  register(command: CliCommand): void {
    const names = [command.name, ...(command.aliases ?? [])]
    for (const name of names) {
      if (this.commands.has(name)) {
        throw new Error(`Duplicate CLI command or alias: ${name}`)
      }
    }
    this.primaryCommands.push(command)
    for (const name of names) {
      this.commands.set(name, command)
    }
  }

  resolve(name: string): CliCommand {
    const command = this.commands.get(name)
    if (!command) {
      throw new CliUsageError(`Unknown Bitveins command: ${name}`, {
        hint: 'Run bitveins help to list the available commands.',
      })
    }
    return command
  }

  overview(version: string): string {
    const usages = this.primaryCommands
      .filter(command => !['help', 'version'].includes(command.name))
      .map(command => `  ${command.usage}`)
      .join('\n')

    return `Bitveins ${version}

Usage:
${usages}
  bitveins version
  bitveins help [command]

Global options:
  --verbose  Print detailed diagnostics after an error.

Bitveins always binds to 127.0.0.1. Run installation commands as the Unix user
who owns the tmux sessions, never as root.`
  }

  commandHelp(command: CliCommand): string {
    const details = command.usageDetails?.length
      ? `\n\nOptions:\n${command.usageDetails.map(line => `  ${line}`).join('\n')}`
      : ''
    return `${command.description}

Usage:
  ${command.usage}${details}`
  }
}
