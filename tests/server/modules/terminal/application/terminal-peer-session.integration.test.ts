import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TmuxCliAdapter } from '../../../../../server/modules/sessions/adapters/tmux/tmux-cli-adapter'
import { NodeCommandRunner } from '../../../../../server/modules/sessions/adapters/tmux/node-command-runner'
import { createReliableInputDeduplicator } from '../../../../../server/modules/terminal/application/reliable-input-deduplicator'
import { TerminalPeerSession } from '../../../../../server/modules/terminal/application/terminal-peer-session'
import { TmuxPaneControlProcessFactory } from '../../../../../server/modules/terminal/adapters/tmux-pane-control-process-factory'
import type { ServerMessage } from '../../../../../shared/contracts/terminal'

const execFileAsync = promisify(execFile)
const socketName = `bitveins-peer-${process.pid}`
const sessionName = 'peer_integration'
const runner = new NodeCommandRunner()
const tmux = new TmuxCliAdapter({ helperOwner: 'test', runner, socketName })

describe('TerminalPeerSession tmux control-mode integration', () => {
  beforeAll(async () => {
    await execFileAsync('tmux', ['-L', socketName, 'new-session', '-d', '-s', sessionName])
  })

  afterAll(async () => {
    await execFileAsync('tmux', ['-L', socketName, 'kill-server']).catch(() => undefined)
  })

  it('delivers reliable input to the attached pane and acknowledges it', async () => {
    const messages: ServerMessage[] = []
    const peer = new TerminalPeerSession({
      attachmentProcesses: { attach: vi.fn(() => { throw new Error('Not used') }) },
      onHelperActivated: vi.fn(),
      onHelperReleased: vi.fn(),
      paneControlProcesses: new TmuxPaneControlProcessFactory({
        cwd: process.cwd(),
        env: process.env,
        socketName,
      }),
      reliableInputs: createReliableInputDeduplicator(),
      send: message => messages.push(message),
      sessions: {
        capturePaneViewport: paneId => tmux.capturePaneViewport(paneId),
        createWindow: vi.fn(async () => {}),
        createWindowClientSession: vi.fn(async () => { throw new Error('Not used') }),
        killBitveinsHelperSession: vi.fn(async () => {}),
        killWindow: vi.fn(async () => {}),
        listPanes: (name, index) => tmux.listPanes(name, index),
        prepareTerminalWheel: (target, direction, lines) => tmux.prepareTerminalWheel(target, direction, lines),
        resetTerminalScroll: target => tmux.resetTerminalScroll(target),
        selectWindow: (name, index) => tmux.selectWindow(name, index),
        sendPaneInput: (paneId, data) => tmux.sendPaneInput(paneId, data),
        sendPaneInputBinary: (paneId, data) => tmux.sendPaneInputBinary(paneId, data),
      },
    })
    const paneId = (await tmux.listPanes(sessionName, 0))[0]!.id
    await peer.enqueue(JSON.stringify({
      action: 'attachPane',
      payload: { paneId, sessionName, windowIndex: 0 },
    }))
    const viewportIndex = messages.findIndex(message => (
      message.type === 'stdout' && message.data.startsWith('\x1b[0m\x1b[2J\x1b[3J\x1b[H')
    ))
    const attachedIndex = messages.findIndex(message => message.type === 'attached')
    expect(viewportIndex).toBeGreaterThanOrEqual(0)
    expect(attachedIndex).toBeGreaterThanOrEqual(0)
    expect(viewportIndex).toBeGreaterThan(attachedIndex)
    await peer.enqueue(JSON.stringify({
      action: 'reliableInput',
      payload: {
        data: 'echo peer-integration\r',
        id: '019f4f82-f7e5-7000-8000-000000000099',
      },
    }))

    expect(messages).toContainEqual({
      type: 'inputAck',
      data: '',
      inputId: '019f4f82-f7e5-7000-8000-000000000099',
    })
    await peer.dispose()
  })
})
