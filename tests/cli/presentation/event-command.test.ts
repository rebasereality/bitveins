import { describe, expect, it, vi } from 'vitest'
import { EventCommand } from '../../../cli/presentation/commands/event-command'
import type { CliOutput } from '../../../cli/ports/cli-output'

function output(): CliOutput {
  return {
    diagnostic: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
}

describe('EventCommand', () => {
  it('validates, merges detected context and prints the created id', async () => {
    const messages = output()
    const create = vi.fn().mockResolvedValue('evt_123456789012')
    const command = new EventCommand({
      create,
      detectContext: vi.fn().mockResolvedValue({
        paneId: '%9',
        project: 'detected-project',
        sessionName: 'detected-session',
        windowId: '@4',
      }),
      environment: { TMUX_PANE: '%9' },
      output: messages,
    })

    await command.run([
      'permission_required',
      '--source', 'codex',
      '--title', 'Permission required',
      '--summary', 'Run migrations?',
      '--project', 'explicit-project',
      '--window', '@8',
    ])

    expect(create).toHaveBeenCalledWith({
      paneId: '%9',
      project: 'explicit-project',
      sessionName: 'detected-session',
      source: 'codex',
      summary: 'Run migrations?',
      title: 'Permission required',
      type: 'permission_required',
      windowId: '@8',
    })
    expect(messages.success).toHaveBeenCalledWith('Created evt_123456789012')
  })

  it('rejects missing required flags and invalid types before sending', async () => {
    const create = vi.fn()
    const command = new EventCommand({
      create,
      detectContext: vi.fn().mockResolvedValue({}),
      environment: {},
      output: output(),
    })

    await expect(command.run(['--source', 'shell'])).rejects.toThrow(/type/)
    await expect(command.run([
      '--type', 'unknown', '--source', 'shell', '--title', 'Done',
    ])).rejects.toThrow(/Invalid/)
    expect(create).not.toHaveBeenCalled()
  })
})
