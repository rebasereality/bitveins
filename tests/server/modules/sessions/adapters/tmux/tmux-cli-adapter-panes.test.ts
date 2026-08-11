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

class PaneCommandRunner implements CommandRunner {
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

const twoPanes = [
  '%7|0|1|0|0|40|20|80|20|101|/workspace/left',
  '%8|1|0|41|0|39|20|80|20|102|/workspace/right',
].join('\n')

function setup(panes = twoPanes) {
  const runner = new PaneCommandRunner()
  runner.handler = async ({ command, args }) => {
    if (command === 'ps') return { stderr: '', stdout: '' }
    if (args[0] === 'list-panes') return { stderr: '', stdout: panes }
    return { stderr: '', stdout: '' }
  }
  const adapter = new TmuxCliAdapter({
    helperOwner: 'owner-1',
    runner,
  })
  return { adapter, runner }
}

describe('TmuxCliAdapter pane operations', () => {
  it('maps split, close, select, and height resize operations to stable pane ids', async () => {
    const { adapter, runner } = setup()

    await expect(adapter.splitWindow('main', 0, '%7', 'horizontal')).resolves.toHaveLength(2)
    await expect(adapter.splitWindow('main', 0, '%8', 'vertical')).resolves.toHaveLength(2)
    await expect(adapter.killPane('main', 0, '%8')).resolves.toHaveLength(2)
    await adapter.selectPane('main', 0, '%7')
    await expect(adapter.resizePane('main', 0, '%7', 'height', '18')).resolves.toHaveLength(2)

    expect(runner.calls.map(call => call.args)).toContainEqual([
      'split-window', '-h', '-c', '#{pane_current_path}', '-t', '%7',
    ])
    expect(runner.calls.map(call => call.args)).toContainEqual([
      'split-window', '-v', '-c', '#{pane_current_path}', '-t', '%8',
    ])
    expect(runner.calls.map(call => call.args)).toContainEqual(['kill-pane', '-t', '%8'])
    expect(runner.calls.map(call => call.args)).toContainEqual(['select-pane', '-t', '%7'])
    expect(runner.calls.map(call => call.args)).toContainEqual(['resize-pane', '-y', '18', '-t', '%7'])
  })

  it('rejects stale pane ids before mutating tmux', async () => {
    const { adapter, runner } = setup()

    await expect(adapter.splitWindow('main', 0, '%9', 'horizontal'))
      .rejects.toThrow('Tmux pane is no longer available.')
    await expect(adapter.killPane('main', 0, '%9'))
      .rejects.toThrow('Tmux pane is no longer available.')
    await expect(adapter.selectPane('main', 0, '%9'))
      .rejects.toThrow('Tmux pane is no longer available.')
    await expect(adapter.resizePane('main', 0, '%9', 'width', 20))
      .rejects.toThrow('Tmux pane is no longer available.')
    await expect(adapter.captureWindowSnapshot('main', 0, 20, '%9'))
      .rejects.toThrow('Tmux pane is no longer available.')

    expect(runner.calls.map(call => call.args[0])).not.toContain('split-window')
    expect(runner.calls.map(call => call.args[0])).not.toContain('kill-pane')
    expect(runner.calls.map(call => call.args[0])).not.toContain('select-pane')
    expect(runner.calls.map(call => call.args[0])).not.toContain('resize-pane')
    expect(runner.calls.map(call => call.args[0])).not.toContain('capture-pane')
  })

  it('refuses to close the final pane', async () => {
    const { adapter, runner } = setup(twoPanes.split('\n')[0])

    await expect(adapter.killPane('main', 0, '%7'))
      .rejects.toThrow('The final pane cannot be closed.')
    expect(runner.calls.map(call => call.args[0])).not.toContain('kill-pane')
  })

  it('captures a snapshot from an existing pane and preserves empty input boundaries', async () => {
    const { adapter, runner } = setup()

    await expect(adapter.captureWindowSnapshot('main', 0, 20, '%7')).resolves.toBe('')
    await adapter.sendPaneInput('%7', '\0')
    await adapter.sendPaneInputBinary('%7', '')

    expect(runner.calls.map(call => call.args)).toContainEqual([
      'capture-pane', '-e', '-p', '-J', '-S', '-20', '-t', '%7',
    ])
    expect(runner.calls.map(call => call.args)).toContainEqual([
      'send-keys', '-t', '%7', '-H', '00',
    ])
  })

  it('skips process detection when panes have no usable pid', async () => {
    const { adapter, runner } = setup('%7|0|1|0|0|40|20|80|20||/workspace')

    await expect(adapter.listPanes('main', 0)).resolves.toHaveLength(1)
    expect(runner.calls.map(call => call.command)).not.toContain('ps')
  })

  it('returns no window owner when the tmux server is absent', async () => {
    const { adapter, runner } = setup()
    runner.handler = async () => {
      throw new Error('no server running on /tmp/tmux/default')
    }

    await expect(adapter.findSessionNameByWindowId('@7')).resolves.toBeNull()
  })
})
