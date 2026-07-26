import type { CommandRunner } from '../ports/command-runner'
import type { ServiceManager } from '../ports/service-manager'

const unitName = 'bitveins.service'

export function resolveSystemdUserEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  uid = process.getuid?.(),
): NodeJS.ProcessEnv {
  if (uid === undefined || uid < 0) {
    return environment
  }

  const runtimeDirectory = environment.XDG_RUNTIME_DIR || `/run/user/${uid}`
  return {
    ...environment,
    DBUS_SESSION_BUS_ADDRESS: environment.DBUS_SESSION_BUS_ADDRESS
      || `unix:path=${runtimeDirectory}/bus`,
    XDG_RUNTIME_DIR: runtimeDirectory,
  }
}

export class SystemdUserServiceManager implements ServiceManager {
  private readonly environment: NodeJS.ProcessEnv

  constructor(
    private readonly commands: CommandRunner,
    options: {
      environment?: NodeJS.ProcessEnv
      uid?: number
    } = {},
  ) {
    this.environment = resolveSystemdUserEnvironment(
      options.environment,
      options.uid,
    )
  }

  async daemonReload(): Promise<void> {
    await this.systemctl(['daemon-reload'])
  }

  async enableAndStart(): Promise<void> {
    await this.systemctl(['enable', '--now', unitName])
  }

  async disable(): Promise<void> {
    const loadState = await this.systemctl([
      'show',
      unitName,
      '--property=LoadState',
      '--value',
    ])
    if (loadState.stdout.trim() === 'not-found') {
      return
    }
    await this.systemctl(['disable', '--now', unitName])
  }

  async start(): Promise<void> {
    await this.systemctl(['start', unitName])
  }

  async stop(): Promise<void> {
    await this.systemctl(['stop', unitName])
  }

  async restart(): Promise<void> {
    await this.systemctl(['restart', unitName])
  }

  async isActive(): Promise<boolean> {
    const result = await this.systemctl(['is-active', '--quiet', unitName], true)
    if (result.exitCode === 0) {
      return true
    }
    if (result.exitCode === 3) {
      return false
    }
    throw new Error(
      `Unable to inspect ${unitName}: ${result.stderr.trim() || `exit ${result.exitCode}`}`,
    )
  }

  async status(): Promise<void> {
    await this.commands.run('systemctl', ['--user', 'status', unitName], {
      environment: this.environment,
      inherit: true,
    })
  }

  async logs(follow: boolean): Promise<void> {
    const args = ['--user-unit', unitName, '--no-pager', '-n', '100']
    if (follow) {
      args.push('--follow')
    }
    await this.commands.run('journalctl', args, {
      environment: this.environment,
      inherit: true,
    })
  }

  private async systemctl(args: string[], allowFailure = false) {
    return await this.commands.run('systemctl', ['--user', ...args], {
      allowFailure,
      environment: this.environment,
    })
  }
}
