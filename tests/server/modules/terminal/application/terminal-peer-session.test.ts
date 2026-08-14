import type { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createReliableInputDeduplicator } from '../../../../../server/modules/terminal/application/reliable-input-deduplicator'
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
import type {
  TerminalPaneControlProcessFactory,
  TerminalPaneControlTarget,
} from '../../../../../server/modules/terminal/ports/terminal-pane-control-process-factory'
import type { ServerMessage } from '../../../../../shared/contracts/terminal'

class FakePty implements PtyProcess {
  private dataListener: ((data: string) => void) | null = null
  private capturedExitListener: ((event: PtyExitEvent) => void) | null = null
  private exitListener: ((event: PtyExitEvent) => void) | null = null
  killCount = 0
  readonly resizes: Array<{ cols: number, rows: number }> = []
  throwOnWrite = false
  readonly writes: Array<string | Buffer> = []
  activateCount = 0

  activate(): void {
    this.activateCount += 1
  }

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

  write(data: string | Buffer): void {
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

class FakePaneControlProcessFactory implements TerminalPaneControlProcessFactory {
  readonly processes: FakePty[] = []
  readonly attachments: Array<{ target: TerminalPaneControlTarget, size: TerminalAttachmentSize }> = []

  attach(target: TerminalPaneControlTarget, size: TerminalAttachmentSize): FakePty {
    const process = new FakePty()
    this.processes.push(process)
    this.attachments.push({ target, size })
    return process
  }
}

function setup(reliableInputs = createReliableInputDeduplicator()) {
  const messages: ServerMessage[] = []
  const activatedHelpers: string[] = []
  const releasedHelpers: string[] = []
  const attachmentProcesses = new FakeAttachmentProcessFactory()
  const paneControlProcesses = new FakePaneControlProcessFactory()
  const wait = vi.fn(async () => {})
  const sessions = {
    capturePaneViewport: vi.fn(async () => ({
      cursorVisible: true,
      cursorX: 3,
      cursorY: 2,
      data: 'pane viewport',
      inMode: false,
      scrollPosition: 0,
    })),
    createWindow: vi.fn(async () => {}),
    createWindowClientSession: vi.fn(async (sessionName: string, windowIndex: number) => ({
      helperSessionName: '_bitveins_test',
      sessionName,
      windowIndex,
    })),
    killBitveinsHelperSession: vi.fn(async () => {}),
    killWindow: vi.fn(async () => {}),
    listPanes: vi.fn(async () => [{ id: '%7' }, { id: '%8' }]),
    resetTerminalScroll: vi.fn(async () => {}),
    prepareTerminalWheel: vi.fn(async () => false),
    selectWindow: vi.fn(async () => {}),
    sendPaneInput: vi.fn(async () => {}),
    sendPaneInputBinary: vi.fn(async () => {}),
  }
  const promptDrafts = {
    clearDraft: vi.fn(),
    getDraft: vi.fn(),
    listDrafts: vi.fn(() => ({})),
    saveDraft: vi.fn((input: any) => ({
      draft: input.draft,
      revision: input.revision ?? 1,
      sessionName: input.sessionName,
      updatedAt: input.now,
      windowId: input.windowId,
    })),
  }
  const broadcastPromptDraft = vi.fn()
  const broadcastPromptDraftCleared = vi.fn()
  const broadcastPromptFocusClaimed = vi.fn()
  const broadcastPromptFocusReleased = vi.fn()
  const peer = new TerminalPeerSession({
    attachmentProcesses,
    paneControlProcesses,
    broadcastPromptDraft,
    broadcastPromptDraftCleared,
    broadcastPromptFocusClaimed,
    broadcastPromptFocusReleased,
    promptDrafts,
    onHelperActivated: name => activatedHelpers.push(name),
    onHelperReleased: name => releasedHelpers.push(name),
    reliableInputs,
    send: message => messages.push(message),
    sessions,
    wait,
  })
  return {
    activatedHelpers,
    broadcastPromptDraft,
    broadcastPromptDraftCleared,
    broadcastPromptFocusClaimed,
    broadcastPromptFocusReleased,
    messages,
    peer,
    promptDrafts,
    attachmentProcesses,
    paneControlProcesses,
    releasedHelpers,
    sessions,
    wait,
  }
}

describe('TerminalPeerSession', () => {
  it('streams and controls one pane through a tmux control-mode attachment', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attachPane',
      payload: { cols: 150, rows: 50, paneId: '%7', sessionName: 'main', windowIndex: 2 },
    }))

    expect(context.paneControlProcesses.attachments).toEqual([{
      target: { paneId: '%7', sessionName: 'main', windowIndex: 2 },
      size: { cols: 150, rows: 50 },
    }])
    expect(context.messages[0]).toMatchObject({
      paneId: '%7',
      sessionName: 'main',
      type: 'attached',
      windowIndex: 2,
    })
    expect(context.messages[1]).toEqual({
      type: 'stdout',
      data: '\x1b[0m\x1b[2J\x1b[3J\x1b[Hpane viewport\x1b[0m\x1b[3;4H\x1b[?25h',
    })
    const process = context.paneControlProcesses.processes[0]!
    process.emitData('pane output')
    await context.peer.enqueue(JSON.stringify({ action: 'input', payload: { data: 'echo pane\r' } }))
    await context.peer.enqueue(JSON.stringify({ action: 'resize', payload: { cols: 160, rows: 60 } }))

    expect(context.messages).toContainEqual({ type: 'stdout', data: 'pane output' })
    expect(context.messages.at(-1)).toEqual({
      type: 'stdout',
      data: '\x1b[0m\x1b[2J\x1b[3J\x1b[Hpane viewport\x1b[0m\x1b[3;4H\x1b[?25h',
    })
    expect(context.sessions.sendPaneInput).toHaveBeenCalledWith('%7', 'echo pane\r')
    expect(process.activateCount).toBe(1)
    expect(process.resizes).toEqual([{ cols: 160, rows: 60 }])
  })

  it('retries a blank initial pane before rendering its attached viewport', async () => {
    const context = setup()
    context.sessions.capturePaneViewport
      .mockResolvedValueOnce({
        cursorVisible: true,
        cursorX: 0,
        cursorY: 0,
        data: '',
        inMode: false,
        scrollPosition: 0,
      })
      .mockResolvedValueOnce({
        cursorVisible: true,
        cursorX: 6,
        cursorY: 0,
        data: 'shell$ ',
        inMode: false,
        scrollPosition: 0,
      })

    await context.peer.enqueue(JSON.stringify({
      action: 'attachPane',
      payload: { paneId: '%7', sessionName: 'main', windowIndex: 2 },
    }))

    expect(context.wait).toHaveBeenCalledExactlyOnceWith(50)
    expect(context.messages).toEqual([
      expect.objectContaining({ paneId: '%7', type: 'attached' }),
      {
        type: 'stdout',
        data: '\x1b[0m\x1b[2J\x1b[3J\x1b[Hshell$ \x1b[0m\x1b[1;7H\x1b[?25h',
      },
    ])
  })

  it('renders tmux copy-mode viewports and suppresses live output until returning to the bottom', async () => {
    const context = setup()
    context.sessions.prepareTerminalWheel.mockResolvedValue(true)
    await context.peer.enqueue(JSON.stringify({
      action: 'attachPane',
      payload: { paneId: '%7', sessionName: 'main', windowIndex: 2 },
    }))
    context.sessions.capturePaneViewport.mockResolvedValue({
      cursorVisible: true,
      cursorX: 3,
      cursorY: 2,
      data: 'pane viewport',
      inMode: true,
      scrollPosition: 5,
    })

    await context.peer.enqueue(JSON.stringify({
      action: 'scrollPane',
      payload: { direction: 'up', lineCount: 1 },
    }))

    expect(context.sessions.prepareTerminalWheel).toHaveBeenCalledExactlyOnceWith('%7', 'up', 1)
    expect(context.messages.at(-1)).toEqual({
      type: 'stdout',
      data: '\x1b[0m\x1b[2J\x1b[3J\x1b[Hpane viewport\x1b[0m\x1b[?25l',
    })
    context.paneControlProcesses.processes[0]!.emitData('hidden live output')
    expect(context.messages.at(-1)?.data).not.toContain('hidden live output')

    context.sessions.capturePaneViewport.mockResolvedValue({
      cursorVisible: true,
      cursorX: 3,
      cursorY: 2,
      data: 'live viewport',
      inMode: false,
      scrollPosition: 0,
    })
    await context.peer.enqueue(JSON.stringify({
      action: 'scrollPane',
      payload: { direction: 'down' },
    }))
    expect(context.messages.at(-1)).toEqual({
      type: 'stdout',
      data: '\x1b[0m\x1b[2J\x1b[3J\x1b[Hlive viewport\x1b[0m\x1b[3;4H\x1b[?25h',
    })
    context.paneControlProcesses.processes[0]!.emitData('visible live output')
    expect(context.messages.at(-1)).toEqual({ type: 'stdout', data: 'visible live output' })
  })

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

  it('resets tmux scrollback before writing newly claimed reliable input', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attachWindow',
      payload: { sessionName: 'main', windowIndex: 2 },
    }))
    const reset = { release: undefined as (() => void) | undefined }
    context.sessions.resetTerminalScroll.mockImplementation(() => new Promise<void>((resolve) => {
      reset.release = resolve
    }))

    const delivery = context.peer.enqueue(JSON.stringify({
      action: 'reliableInput',
      payload: {
        data: 'echo ready\r',
        id: '019f4f82-f7e5-7000-8000-000000000003',
      },
    }))
    await vi.waitFor(() => {
      expect(context.sessions.resetTerminalScroll).toHaveBeenCalledExactlyOnceWith('_bitveins_test')
    })

    expect(context.attachmentProcesses.processes[0]?.writes).toEqual([])
    expect(context.messages.filter(message => message.type === 'inputAck')).toHaveLength(0)

    if (!reset.release) throw new Error('Scroll reset did not start.')
    reset.release()
    await delivery

    expect(context.attachmentProcesses.processes[0]?.writes).toEqual(['echo ready\r'])
    expect(context.messages.at(-1)).toEqual({
      type: 'inputAck',
      data: '',
      inputId: '019f4f82-f7e5-7000-8000-000000000003',
    })
  })

  it('waits for a concurrent reliable replay before acknowledging it', async () => {
    const reliableInputs = createReliableInputDeduplicator()
    const first = setup(reliableInputs)
    const replay = setup(reliableInputs)
    await first.peer.enqueue(JSON.stringify({ action: 'attach', payload: { sessionName: 'main' } }))
    await replay.peer.enqueue(JSON.stringify({ action: 'attach', payload: { sessionName: 'main' } }))
    const reset = { release: undefined as (() => void) | undefined }
    first.sessions.resetTerminalScroll.mockImplementation(() => new Promise<void>((resolve) => {
      reset.release = resolve
    }))
    const message = JSON.stringify({
      action: 'reliableInput',
      payload: {
        data: 'echo once\r',
        id: '019f4f82-f7e5-7000-8000-000000000004',
      },
    })

    const delivery = first.peer.enqueue(message)
    await vi.waitFor(() => {
      expect(first.sessions.resetTerminalScroll).toHaveBeenCalledOnce()
    })
    const duplicate = replay.peer.enqueue(message)
    await Promise.resolve()

    expect(first.messages.filter(item => item.type === 'inputAck')).toHaveLength(0)
    expect(replay.messages.filter(item => item.type === 'inputAck')).toHaveLength(0)
    expect(replay.sessions.resetTerminalScroll).not.toHaveBeenCalled()

    if (!reset.release) throw new Error('Scroll reset did not start.')
    reset.release()
    await Promise.all([delivery, duplicate])

    expect(first.attachmentProcesses.processes[0]?.writes).toEqual(['echo once\r'])
    expect(replay.attachmentProcesses.processes[0]?.writes).toEqual([])
    expect(first.messages.filter(item => item.type === 'inputAck')).toHaveLength(1)
    expect(replay.messages.filter(item => item.type === 'inputAck')).toHaveLength(1)
  })

  it('does not acknowledge reliable input when its attachment exits during reset', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({ action: 'attach', payload: { sessionName: 'main' } }))
    const reset = { release: undefined as (() => void) | undefined }
    context.sessions.resetTerminalScroll.mockImplementation(() => new Promise<void>((resolve) => {
      reset.release = resolve
    }))
    const message = JSON.stringify({
      action: 'reliableInput',
      payload: {
        data: 'retry-after-exit\r',
        id: '019f4f82-f7e5-7000-8000-000000000005',
      },
    })

    const delivery = context.peer.enqueue(message)
    await vi.waitFor(() => {
      expect(context.sessions.resetTerminalScroll).toHaveBeenCalledOnce()
    })
    context.attachmentProcesses.processes[0]!.emitExit({ exitCode: 0 })
    if (!reset.release) throw new Error('Scroll reset did not start.')
    reset.release()
    await delivery

    expect(context.attachmentProcesses.processes[0]?.writes).toEqual([])
    expect(context.messages.filter(item => item.type === 'inputAck')).toHaveLength(0)
    expect(context.messages).toContainEqual({
      type: 'error',
      data: 'Terminal attachment changed during reliable input.',
    })

    context.sessions.resetTerminalScroll.mockResolvedValue(undefined)
    await context.peer.enqueue(JSON.stringify({ action: 'attach', payload: { sessionName: 'main' } }))
    await context.peer.enqueue(message)
    expect(context.attachmentProcesses.processes[1]?.writes).toEqual(['retry-after-exit\r'])
  })

  it('prepares wheel scrolling before writing it to the currently attached tmux target', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({
      action: 'attachWindow',
      payload: { sessionName: 'main', windowIndex: 2 },
    }))

    const preparation = { release: undefined as ((handled: boolean) => void) | undefined }
    context.sessions.prepareTerminalWheel.mockImplementation(() => new Promise<boolean>((resolve) => {
      preparation.release = resolve
    }))

    const wheelInput = context.peer.enqueue(JSON.stringify({
      action: 'wheelInput',
      payload: { data: '\u001B[<64;20;8M', lineCount: 1 },
    }))
    await Promise.resolve()

    expect(context.sessions.prepareTerminalWheel)
      .toHaveBeenCalledExactlyOnceWith('_bitveins_test', 'up', 1)
    expect(context.attachmentProcesses.processes[0]?.writes).toEqual([])
    if (!preparation.release) throw new Error('Wheel preparation did not start.')
    preparation.release(false)
    await wheelInput
    expect(context.attachmentProcesses.processes[0]?.writes).toEqual(['\u001B[<64;20;8M'])
  })

  it('forwards legacy wheel reports to the PTY as binary bytes', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({ action: 'attach', payload: { sessionName: 'main' } }))
    const report = `\u001B[M${String.fromCharCode(96, 52, 40)}`

    await context.peer.enqueue(JSON.stringify({
      action: 'wheelInput',
      payload: { data: report, encoding: 'binary' },
    }))

    expect(context.sessions.prepareTerminalWheel).toHaveBeenCalledExactlyOnceWith('main', 'up')
    const written = context.attachmentProcesses.processes[0]?.writes[0]
    expect(typeof written).toBe('object')
    expect(Array.from(written as Uint8Array)).toEqual([27, 91, 77, 96, 52, 40])
  })

  it('does not write wheel input after its attachment exits during preparation', async () => {
    const context = setup()
    await context.peer.enqueue(JSON.stringify({ action: 'attach', payload: { sessionName: 'main' } }))
    const preparation = { release: undefined as ((handled: boolean) => void) | undefined }
    context.sessions.prepareTerminalWheel.mockImplementation(() => new Promise<boolean>((resolve) => {
      preparation.release = resolve
    }))

    const wheelInput = context.peer.enqueue(JSON.stringify({
      action: 'wheelInput',
      payload: { data: '\u001B[<64;20;8M' },
    }))
    await vi.waitFor(() => {
      expect(context.sessions.prepareTerminalWheel).toHaveBeenCalledOnce()
    })
    context.attachmentProcesses.processes[0]!.emitExit({ exitCode: 0 })
    if (!preparation.release) throw new Error('Wheel preparation did not start.')
    preparation.release(false)
    await wheelInput

    expect(context.attachmentProcesses.processes[0]?.writes).toEqual([])
    expect(context.messages).toContainEqual({
      type: 'error',
      data: 'Terminal attachment changed during wheel input.',
    })
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

  it('handles syncPromptDraft and clearPromptDraft actions', async () => {
    const context = setup()

    await context.peer.enqueue(JSON.stringify({
      action: 'syncPromptDraft',
      payload: {
        clientId: 'tab-1',
        draft: 'npm run dev',
        revision: 2,
        sessionName: 'main',
        windowId: '@1',
      },
    }))

    expect(context.promptDrafts.saveDraft).toHaveBeenCalledWith({
      draft: 'npm run dev',
      now: expect.any(Number),
      revision: 2,
      sessionName: 'main',
      windowId: '@1',
    })
    expect(context.broadcastPromptDraft).toHaveBeenCalledWith({
      clientId: 'tab-1',
      draft: 'npm run dev',
      revision: 2,
      sessionName: 'main',
      updatedAt: expect.any(Number),
      windowId: '@1',
    })

    await context.peer.enqueue(JSON.stringify({
      action: 'clearPromptDraft',
      payload: {
        clientId: 'tab-1',
        sessionName: 'main',
        windowId: '@1',
      },
    }))

    expect(context.promptDrafts.clearDraft).toHaveBeenCalledWith('main', '@1')
    expect(context.broadcastPromptDraftCleared).toHaveBeenCalledWith({
      clientId: 'tab-1',
      sessionName: 'main',
      windowId: '@1',
    })

    await context.peer.enqueue(JSON.stringify({
      action: 'claimPromptFocus',
      payload: {
        clientId: 'tab-1',
        sessionName: 'main',
        windowId: '@1',
      },
    }))

    expect(context.broadcastPromptFocusClaimed).toHaveBeenCalledWith({
      clientId: 'tab-1',
      sessionName: 'main',
      windowId: '@1',
    })

    await context.peer.enqueue(JSON.stringify({
      action: 'releasePromptFocus',
      payload: {
        clientId: 'tab-1',
        sessionName: 'main',
        windowId: '@1',
      },
    }))

    expect(context.broadcastPromptFocusReleased).toHaveBeenCalledWith({
      clientId: 'tab-1',
      sessionName: 'main',
      windowId: '@1',
    })
  })
})
