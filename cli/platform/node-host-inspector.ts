import { statfs } from 'node:fs/promises'
import type { CommandRunner } from '../ports/command-runner'
import type {
  HostInspector,
  HostRuntime,
} from '../ports/host-inspector'
import { isLoopbackPortAvailable } from './port-availability'

export class NodeHostInspector implements HostInspector {
  constructor(
    private readonly commands: CommandRunner,
    private readonly environment: {
      architecture?: string
      platform?: NodeJS.Platform
      uid?: number
    } = {},
  ) {}

  async availableBytes(path: string): Promise<number | null> {
    try {
      const disk = await statfs(path)
      return disk.bavail * disk.bsize
    }
    catch {
      return null
    }
  }

  async hasCommand(command: string): Promise<boolean> {
    return Boolean(await this.commands.which(command))
  }

  async lingerEnabled(): Promise<boolean | null> {
    const loginctl = await this.commands.which('loginctl')
    if (!loginctl || !process.getuid) {
      return null
    }
    const result = await this.commands.run(
      loginctl,
      ['show-user', String(this.runtime().uid), '--property=Linger', '--value'],
      { allowFailure: true },
    )
    return result.stdout.trim() === 'yes'
  }

  async listenerAddresses(port: number): Promise<readonly string[] | null> {
    const ss = await this.commands.which('ss')
    if (!ss) {
      return null
    }
    const listeners = await this.commands.run(
      ss,
      ['-ltnH', 'sport', '=', `:${port}`],
      { allowFailure: true },
    )
    return listeners.stdout
      .split('\n')
      .map(line => line.trim().split(/\s+/u)[3])
      .filter((value): value is string => Boolean(value))
  }

  async loopbackPortAvailable(port: number): Promise<boolean> {
    return await isLoopbackPortAvailable(port)
  }

  runtime(): HostRuntime {
    return {
      architecture: this.environment.architecture ?? process.arch,
      platform: this.environment.platform ?? process.platform,
      uid: this.environment.uid ?? process.getuid?.() ?? -1,
    }
  }
}
