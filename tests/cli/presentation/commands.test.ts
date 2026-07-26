import { describe, expect, it, vi } from 'vitest'
import { CliExitCode } from '../../../cli/core/cli-error'
import type { CliOutput } from '../../../cli/ports/cli-output'
import type { OperationLock } from '../../../cli/ports/operation-lock'
import type { PasswordReader } from '../../../cli/ports/password-reader'
import type { ServiceManager } from '../../../cli/ports/service-manager'
import { CommandRegistry } from '../../../cli/presentation/command-registry'
import { DoctorCommand } from '../../../cli/presentation/commands/doctor-command'
import { HelpCommand } from '../../../cli/presentation/commands/help-command'
import { InstallCommand } from '../../../cli/presentation/commands/install-command'
import { LifecycleCommand } from '../../../cli/presentation/commands/lifecycle-command'
import {
  HashPasswordCommand,
  PasswordCommand,
} from '../../../cli/presentation/commands/password-command'
import {
  LogsCommand,
  StatusCommand,
} from '../../../cli/presentation/commands/service-inspection-command'
import { UninstallCommand } from '../../../cli/presentation/commands/uninstall-command'
import { UpdateCommand } from '../../../cli/presentation/commands/update-command'
import { VersionCommand } from '../../../cli/presentation/commands/version-command'

function operationLock(): OperationLock {
  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      return await operation()
    },
  }
}

function output(): CliOutput & {
  errors: string[]
  infos: string[]
  successes: string[]
} {
  const errors: string[] = []
  const infos: string[] = []
  const successes: string[] = []
  return {
    diagnostic: vi.fn(),
    error: message => errors.push(message),
    errors,
    info: message => infos.push(message),
    infos,
    success: message => successes.push(message),
    successes,
  }
}

function service(): ServiceManager {
  return {
    daemonReload: vi.fn(),
    disable: vi.fn(),
    enableAndStart: vi.fn(),
    isActive: vi.fn().mockResolvedValue(true),
    logs: vi.fn(),
    restart: vi.fn(),
    start: vi.fn(),
    status: vi.fn(),
    stop: vi.fn(),
  }
}

describe('CLI commands', () => {
  it('maps doctor health to stable exit codes', async () => {
    await expect(new DoctorCommand({
      diagnose: async () => ({ errors: [] }),
    }).run([])).resolves.toBe(CliExitCode.Success)
    await expect(new DoctorCommand({
      diagnose: async () => ({ errors: ['broken'] }),
    }).run([])).resolves.toBe(CliExitCode.Unhealthy)
  })

  it('prints overview, targeted help and version', async () => {
    const messages = output()
    const registry = new CommandRegistry()
    const version = new VersionCommand(messages, '1.2.3')
    registry.register(version)
    const help = new HelpCommand(registry, messages, '1.2.3')
    registry.register(help)

    await help.run([])
    await help.run(['version'])
    await version.run([])

    expect(messages.infos[0]).toContain('Bitveins 1.2.3')
    expect(messages.infos[1]).toContain('Print the installed')
    expect(messages.infos[2]).toBe('1.2.3')
  })

  it('parses installation options and executes under the lock', async () => {
    const passwordReader = { readNewPassword: vi.fn() }
    const install = vi.fn()
    const createPasswordReader = vi.fn(() => passwordReader)
    const command = new InstallCommand({
      createInstaller: () => ({ install }),
      createPasswordReader,
      lock: operationLock(),
      releaseRoot: '/release',
    })

    await expect(command.run([
      '--port',
      '4567',
      '--origin',
      'https://bitveins.example',
      '--password-file',
      '/private/password',
    ])).resolves.toBe(CliExitCode.Success)

    expect(createPasswordReader).toHaveBeenCalledWith('/private/password')
    expect(install).toHaveBeenCalledWith({
      allowedOrigin: 'https://bitveins.example',
      port: 4567,
      releaseRoot: '/release',
    })
    await command.run([])
    expect(install).toHaveBeenLastCalledWith({
      allowedOrigin: undefined,
      port: 3000,
      releaseRoot: '/release',
    })
    await expect(command.run(['--port', 'invalid'])).rejects.toThrow(
      /must be an integer/,
    )
  })

  it('starts, restarts and stops the service with appropriate health checks', async () => {
    const manager = service()
    const messages = output()
    const healthCheck = vi.fn()
    const dependencies = {
      configuredPort: async () => 4567,
      healthCheck,
      lock: operationLock(),
      output: messages,
      service: manager,
    }

    for (const action of ['start', 'restart', 'stop'] as const) {
      await expect(new LifecycleCommand(
        action,
        dependencies,
      ).run([])).resolves.toBe(CliExitCode.Success)
    }

    expect(manager.start).toHaveBeenCalledOnce()
    expect(manager.restart).toHaveBeenCalledOnce()
    expect(manager.stop).toHaveBeenCalledOnce()
    expect(healthCheck).toHaveBeenCalledTimes(2)
    expect(messages.successes.at(-1)).toContain('tmux sessions')
  })

  it('rotates and hashes passwords from the selected reader', async () => {
    const reader: PasswordReader = {
      readNewPassword: vi.fn().mockResolvedValue('secret'),
    }
    const rotate = vi.fn()
    const createReader = vi.fn(() => reader)
    const messages = output()

    await new PasswordCommand({
      createManager: () => ({ rotate }),
      createPasswordReader: createReader,
      lock: operationLock(),
    }).run(['--password-file', '/private/password'])
    await new HashPasswordCommand({
      createPasswordReader: createReader,
      hashPassword: async password => `hash:${password}`,
      output: messages,
    }).run([])

    expect(rotate).toHaveBeenCalledOnce()
    expect(createReader).toHaveBeenCalledWith('/private/password')
    expect(messages.infos).toContain('hash:secret')
  })

  it('delegates status, logs and updates', async () => {
    const manager = service()
    const update = vi.fn()

    await new StatusCommand(manager).run([])
    await new LogsCommand(manager).run([])
    await new LogsCommand(manager).run(['--follow'])
    await new UpdateCommand({ update }, operationLock()).run([
      '--version',
      '1.2.3',
    ])

    expect(manager.status).toHaveBeenCalledOnce()
    expect(manager.logs).toHaveBeenNthCalledWith(1, false)
    expect(manager.logs).toHaveBeenNthCalledWith(2, true)
    expect(update).toHaveBeenCalledWith('1.2.3')
  })

  it('preserves data by default and confirms destructive purge', async () => {
    const uninstall = vi.fn()
    const confirmPurge = vi.fn().mockResolvedValue(true)
    const command = new UninstallCommand({
      confirmPurge,
      lock: operationLock(),
      uninstaller: { uninstall },
    })

    await command.run([])
    await command.run(['--purge'])
    expect(uninstall).toHaveBeenNthCalledWith(1, false)
    expect(uninstall).toHaveBeenNthCalledWith(2, true)
    expect(confirmPurge).toHaveBeenCalledOnce()

    const cancelled = new UninstallCommand({
      confirmPurge: async () => false,
      lock: operationLock(),
      uninstaller: { uninstall },
    })
    await expect(cancelled.run(['--purge'])).rejects.toThrow(/cancelled/)
  })
})
