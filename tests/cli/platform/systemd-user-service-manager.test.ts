import { describe, expect, it } from 'vitest'
import {
  resolveSystemdUserEnvironment,
  SystemdUserServiceManager,
} from '../../../cli/platform/systemd-user-service-manager'
import type {
  CommandResult,
  CommandRunner,
  RunCommandOptions,
} from '../../../cli/ports/command-runner'

class RecordingCommandRunner implements CommandRunner {
  readonly calls: Array<{
    args: readonly string[]
    command: string
    options: RunCommandOptions
  }> = []

  constructor(private readonly results: CommandResult[] = []) {}

  async run(
    command: string,
    args: readonly string[] = [],
    options: RunCommandOptions = {},
  ): Promise<CommandResult> {
    this.calls.push({ args, command, options })
    return this.results.shift() || { exitCode: 0, stderr: '', stdout: '' }
  }

  async which(command: string): Promise<string> {
    return `/usr/bin/${command}`
  }
}

describe('SystemdUserServiceManager', () => {
  it('derives the standard user bus when a tmux shell lacks D-Bus variables', async () => {
    const commands = new RecordingCommandRunner()
    const service = new SystemdUserServiceManager(commands, {
      environment: { PATH: '/usr/bin' },
      uid: 1000,
    })

    await service.start()

    expect(commands.calls[0]?.options.environment).toMatchObject({
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      XDG_RUNTIME_DIR: '/run/user/1000',
    })
  })

  it('preserves an explicitly configured user bus', () => {
    expect(resolveSystemdUserEnvironment({
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/custom/bus',
      XDG_RUNTIME_DIR: '/custom/runtime',
    }, 1000)).toMatchObject({
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/custom/bus',
      XDG_RUNTIME_DIR: '/custom/runtime',
    })
    const environment = { PATH: '/usr/bin' }
    expect(resolveSystemdUserEnvironment(environment, -1)).toBe(
      environment,
    )
  })

  it('delegates every lifecycle and inspection operation with user scope', async () => {
    const commands = new RecordingCommandRunner()
    const service = new SystemdUserServiceManager(commands, {
      environment: {},
      uid: 1000,
    })

    await service.daemonReload()
    await service.enableAndStart()
    await service.start()
    await service.stop()
    await service.restart()
    await expect(service.isActive()).resolves.toBe(true)
    await service.status()
    await service.logs(false)
    await service.logs(true)

    expect(commands.calls.map(call => [call.command, ...call.args])).toEqual([
      ['systemctl', '--user', 'daemon-reload'],
      ['systemctl', '--user', 'enable', '--now', 'bitveins.service'],
      ['systemctl', '--user', 'start', 'bitveins.service'],
      ['systemctl', '--user', 'stop', 'bitveins.service'],
      ['systemctl', '--user', 'restart', 'bitveins.service'],
      ['systemctl', '--user', 'is-active', '--quiet', 'bitveins.service'],
      ['systemctl', '--user', 'status', 'bitveins.service'],
      [
        'journalctl',
        '--user-unit',
        'bitveins.service',
        '--no-pager',
        '-n',
        '100',
      ],
      [
        'journalctl',
        '--user-unit',
        'bitveins.service',
        '--no-pager',
        '-n',
        '100',
        '--follow',
      ],
    ])
  })

  it('distinguishes an inactive unit from a broken user bus', async () => {
    const inactive = new SystemdUserServiceManager(
      new RecordingCommandRunner([{ exitCode: 3, stderr: '', stdout: '' }]),
      { environment: {}, uid: 1000 },
    )
    await expect(inactive.isActive()).resolves.toBe(false)

    const unavailable = new SystemdUserServiceManager(
      new RecordingCommandRunner([{
        exitCode: 1,
        stderr: 'Failed to connect to bus',
        stdout: '',
      }]),
      { environment: {}, uid: 1000 },
    )
    await expect(unavailable.isActive()).rejects.toThrow(/Failed to connect to bus/)
  })

  it('makes disable idempotent without hiding transport failures', async () => {
    const missingCommands = new RecordingCommandRunner([{
      exitCode: 0,
      stderr: '',
      stdout: 'not-found\n',
    }])
    await new SystemdUserServiceManager(
      missingCommands,
      { environment: {}, uid: 1000 },
    ).disable()
    expect(missingCommands.calls).toHaveLength(1)

    const loadedCommands = new RecordingCommandRunner([
      { exitCode: 0, stderr: '', stdout: 'loaded\n' },
      { exitCode: 0, stderr: '', stdout: '' },
    ])
    await new SystemdUserServiceManager(
      loadedCommands,
      { environment: {}, uid: 1000 },
    ).disable()
    expect(loadedCommands.calls[1]?.args).toContain('disable')
  })
})
