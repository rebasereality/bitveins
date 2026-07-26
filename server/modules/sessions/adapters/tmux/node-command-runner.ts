import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CommandResult, CommandRunner, CommandRunOptions } from './command-runner'

const execFileAsync = promisify(execFile)

export class NodeCommandRunner implements CommandRunner {
  async run(command: string, args: readonly string[], options: CommandRunOptions = {}): Promise<CommandResult> {
    const { stderr, stdout } = await execFileAsync(command, [...args], {
      encoding: 'utf8',
      maxBuffer: options.maxBuffer,
      timeout: options.timeoutMs,
    })

    return { stderr, stdout }
  }
}
