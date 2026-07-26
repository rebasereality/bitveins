import type {
  CommandResult,
  CommandRunner,
  RunCommandOptions,
} from '../../../cli/ports/command-runner'
import type { ServiceManager } from '../../../cli/ports/service-manager'
import type { CliOutput } from '../../../cli/ports/cli-output'
import type {
  HealthProbe,
  HealthProbeOptions,
} from '../../../cli/ports/health-probe'
import type {
  HostInspector,
  HostRuntime,
} from '../../../cli/ports/host-inspector'

export class RecordingCliOutput implements CliOutput {
  readonly errors: string[] = []
  readonly infos: string[] = []
  readonly successes: string[] = []
  readonly diagnostics: string[] = []

  diagnostic(message: string): void {
    this.diagnostics.push(message)
  }

  error(message: string): void {
    this.errors.push(message)
  }

  info(message: string): void {
    this.infos.push(message)
  }

  success(message: string): void {
    this.successes.push(message)
  }
}

export class FakeCommandRunner implements CommandRunner {
  readonly calls: Array<{
    args: readonly string[]
    command: string
    options: RunCommandOptions
  }> = []

  constructor(
    private readonly availableCommands: ReadonlySet<string>,
    private readonly results: ReadonlyMap<string, CommandResult> = new Map(),
  ) {}

  async run(
    command: string,
    args: readonly string[] = [],
    options: RunCommandOptions = {},
  ): Promise<CommandResult> {
    this.calls.push({ args, command, options })
    return this.results.get(this.key(command, args)) ?? {
      exitCode: 0,
      stderr: '',
      stdout: '',
    }
  }

  async which(command: string): Promise<string | null> {
    return this.availableCommands.has(command) ? `/usr/bin/${command}` : null
  }

  private key(command: string, args: readonly string[]): string {
    return [command, ...args].join('\u0000')
  }
}

export class FakeServiceManager implements ServiceManager {
  active = true
  readonly calls: string[] = []

  async daemonReload(): Promise<void> {
    this.calls.push('daemonReload')
  }

  async disable(): Promise<void> {
    this.calls.push('disable')
  }

  async enableAndStart(): Promise<void> {
    this.calls.push('enableAndStart')
  }

  async isActive(): Promise<boolean> {
    this.calls.push('isActive')
    return this.active
  }

  async logs(follow: boolean): Promise<void> {
    this.calls.push(`logs:${follow}`)
  }

  async restart(): Promise<void> {
    this.calls.push('restart')
  }

  async start(): Promise<void> {
    this.calls.push('start')
  }

  async status(): Promise<void> {
    this.calls.push('status')
  }

  async stop(): Promise<void> {
    this.calls.push('stop')
  }
}

export class FakeHealthProbe implements HealthProbe {
  readonly calls: Array<{ options: HealthProbeOptions, port: number }> = []
  readonly outcomes: Array<Error | null> = []

  async waitUntilHealthy(
    port: number,
    options: HealthProbeOptions = {},
  ): Promise<void> {
    this.calls.push({ options, port })
    const outcome = this.outcomes.shift()
    if (outcome) {
      throw outcome
    }
  }
}

export class FakeHostInspector implements HostInspector {
  addresses: readonly string[] | null = []
  bytes: number | null = 1024 * 1024 * 1024
  commands = new Set(['systemctl', 'tmux'])
  linger: boolean | null = true
  portAvailable = true
  runtimeValue: HostRuntime = {
    architecture: 'x64',
    platform: 'linux',
    uid: 1000,
  }

  async availableBytes(): Promise<number | null> {
    return this.bytes
  }

  async hasCommand(command: string): Promise<boolean> {
    return this.commands.has(command)
  }

  async lingerEnabled(): Promise<boolean | null> {
    return this.linger
  }

  async listenerAddresses(): Promise<readonly string[] | null> {
    return this.addresses
  }

  async loopbackPortAvailable(): Promise<boolean> {
    return this.portAvailable
  }

  runtime(): HostRuntime {
    return this.runtimeValue
  }
}
