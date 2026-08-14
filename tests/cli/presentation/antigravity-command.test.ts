import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { CliExitCode } from '../../../cli/core/cli-error'
import type { CliOutput } from '../../../cli/ports/cli-output'
import { AntigravityCommand } from '../../../cli/presentation/commands/antigravity-command'

function output(): CliOutput {
  return {
    diagnostic: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
}

describe('AntigravityCommand', () => {
  it('installs the integration and explains runtime activation', async () => {
    const messages = output()
    const install = vi.fn().mockResolvedValue({
      hooksPath: '/home/user/.gemini/config/hooks.json',
      scriptPath: '/home/user/.config/bitveins/antigravity/bitveins_antigravity_notifications.py',
    })
    const command = new AntigravityCommand({ install }, messages)

    await expect(command.run(['install'])).resolves.toBe(CliExitCode.Success)

    expect(install).toHaveBeenCalled()
    expect(messages.success).toHaveBeenCalledWith(
      'Installed Antigravity notification hooks in /home/user/.gemini/config/hooks.json.',
    )
    expect(messages.info).toHaveBeenCalledWith(
      'Antigravity sessions will automatically emit attention events to Bitveins.',
    )
  })

  it('rejects missing or unsupported actions', async () => {
    const command = new AntigravityCommand({ install: vi.fn() }, output())

    await expect(command.run([])).rejects.toThrow(/action is required/)
    await expect(command.run(['remove'])).rejects.toThrow(/Unsupported Antigravity action/)
  })
})
