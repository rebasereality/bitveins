import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { spawn } from 'node:child_process'
import { CliServiceError } from '../core/cli-error'
import type {
  CommandResult,
  CommandRunner,
  RunCommandOptions,
} from '../ports/command-runner'

export class CommandExecutionError extends CliServiceError {
  constructor(
    command: string,
    readonly commandExitCode: number | null,
    readonly stderr: string,
    readonly commandSignal: NodeJS.Signals | null = null,
  ) {
    const termination = commandSignal
      ? ` after signal ${commandSignal}`
      : commandExitCode === null
        ? ''
        : ` with exit code ${commandExitCode}`
    super(
      `${command} failed${termination}.`,
      {
        details: stderr.trim() ? [stderr.trim()] : [],
        hint: 'Run the command again with --verbose if more context is needed.',
      },
    )
    this.name = 'CommandExecutionError'
  }
}

export class NodeCommandRunner implements CommandRunner {
  constructor(private readonly path = process.env.PATH || '') {}

  async run(
    command: string,
    args: readonly string[] = [],
    options: RunCommandOptions = {},
  ): Promise<CommandResult> {
    return await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.environment
          ? { ...process.env, ...options.environment }
          : undefined,
        shell: false,
        stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8').on('data', chunk => (stdout += chunk))
      child.stderr?.setEncoding('utf8').on('data', chunk => (stderr += chunk))
      child.once('error', (error) => {
        reject(new CommandExecutionError(command, null, error.message))
      })
      child.once('close', (exitCode, signal) => {
        if (exitCode !== 0 && !options.allowFailure) {
          reject(new CommandExecutionError(
            `${command} ${args.join(' ')}`.trim(),
            exitCode,
            stderr,
            signal,
          ))
          return
        }
        resolve({ exitCode, stderr, stdout })
      })
    })
  }

  async which(command: string): Promise<string | null> {
    for (const directory of this.path.split(delimiter).filter(Boolean)) {
      const candidate = join(directory, command)
      try {
        await access(candidate, constants.X_OK)
        return candidate
      }
      catch {
        // Continue looking through PATH.
      }
    }

    return null
  }
}
