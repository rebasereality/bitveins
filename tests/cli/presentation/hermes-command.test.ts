import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { CliExitCode } from '../../../cli/core/cli-error'
import type { CliOutput } from '../../../cli/ports/cli-output'
import { HermesCommand } from '../../../cli/presentation/commands/hermes-command'

function output(): CliOutput {
  return {
    diagnostic: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
}

describe('HermesCommand', () => {
  it('installs the integration and explains runtime activation', async () => {
    const messages = output()
    const install = vi.fn().mockResolvedValue(
      '/home/user/.hermes/plugins/bitveins-notifications',
    )
    const command = new HermesCommand({ install }, messages)

    await expect(command.run(['install'])).resolves.toBe(CliExitCode.Success)

    expect(install).toHaveBeenCalledWith('default')
    expect(messages.success).toHaveBeenCalledWith(
      'Installed the Hermes notification plugin in /home/user/.hermes/plugins/bitveins-notifications.',
    )
    expect(messages.info).toHaveBeenCalledWith(
      'Restart Hermes Gateway and open a new CLI session to load the plugin.',
    )
  })

  it('rejects missing or unsupported actions', async () => {
    const command = new HermesCommand({ install: vi.fn() }, output())

    await expect(command.run([])).rejects.toThrow(/action is required/)
    await expect(command.run(['remove'])).rejects.toThrow(/Unsupported Hermes action/)
  })

  it('installs into an explicitly selected Hermes profile', async () => {
    const install = vi.fn().mockResolvedValue(
      '/home/user/.hermes/profiles/ops/plugins/bitveins-notifications',
    )
    const command = new HermesCommand({ install }, output())

    await command.run(['install', '--profile', 'ops'])

    expect(install).toHaveBeenCalledWith('ops')
    await expect(command.run([
      'install', '--profile', '../escape',
    ])).rejects.toThrow(/profile name/)
  })
})
