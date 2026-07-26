export interface CommandResult {
  exitCode: number | null
  stderr: string
  stdout: string
}

export interface RunCommandOptions {
  allowFailure?: boolean
  cwd?: string
  environment?: NodeJS.ProcessEnv
  inherit?: boolean
}

export interface CommandRunner {
  run(command: string, args?: readonly string[], options?: RunCommandOptions): Promise<CommandResult>
  which(command: string): Promise<string | null>
}
