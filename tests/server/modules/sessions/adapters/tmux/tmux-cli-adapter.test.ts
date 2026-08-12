import { describe, expect, it } from 'vitest'
import { TmuxCliAdapter } from '../../../../../../server/modules/sessions/adapters/tmux/tmux-cli-adapter'
import type {
  CommandResult,
  CommandRunner,
  CommandRunOptions,
} from '../../../../../../server/modules/sessions/adapters/tmux/command-runner'

interface CommandCall {
  args: readonly string[]
  command: string
  options?: CommandRunOptions
}

class FakeCommandRunner implements CommandRunner {
  readonly calls: CommandCall[] = []
  handler: (call: CommandCall) => Promise<CommandResult> = async () => ({
    stderr: '',
    stdout: '',
  })

  async run(command: string, args: readonly string[], options?: CommandRunOptions): Promise<CommandResult> {
    const call = { args, command, options }
    this.calls.push(call)
    return this.handler(call)
  }
}

function setup(options: { socketName?: string } = {}) {
  const runner = new FakeCommandRunner()
  const adapter = new TmuxCliAdapter({
    clock: () => 1234,
    helperOwner: 'owner-1',
    randomId: () => 'random',
    runner,
    socketName: options.socketName,
  })
  return { adapter, runner }
}

describe('TmuxCliAdapter', () => {
  it('resolves a window to its unique non-helper session', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => ({
      stderr: '',
      stdout: [
        'Bitveins|@2709',
        '_bitveins_helper|@2709',
        'Other|@42',
      ].join('\n'),
    })

    await expect(adapter.findSessionNameByWindowId('@2709')).resolves.toBe('Bitveins')
    expect(runner.calls[0]).toMatchObject({
      args: ['list-windows', '-a', '-F', '#{session_name}|#{window_id}'],
      command: 'tmux',
    })
  })

  it('does not guess when a window belongs to multiple user sessions', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => ({
      stderr: '',
      stdout: 'Bitveins|@2709\nShared|@2709\n_bitveins_helper|@2709\n',
    })

    await expect(adapter.findSessionNameByWindowId('@2709')).resolves.toBeNull()
  })

  it('rejects delimiter-forged external session names instead of creating a false match', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => ({
      stderr: '',
      stdout: 'evil|@2709|@2709\n',
    })

    await expect(adapter.findSessionNameByWindowId('@2709')).resolves.toBeNull()
  })

  it('rejects invalid window ids before invoking tmux', async () => {
    const { adapter, runner } = setup()

    await expect(adapter.findSessionNameByWindowId('2709')).rejects.toThrow(
      'A valid tmux window id is required.',
    )
    expect(runner.calls).toHaveLength(0)
  })

  it('parses sessions and keeps shell metacharacters as inert arguments', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => ({
      stderr: '',
      stdout: 'main|/workspace\n_bitveins_helper|/ignored\n',
    })

    await expect(adapter.listSessions()).resolves.toEqual([{
      name: 'main',
      path: '/workspace',
    }])
    expect(runner.calls[0]).toMatchObject({
      args: ['ls', '-F', '#{session_name}|#{@bitveins_session_id}|#{session_path}'],
      command: 'tmux',
    })
    await expect(adapter.createSession('bad;name', '/tmp')).rejects.toThrow(
      'Session names may contain letters, numbers, underscores, dots, and hyphens only.',
    )
    expect(runner.calls).toHaveLength(1)
  })

  it('discovers agent processes across tmux panes and derives their visible state', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args, command }) => {
      if (command === 'ps') {
        return {
          stderr: '',
          stdout: '100 1 100 200 bash\n200 100 200 200 node /opt/tools/codex --profile lead\n',
        }
      }
      if (args[0] === 'list-panes') {
        return {
          stderr: '',
          stdout: 'main\t@7\t2\twork\t%9\t1\t100\t0\t\t/workspace\n',
        }
      }
      if (args[0] === 'display-message') return { stderr: '', stdout: '⠦ Bitveins\n' }
      if (args[0] === 'capture-pane') return { stderr: '', stdout: 'Thinking...\nEsc to interrupt\n' }
      return { stderr: '', stdout: '' }
    }

    await expect(adapter.listAgents()).resolves.toEqual([{
      defaultLabel: 'Bitveins',
      id: '%9',
      kind: 'codex',
      label: 'Bitveins',
      paneId: '%9',
      paneIndex: 1,
      path: '/workspace',
      sessionName: 'main',
      status: 'working',
      windowId: '@7',
      windowIndex: 2,
      windowName: 'work',
    }])
  })

  it('stores and clears pane-scoped agent labels', async () => {
    const { adapter, runner } = setup()

    await adapter.renameAgent('%9', ' Review agent ')
    await adapter.renameAgent('%9', null)

    expect(runner.calls.map(call => call.args)).toEqual([
      ['set-option', '-p', '-t', '%9', '@bitveins_agent_label', 'Review agent'],
      ['set-option', '-pu', '-t', '%9', '@bitveins_agent_label'],
    ])
  })

  it('prefixes every invocation with an isolated tmux socket', async () => {
    const { adapter, runner } = setup({ socketName: 'bitveins-tests' })

    await adapter.createSession('main', '/workspace')

    expect(runner.calls[0]?.args).toEqual([
      '-L',
      'bitveins-tests',
      'new-session',
      '-d',
      '-s',
      'main',
      '-c',
      '/workspace',
    ])
  })

  it('sets and clears the stable session id through a tmux user option', async () => {
    const { adapter, runner } = setup()

    await adapter.setSessionId('main', 'abcdefghijklmnop')
    await adapter.clearSessionId('main')

    expect(runner.calls.map(call => call.args)).toEqual([
      ['set-option', '-t', 'main', '@bitveins_session_id', 'abcdefghijklmnop'],
      ['set-option', '-u', '-t', 'main', '@bitveins_session_id'],
    ])
  })

  it('handles copy-mode wheels directly while forwarding application mouse input', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args }) => ({
      stderr: '',
      stdout: args[0] === 'display-message' ? '0|0\n' : '',
    })

    await expect(adapter.prepareTerminalWheel('main', 'up', 1)).resolves.toBe(true)

    expect(runner.calls.map(call => call.args)).toEqual([
      [
        'display-message',
        '-p',
        '-t',
        'main',
        '#{pane_in_mode}|#{mouse_any_flag}',
      ],
      ['copy-mode', '-eH', '-t', 'main'],
      ['send-keys', '-N', '1', '-X', '-t', 'main', 'scroll-up'],
    ])

    runner.calls.length = 0
    runner.handler = async ({ args }) => ({
      stderr: '',
      stdout: args[0] === 'display-message' ? '1|0\n' : '',
    })

    await expect(adapter.prepareTerminalWheel('main', 'down')).resolves.toBe(true)

    expect(runner.calls.at(-1)?.args).toEqual(['send-keys', '-N', '5', '-X', '-t', 'main', 'scroll-down'])

    runner.calls.length = 0
    runner.handler = async () => ({ stderr: '', stdout: '0|1\n' })

    await expect(adapter.prepareTerminalWheel('main', 'up')).resolves.toBe(false)

    expect(runner.calls).toHaveLength(1)
  })

  it('cancels copy mode before reliable terminal input', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args }) => ({
      stderr: '',
      stdout: args[0] === 'display-message' ? '1\n' : '',
    })

    await adapter.resetTerminalScroll('main')

    expect(runner.calls.map(call => call.args)).toEqual([
      ['display-message', '-p', '-t', 'main', '#{pane_in_mode}'],
      ['send-keys', '-X', '-t', 'main', 'cancel'],
    ])

    runner.calls.length = 0
    runner.handler = async () => ({ stderr: '', stdout: '0\n' })

    await adapter.resetTerminalScroll('main')

    expect(runner.calls.map(call => call.args)).toEqual([
      ['display-message', '-p', '-t', 'main', '#{pane_in_mode}'],
    ])
  })

  it('falls back to visible copy mode only when tmux does not support the hidden flag', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args }) => {
      if (args[0] === 'display-message') return { stderr: '', stdout: '0\n' }
      if (args.includes('-eH')) throw new Error('command copy-mode: unknown flag -H')
      return { stderr: '', stdout: '' }
    }

    await expect(adapter.prepareTerminalWheel('main', 'up')).resolves.toBe(true)

    expect(runner.calls.map(call => call.args)).toContainEqual(['copy-mode', '-e', '-t', 'main'])
    expect(runner.calls.at(-1)?.args).toEqual(['send-keys', '-N', '5', '-X', '-t', 'main', 'scroll-up'])
  })

  it('maps a missing tmux server to empty collections', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => {
      throw new Error('no server running on /tmp/tmux/default')
    }

    await expect(adapter.listSessions()).resolves.toEqual([])
    await expect(adapter.listWindows('main')).resolves.toEqual([])
    await expect(adapter.displaySessionPath('main')).resolves.toBeNull()
  })

  it('parses and sorts windows returned by the CLI', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ command }) => command === 'ps'
      ? {
          stderr: '',
          stdout: '101 201 bash\n201 201 hermes\n102 202 bash\n202 202 node\n',
        }
      : {
          stderr: '',
          stdout: '@2|2|logs|0|102|1|/workspace\n@1|1|editor|1|101|1|/workspace/src\n',
        }

    await expect(adapter.listWindows('main')).resolves.toEqual([
      {
        active: true,
        application: 'hermes',
        id: '@1',
        index: 1,
        name: 'editor',
        panesCount: 1,
        path: '/workspace/src',
      },
      {
        active: false,
        id: '@2',
        index: 2,
        name: 'logs',
        panesCount: 1,
        path: '/workspace',
      },
    ])
  })

  it('keeps windows available when foreground process detection fails', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ command }) => {
      if (command === 'ps') throw new Error('ps unavailable')
      return {
        stderr: '',
        stdout: '@1|1|editor|1|101|1|/workspace/src\n',
      }
    }

    await expect(adapter.listWindows('main')).resolves.toEqual([{
      active: true,
      id: '@1',
      index: 1,
      name: 'editor',
      panesCount: 1,
      path: '/workspace/src',
    }])
  })

  it('parses pane geometry and detects the foreground application per pane', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ command }) => command === 'ps'
      ? {
          stderr: '',
          stdout: '101 201 bash\n201 201 hermes\n102 202 bash\n202 202 node\n',
        }
      : {
          stderr: '',
          stdout: [
            '%2|1|0|61|0|59|40|120|40|102|/workspace/right',
            '%1|0|1|0|0|60|40|120|40|101|/workspace/left',
          ].join('\n'),
        }

    await expect(adapter.listPanes('main', 2)).resolves.toEqual([
      {
        active: true,
        application: 'hermes',
        height: 40,
        id: '%1',
        index: 0,
        left: 0,
        path: '/workspace/left',
        top: 0,
        width: 60,
        windowHeight: 40,
        windowWidth: 120,
      },
      {
        active: false,
        height: 40,
        id: '%2',
        index: 1,
        left: 61,
        path: '/workspace/right',
        top: 0,
        width: 59,
        windowHeight: 40,
        windowWidth: 120,
      },
    ])
  })

  it('captures the tmux copy-mode viewport using its native scroll position', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args }) => {
      if (args[0] === 'display-message') {
        return { stderr: '', stdout: '1|5|10|7|3|1\n' }
      }
      return { stderr: '', stdout: 'history viewport\n\n\n' }
    }

    await expect(adapter.capturePaneViewport('%7')).resolves.toEqual({
      cursorVisible: true,
      cursorX: 7,
      cursorY: 3,
      data: 'history viewport\n\n',
      inMode: true,
      scrollPosition: 5,
    })
    expect(runner.calls[1]?.args).toEqual([
      'capture-pane', '-e', '-p', '-S', '-5', '-E', '4', '-t', '%7',
    ])
  })

  it('resizes a stable pane id and returns the resulting tmux geometry', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ command, args }) => {
      if (command === 'ps') return { stderr: '', stdout: '' }
      if (args[0] === 'list-panes') {
        return { stderr: '', stdout: '%7|0|1|0|0|40|20|80|20|101|/workspace\n' }
      }
      return { stderr: '', stdout: '' }
    }

    await expect(adapter.resizePane('main', 0, '%7', 'width', 45)).resolves.toHaveLength(1)
    expect(runner.calls.map(call => call.args)).toContainEqual([
      'resize-pane', '-x', '45', '-t', '%7',
    ])
  })

  it('sends text, null bytes, and binary wheel reports to stable pane ids', async () => {
    const { adapter, runner } = setup()

    await adapter.sendPaneInput('%7', 'left\0right')
    await adapter.sendPaneInputBinary('%7', '\u001B[M`4(')

    expect(runner.calls.map(call => call.args)).toEqual([
      ['send-keys', '-t', '%7', '-l', '--', 'left'],
      ['send-keys', '-t', '%7', '-H', '00'],
      ['send-keys', '-t', '%7', '-l', '--', 'right'],
      ['send-keys', '-t', '%7', '-H', '1b', '5b', '4d', '60', '34', '28'],
    ])
  })

  it('compensates a failed helper creation using only its generated name', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args }) => {
      if (args.includes('new-session')) {
        throw new Error('cannot create helper')
      }
      return { stderr: '', stdout: '' }
    }

    await expect(adapter.createWindowClientSession('main', 1))
      .rejects.toThrow('tmux command failed.')

    const cleanup = runner.calls.at(-1)
    expect(cleanup?.args.slice(0, 2)).toEqual(['kill-session', '-t'])
    expect(cleanup?.args[2]).toMatch(/^_bitveins_\d+_ya_random$/)
  })

  it('cleans only inactive helpers belonging to the current owner', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args }) => {
      if (args[0] === 'list-sessions') {
        return {
          stderr: '',
          stdout: [
            '_bitveins_active|1|main|owner-1',
            '_bitveins_stale|1|main|owner-1',
            '_bitveins_other|1|main|owner-2',
          ].join('\n'),
        }
      }
      return { stderr: '', stdout: '' }
    }

    await adapter.killStaleBitveinsHelpers(new Set(['_bitveins_active']))

    expect(runner.calls.slice(1).map(call => call.args)).toEqual([
      ['kill-session', '-t', '_bitveins_stale'],
    ])
  })

  it('maps session and window operations to explicit CLI argument arrays', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args }) => {
      if (args[0] === 'new-window') {
        return { stderr: '', stdout: '@3|3|shell|1|/workspace\n' }
      }
      if (args[0] === 'list-windows') {
        return { stderr: '', stdout: '@3|3|logs|1|/workspace\n' }
      }
      if (args[0] === 'display-message') {
        return { stderr: '', stdout: '/workspace\n' }
      }
      return { stderr: '', stdout: '' }
    }

    await adapter.killSession('main')
    await adapter.renameSession('main', 'next')
    await adapter.selectWindow('next', '3')
    await expect(adapter.createWindow('next', '/workspace')).resolves.toMatchObject({
      id: '@3',
      index: 3,
    })
    await adapter.killWindow('next', 3)
    await expect(adapter.renameWindow('next', 3, ' logs ')).resolves.toMatchObject({
      name: 'logs',
    })
    await expect(adapter.captureWindowSnapshot('next', 3, 50_000)).resolves.toBe('')
    await expect(adapter.displaySessionPath('next')).resolves.toBe('/workspace')

    expect(runner.calls.map(call => call.args[0])).toEqual([
      'kill-session',
      'rename-session',
      'select-window',
      'new-window',
      'kill-window',
      'rename-window',
      'list-windows',
      'capture-pane',
      'display-message',
    ])
    expect(runner.calls[3]?.args).toContain('next:')
    expect(runner.calls[7]?.args).toContain('-20000')
  })

  it('reports missing window output and nullable lookup results', async () => {
    const { adapter, runner } = setup()

    await expect(adapter.createWindow('main', '/workspace'))
      .rejects.toThrow('tmux did not report the newly created window.')
    await expect(adapter.renameWindow('main', 1, 'logs')).resolves.toBeNull()
    await expect(adapter.displaySessionPath('main')).resolves.toBeNull()

    expect(runner.calls.map(call => call.args[0])).toEqual([
      'new-window',
      'rename-window',
      'list-windows',
      'display-message',
    ])
  })

  it('creates and selectively cleans helper sessions', async () => {
    const { adapter, runner } = setup()
    runner.handler = async ({ args }) => {
      if (args[0] === 'list-sessions') {
        return {
          stderr: '',
          stdout: [
            '_bitveins_main|1|main|owner-1',
            '_bitveins_other|1|other|owner-1',
          ].join('\n'),
        }
      }
      return { stderr: '', stdout: '' }
    }

    await expect(adapter.createWindowClientSession('main', 2)).resolves.toEqual({
      helperSessionName: `_bitveins_${process.pid}_ya_random`,
      sessionName: 'main',
      windowIndex: 2,
    })
    await adapter.killBitveinsHelpersForBase('main')
    await adapter.killAllBitveinsHelpers()

    const killed = runner.calls
      .filter(call => call.args[0] === 'kill-session')
      .map(call => call.args[2])
    expect(killed).toEqual([
      '_bitveins_main',
      '_bitveins_main',
      '_bitveins_other',
    ])
  })

  it('treats a missing tmux server as an empty helper registry', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => {
      throw new Error('failed to connect to server')
    }

    await expect(adapter.killAllBitveinsHelpers()).resolves.toBeUndefined()
  })

  it('preserves non-Error command failures as diagnostic text', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => {
      throw 'command exploded'
    }

    await expect(adapter.createSession('main', '/workspace')).rejects.toMatchObject({
      causeText: 'command exploded',
    })
  })

  it('rethrows command failures that do not mean the tmux server is absent', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => {
      throw new Error('permission denied')
    }

    await expect(adapter.listSessions()).rejects.toMatchObject({
      causeText: 'permission denied',
    })
  })

  it('provides production clock and identifier defaults', async () => {
    const runner = new FakeCommandRunner()
    const adapter = new TmuxCliAdapter({
      helperOwner: 'owner-1',
      runner,
    })

    const helper = await adapter.createWindowClientSession('main', 1)

    expect(helper.helperSessionName).toMatch(/^_bitveins_\d+_[a-z0-9]+_[a-z0-9]+$/)
  })
})
