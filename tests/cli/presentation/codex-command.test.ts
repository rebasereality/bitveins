import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { CliExitCode } from '../../../cli/core/cli-error'
import type { CliOutput } from '../../../cli/ports/cli-output'
import { CodexCommand } from '../../../cli/presentation/commands/codex-command'

function output(): CliOutput {
  return {
    diagnostic: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
}

describe('CodexCommand', () => {
  it('installs the plugin and explains the trust boundary', async () => {
    const messages = output()
    const install = vi.fn().mockResolvedValue(
      '/home/user/.local/share/bitveins/codex-marketplace/plugins/bitveins-notifications',
    )
    const command = new CodexCommand({ install }, messages)

    await expect(command.run(['install'])).resolves.toBe(CliExitCode.Success)

    expect(install).toHaveBeenCalledOnce()
    expect(messages.success).toHaveBeenCalledWith(
      'Installed the Codex notification plugin in /home/user/.local/share/bitveins/codex-marketplace/plugins/bitveins-notifications.',
    )
    expect(messages.info).toHaveBeenCalledWith(
      'Start a new Codex session, open /hooks, and trust the Bitveins hook definition.',
    )
  })

  it('rejects missing, unsupported, and excess arguments', async () => {
    const command = new CodexCommand({ install: vi.fn() }, output())

    await expect(command.run([])).rejects.toThrow(/action is required/)
    await expect(command.run(['remove'])).rejects.toThrow(/Unsupported Codex action/)
    await expect(command.run(['install', 'extra'])).rejects.toThrow(/Unexpected argument/)
  })
})
