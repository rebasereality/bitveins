import { mkdtemp, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NodeCommandRunner } from '../../../../../../server/modules/sessions/adapters/tmux/node-command-runner'
import { TmuxCliAdapter } from '../../../../../../server/modules/sessions/adapters/tmux/tmux-cli-adapter'

const runner = new NodeCommandRunner()
const socketName = `bitveins-test-${process.pid}-${Date.now()}`
let workspace = ''
const adapter = new TmuxCliAdapter({
  helperOwner: `test-${process.pid}`,
  runner,
  socketName,
})

describe('TmuxCliAdapter isolated integration', () => {
  beforeAll(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'bitveins-tmux-adapter-'))
  })

  afterAll(async () => {
    await runner.run('tmux', ['-L', socketName, 'kill-server']).catch(() => undefined)
    if (process.getuid) {
      await unlink(join(
        process.env.TMUX_TMPDIR || tmpdir(),
        `tmux-${process.getuid()}`,
        socketName,
      )).catch(() => undefined)
    }
    if (workspace) {
      await rm(workspace, { force: true, recursive: true })
    }
  })

  it('manages sessions, windows, snapshots, and helpers on its dedicated socket', async () => {
    await adapter.createSession('integration', workspace)
    await expect(adapter.listSessions()).resolves.toEqual([{
      name: 'integration',
      path: workspace,
    }])

    await adapter.renameWindow('integration', 0, 'integration')
    const window = await adapter.createWindow('integration', workspace)
    expect(window.id).toMatch(/^@\d+$/)
    const windows = await adapter.listWindows('integration')
    expect(windows.some(candidate => candidate.id === window.id)).toBe(true)

    const renamed = await adapter.renameWindow('integration', window.index, 'verification')
    expect(renamed?.name).toBe('verification')
    await expect(adapter.captureWindowSnapshot('integration', window.index, 10))
      .resolves.toBeTypeOf('string')

    const helper = await adapter.createWindowClientSession('integration', window.index)
    expect(helper.helperSessionName).toMatch(/^_bitveins_/)
    await adapter.killBitveinsHelperSession(helper.helperSessionName)

    await adapter.killSession('integration')
    await expect(adapter.listSessions()).resolves.toEqual([])
  })
})
