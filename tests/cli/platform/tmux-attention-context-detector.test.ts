import { describe, expect, it, vi } from 'vitest'
import { TmuxAttentionContextDetector } from '../../../cli/platform/tmux-attention-context-detector'
import type { CommandRunner } from '../../../cli/ports/command-runner'

function runner(stdout: string, exitCode = 0): CommandRunner {
  return {
    run: vi.fn().mockResolvedValue({ exitCode, stderr: '', stdout }),
    which: vi.fn(),
  }
}

describe('TmuxAttentionContextDetector', () => {
  it('detects stable session, window and pane identifiers from TMUX_PANE', async () => {
    const commands = runner('kouizine\t\t@4\t%9\t/home/alice/code/kouizine\n')
    const detector = new TmuxAttentionContextDetector(commands)

    await expect(detector.detect({ TMUX_PANE: '%9' })).resolves.toEqual({
      paneId: '%9',
      project: 'kouizine',
      sessionName: 'kouizine',
      windowId: '@4',
    })
    expect(commands.run).toHaveBeenCalledWith('tmux', [
      'display-message',
      '-p',
      '-t',
      '%9',
      '#{session_name}\t#{@bitveins_base}\t#{window_id}\t#{pane_id}\t#{pane_current_path}',
    ], { allowFailure: true })
  })

  it('returns no context outside tmux or when detection fails', async () => {
    const commands = runner('', 1)
    const detector = new TmuxAttentionContextDetector(commands)
    await expect(detector.detect({})).resolves.toEqual({})
    await expect(detector.detect({ TMUX_PANE: '%2' })).resolves.toEqual({})
  })

  it('maps a Bitveins helper session back to its base session', async () => {
    const commands = runner('_bitveins_123\tkouizine\t@4\t%9\t/home/alice/code/kouizine\n')
    const detector = new TmuxAttentionContextDetector(commands)

    await expect(detector.detect({ TMUX_PANE: '%9' })).resolves.toEqual({
      paneId: '%9',
      project: 'kouizine',
      sessionName: 'kouizine',
      windowId: '@4',
    })
  })
})
