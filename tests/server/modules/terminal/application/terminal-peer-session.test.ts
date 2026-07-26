import { describe, expect, it, vi } from 'vitest'
import { TerminalPeerSession } from '../../../../../server/modules/terminal/application/terminal-peer-session'
import type {
  Disposable,
  PtyExitEvent,
  PtyProcess,
} from '../../../../../server/modules/terminal/ports/pty-factory'
import type {
  TerminalAttachmentProcessFactory,
  TerminalAttachmentSize,
} from '../../../../../server/modules/terminal/ports/terminal-attachment-process-factory'
import type { ServerMessage } from '../../../../../shared/contracts/terminal'

class FakePty implements PtyProcess {
  private dataListener: ((data: string) => void) | null = null
  private capturedExitListener: ((event: PtyExitEvent) => void) | null = null
  private exitListener: ((event: PtyExitEvent) => void) | null = null
  killCount = 0
  readonly resizes: Array<{ cols: number, rows: number }> = []
  throwOnWrite = false
  readonly writes: string[] = []

  kill(): void {
    this.killCount += 1
  }

  onData(listener: (data: string) => void): Disposable {
    this.dataListener = listener
    return {
      dispose: () => {
        if (this.dataListener === listener) this.dataListener = null
      },
    }
  }

  onExit(listener: (event: PtyExitEvent) => void): Disposable {
    this.exitListener = listener
    this.capturedExitListener = listener
    return {
      dispose: () => {
        if (this.exitListener === listener) this.exitListener = null
      },
    }
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows })
  }

  write(data: string): void {
    if (this.throwOnWrite) throw new Error('write failed')
    this.writes.push(data)
  }

  emitData(data: string): void {
    this.dataListener?.(data)
  }

  emitExit(event: PtyExitEvent): void {
    this.exitListener?.(event)
  }

  emitCapturedExit(event: PtyExitEvent): void {
    this.capturedExitListener?.(event)
  }
}

class FakeAttachmentProcessFactory implements TerminalAttachmentProcessFactory {
  readonly processes: FakePty[] = []
  readonly attachments: Array<{ sessionName: string, size: TerminalAttachmentSize }> = []
  throwOnSpawn = false

  attach(sessionName: string, size: TerminalAttachmentSize): PtyProcess {
    if (this.throwOnSpawn) throw new Error('spawn failed')
    const pty = new FakePty()
    this.processes.push(pty)
    this.attachments.push({ sessionName, size })
    return pty
  }
}

function setup() {
  const messages: ServerMessage[] = []
  const activatedHelpers: string[] = []
  const releasedHelpers: string[] = []
  const claimedInputs = new Set<string>()
  const attachmentProcesses = new FakeAttachmentProcessFactory()
  const sessions = {
    createWindow: vi.fn(async () => {}),
    createWindowClientSession: vi.fn(async (sessionName: string, windowIndex: number) => ({
      helperSessionName: '_bitveins_test',
      sessionName,
      windowIndex,
    })),
    killBitveinsHelperSession: vi.fn(async () => {}),
    killWindow: vi.fn(async () => {}),
    selectWindow: vi.fn(async () => {}),
  }
  const peer = new TerminalPeerSession({
    attachmentProcesses,
    onHelperActivated: name => activatedHelpers.push(name),
    onHelperReleased: name => releasedHelpers.push(name),
    reliableInputs: {
      claim(id) {
        if (claimedInputs.has(id)) return false
        claimedInputs.add(id)
        return true
      },
      release(id) {
        claimedInputs.delete(id)
      },
    },
    send: message => messages.push(message),
    sessions,
  })
  return {
    activatedHelpers,
    messages,
    peer,
    attachmentProcesses,
    releasedHelpers,
    sessions,
  }
}

describe('TerminalPeerSession', () => {
  it('owns a PTY attachment and forwards only current output', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attach',
      payload: { cols: 120, rows: 40, sessionName: 'main' },
    }))
    const pty = context.attachmentProcesses.processes[0]!

    expect(context.attachmentProcesses.attachments[0]).toEqual({
      sessionName: 'main',
      size: {
        cols: 120,
        rows: 40,
      },
    })
    expect(context.messages[0]).toMatchObject({
      type: 'attached',
      sessionName: 'main',
    })

    pty.emitData('hello')
    expect(context.messages.at(-1)).toEqual({ type: 'stdout', data: 'hello' })

    await context.peer.enqueue(JSON.stringify({ action: 'detach' }))
    pty.emitData('stale')
    expect(context.messages.at(-1)).not.toEqual({ type: 'stdout', data: 'stale' })
    expect(pty.killCount).toBe(1)
  })

  it('deduplicates reliable input while acknowledging every replay', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attach',
      payload: { sessionName: 'main' },
    }))
    const reliableMessage = JSON.stringify({
      action: 'reliableInput',
      payload: {
        data: 'echo safe\r',
        id: '019f4f82-f7e5-7000-8000-000000000001',
      },
    })

    await context.peer.enqueue(reliableMessage)
    await context.peer.enqueue(reliableMessage)

    expect(context.attachmentProcesses.processes[0]?.writes).toEqual(['echo safe\r'])
    expect(context.messages.filter(message => message.type === 'inputAck')).toHaveLength(2)
  })

  it('releases a helper exactly once across repeated detach calls', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attachWindow',
      payload: { sessionName: 'main', windowIndex: 2 },
    }))

    await context.peer.enqueue(JSON.stringify({ action: 'detach' }))
    await context.peer.enqueue(JSON.stringify({ action: 'detach' }))

    expect(context.activatedHelpers).toEqual(['_bitveins_test'])
    expect(context.releasedHelpers).toEqual(['_bitveins_test'])
    expect(context.sessions.killBitveinsHelperSession).toHaveBeenCalledOnce()
    expect(context.attachmentProcesses.processes[0]?.killCount).toBe(1)
  })

  it('compensates helper creation when PTY spawning fails', async () => {
    const context = setup()
    context.attachmentProcesses.throwOnSpawn = true

    await context.peer.enqueue(JSON.stringify({
      action: 'attachWindow',
      payload: { sessionName: 'main', windowIndex: 2 },
    }))

    expect(context.releasedHelpers).toEqual(['_bitveins_test'])
    expect(context.sessions.killBitveinsHelperSession).toHaveBeenCalledWith('_bitveins_test')
    expect(context.messages.at(-1)).toEqual({ type: 'error', data: 'spawn failed' })
  })

  it('serializes concurrent messages from one peer', async () => {
    const context = setup()
    let releaseSelection: (() => void) | null = null
    context.sessions.selectWindow.mockImplementation(() => new Promise<void>((resolve) => {
      releaseSelection = resolve
    }))

    const selection = context.peer.enqueue(JSON.stringify({
      action: 'selectWindow',
      payload: { index: 1, sessionName: 'main' },
    }))
    const creation = context.peer.enqueue(JSON.stringify({
      action: 'newWindow',
      payload: { sessionName: 'main' },
    }))
    await Promise.resolve()

    expect(context.sessions.createWindow).not.toHaveBeenCalled()
    if (!releaseSelection) throw new Error('Selection did not start.')
    releaseSelection()
    await Promise.all([selection, creation])
    expect(context.sessions.createWindow).toHaveBeenCalledAfter(context.sessions.selectWindow)
  })

  it('handles PTY exit and dispose idempotently', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attach',
      payload: { sessionName: 'main' },
    }))
    const pty = context.attachmentProcesses.processes[0]!

    pty.emitExit({ exitCode: 0 })
    await Promise.resolve()
    await context.peer.dispose()
    await context.peer.dispose()

    expect(context.messages.at(-1)).toEqual({
      type: 'status',
      data: 'Detached from tmux attach process (0).',
    })
    expect(pty.killCount).toBe(0)
  })

  it('waits for an in-flight attachment before disposing its PTY and helper', async () => {
    const context = setup()
    let finishHelperCreation: ((value: {
      helperSessionName: string
      sessionName: string
      windowIndex: number
    }) => void) | null = null
    context.sessions.createWindowClientSession.mockImplementation(() => new Promise((resolve) => {
      finishHelperCreation = resolve
    }))

    const attachment = context.peer.enqueue(JSON.stringify({
      action: 'attachWindow',
      payload: { sessionName: 'main', windowIndex: 2 },
    }))
    await vi.waitFor(() => {
      expect(context.sessions.createWindowClientSession).toHaveBeenCalledOnce()
    })

    const firstDisposal = context.peer.dispose()
    const secondDisposal = context.peer.dispose()
    expect(firstDisposal).toBe(secondDisposal)
    expect(context.attachmentProcesses.processes).toHaveLength(0)

    if (!finishHelperCreation) throw new Error('Helper creation did not start.')
    finishHelperCreation({
      helperSessionName: '_bitveins_delayed',
      sessionName: 'main',
      windowIndex: 2,
    })
    await Promise.all([attachment, firstDisposal])

    expect(context.attachmentProcesses.processes[0]?.killCount).toBe(1)
    expect(context.activatedHelpers).toEqual(['_bitveins_delayed'])
    expect(context.releasedHelpers).toEqual(['_bitveins_delayed'])
    expect(context.sessions.killBitveinsHelperSession).toHaveBeenCalledWith('_bitveins_delayed')
  })

  it('handles input, resize, window commands, and ping through one ordered dispatcher', async () => {
    const context = setup()

    await context.peer.enqueue(JSON.stringify({
      action: 'input',
      payload: { data: 'before' },
    }))
    await context.peer.enqueue(JSON.stringify({
      action: 'resize',
      payload: { cols: 80, rows: 24 },
    }))
    expect(context.messages.at(-1)).toEqual({
      type: 'error',
      data: 'No active tmux attachment.',
    })

    await context.peer.enqueue(JSON.stringify({
      action: 'attach',
      payload: { sessionName: 'main' },
    }))
    await context.peer.enqueue(JSON.stringify({
      action: 'input',
      payload: { data: 'ls\r' },
    }))
    await context.peer.enqueue(JSON.stringify({
      action: 'resize',
      payload: { cols: 100, rows: 30 },
    }))
    await context.peer.enqueue(JSON.stringify({
      action: 'selectWindow',
      payload: { index: 2, sessionName: 'main' },
    }))
    await context.peer.enqueue(JSON.stringify({
      action: 'newWindow',
      payload: { sessionName: 'main' },
    }))
    await context.peer.enqueue(JSON.stringify({
      action: 'killWindow',
      payload: { index: 2, sessionName: 'main' },
    }))
    await context.peer.enqueue(JSON.stringify({ action: 'ping' }))

    const pty = context.attachmentProcesses.processes[0]!
    expect(pty.writes).toEqual(['ls\r'])
    expect(pty.resizes).toEqual([{ cols: 100, rows: 30 }])
    expect(context.sessions.selectWindow).toHaveBeenCalledWith('main', 2)
    expect(context.sessions.createWindow).toHaveBeenCalledWith('main')
    expect(context.sessions.killWindow).toHaveBeenCalledWith('main', 2)
    expect(context.messages.slice(-4)).toEqual([
      { type: 'status', data: 'Selected window 2.' },
      { type: 'status', data: 'Created window.' },
      { type: 'status', data: 'Closed window 2.' },
      { type: 'pong', data: '' },
    ])
  })

  it('releases a reliable claim when the PTY write fails so a retry can succeed', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attach',
      payload: { sessionName: 'main' },
    }))
    const pty = context.attachmentProcesses.processes[0]!
    const message = JSON.stringify({
      action: 'reliableInput',
      payload: {
        data: 'retry\r',
        id: '019f4f82-f7e5-7000-8000-000000000002',
      },
    })

    pty.throwOnWrite = true
    await context.peer.enqueue(message)
    pty.throwOnWrite = false
    await context.peer.enqueue(message)

    expect(pty.writes).toEqual(['retry\r'])
    expect(context.messages).toContainEqual({ type: 'error', data: 'write failed' })
    expect(context.messages).toContainEqual({
      type: 'inputAck',
      data: '',
      inputId: '019f4f82-f7e5-7000-8000-000000000002',
    })
  })

  it('releases a window helper on PTY exit and ignores a late old exit', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attachWindow',
      payload: { sessionName: 'main', windowIndex: 2 },
    }))
    const helperPty = context.attachmentProcesses.processes[0]!
    helperPty.emitExit({ exitCode: 0, signal: 15 })

    await vi.waitFor(() => {
      expect(context.releasedHelpers).toEqual(['_bitveins_test'])
      expect(context.messages.at(-1)).toEqual({
        type: 'status',
        data: 'Detached from tmux window 2 (15).',
      })
    })

    await context.peer.enqueue(JSON.stringify({
      action: 'attach',
      payload: { sessionName: 'main' },
    }))
    helperPty.emitCapturedExit({ exitCode: 9 })
    await Promise.resolve()
    await context.peer.enqueue(JSON.stringify({
      action: 'input',
      payload: { data: 'still-current\r' },
    }))
    expect(context.attachmentProcesses.processes[1]?.writes).toEqual(['still-current\r'])
  })

  it('stops heartbeats and queued messages after disposal', async () => {
    const context = setup()

    context.peer.sendHeartbeat()
    await context.peer.dispose()
    context.peer.sendHeartbeat()
    await context.peer.enqueue(JSON.stringify({ action: 'ping' }))

    expect(context.messages).toEqual([{ type: 'heartbeat', data: '' }])
  })

  it('normalizes non-Error failures before sending them to the peer', async () => {
    const context = setup()
    context.sessions.selectWindow.mockRejectedValue('selection failed')

    await context.peer.enqueue(JSON.stringify({
      action: 'selectWindow',
      payload: { index: 1, sessionName: 'main' },
    }))

    expect(context.messages).toEqual([{
      type: 'error',
      data: 'selection failed',
    }])
  })
})
