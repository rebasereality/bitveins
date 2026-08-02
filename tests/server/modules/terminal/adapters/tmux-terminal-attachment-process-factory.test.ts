import { describe, expect, it, vi } from 'vitest'
import { TmuxTerminalAttachmentProcessFactory } from '../../../../../server/modules/terminal/adapters/tmux-terminal-attachment-process-factory'
import type {
  PtyFactory,
  PtyProcess,
  PtySpawnOptions,
} from '../../../../../server/modules/terminal/ports/pty-factory'

class RecordingPtyFactory implements PtyFactory {
  readonly spawn = vi.fn((
    _command: string,
    _args: readonly string[],
    _options: PtySpawnOptions,
  ): PtyProcess => ({
    kill: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    resize: vi.fn(),
    write: vi.fn(),
  }))
}

describe('TmuxTerminalAttachmentProcessFactory', () => {
  it('attaches through the configured isolated tmux socket', () => {
    const ptyFactory = new RecordingPtyFactory()
    const factory = new TmuxTerminalAttachmentProcessFactory({
      cwd: '/workspace',
      env: {
        PATH: '/usr/bin',
        TMUX: '/tmp/tmux-parent,1,0',
        TMUX_PANE: '%4',
      },
      ptyFactory,
      socketName: 'bitveins-test',
    })

    factory.attach('main', { cols: 120, rows: 40 })

    expect(ptyFactory.spawn).toHaveBeenCalledWith(
      'tmux',
      [
        '-L',
        'bitveins-test',
        'attach-session',
        '-t',
        'main',
      ],
      {
        cols: 120,
        cwd: '/workspace',
        env: {
          PATH: '/usr/bin',
          TERM: 'xterm-256color',
        },
        name: 'xterm-256color',
        rows: 40,
      },
    )
  })

  it('uses the default tmux socket when no override is configured', () => {
    const ptyFactory = new RecordingPtyFactory()
    const factory = new TmuxTerminalAttachmentProcessFactory({
      cwd: '/workspace',
      env: {},
      ptyFactory,
    })

    factory.attach('main', { cols: 80, rows: 24 })

    expect(ptyFactory.spawn.mock.calls[0]?.[1]).toEqual([
      'attach-session',
      '-t',
      'main',
    ])
  })
})
