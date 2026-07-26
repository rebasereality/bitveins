export interface CommandRunOptions {
  maxBuffer?: number
  timeoutMs?: number
}

export interface CommandResult {
  stderr: string
  stdout: string
}

export interface CommandRunner {
  run(command: string, args: readonly string[], options?: CommandRunOptions): Promise<CommandResult>
}
