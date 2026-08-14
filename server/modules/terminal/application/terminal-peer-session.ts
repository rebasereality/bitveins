import { Buffer } from 'node:buffer'
import type { ClientMessage, ServerMessage } from '#shared/contracts/terminal'
import { parseClientMessage, parseTerminalSize } from '#shared/contracts/terminal'
import { normalizeSessionName } from '../../sessions/model/session-validation'
import type { TmuxPaneViewport } from '../../sessions/ports/tmux-gateway'
import type { Disposable, PtyProcess } from '../ports/pty-factory'
import type { TerminalAttachmentProcessFactory } from '../ports/terminal-attachment-process-factory'
import type {
  TerminalPaneControlProcess,
  TerminalPaneControlProcessFactory,
} from '../ports/terminal-pane-control-process-factory'

interface ReliableInputDeduplicator {
  deliver(
    id: string,
    target: string,
    operation: () => Promise<void> | void,
  ): Promise<void>
}

interface TerminalSessionOperations {
  applyClientAppearance?(sessionName: string, appearance: 'dark' | 'light'): Promise<void>
  capturePaneViewport(paneId: unknown): Promise<TmuxPaneViewport>
  createWindow(name: string): Promise<unknown>
  createWindowClientSession(name: string, index: unknown): Promise<{
    helperSessionName: string
    sessionName: string
    windowIndex: number
  }>
  killBitveinsHelperSession(name: string): Promise<void>
  killWindow(name: string, index: unknown): Promise<void>
  listPanes(name: string, index: unknown): Promise<Array<{ id: string }>>
  prepareTerminalWheel(sessionName: string, direction: 'down' | 'up', lineCount?: 1): Promise<boolean>
  resetTerminalScroll(sessionName: string): Promise<void>
  selectWindow(name: string, index: unknown): Promise<void>
  sendPaneInput(paneId: unknown, data: string): Promise<void>
  sendPaneInputBinary(paneId: unknown, data: string): Promise<void>
}

interface TerminalPeerSessionOptions {
  attachmentProcesses: TerminalAttachmentProcessFactory
  paneControlProcesses: TerminalPaneControlProcessFactory
  onHelperActivated: (name: string) => void
  onHelperReleased: (name: string) => void
  reliableInputs: ReliableInputDeduplicator
  send: (message: ServerMessage) => void
  sessions: TerminalSessionOperations
  wait?: (delay: number) => Promise<void>
}

interface Attachment {
  dataSubscription?: Disposable
  exitSubscription?: Disposable
  helperReleased: boolean
  helperSessionName?: string
  label: string
  paneId?: string
  process: PtyProcess | TerminalPaneControlProcess
  reliableInputTarget: string
  scrollActive?: boolean
  tmuxTarget: string
}

const initialPaneCaptureDelays = [0, 50, 100, 200, 400] as const

function wait(delay: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delay))
}

export class TerminalPeerSession {
  private attachment: Attachment | null = null
  private disposePromise: Promise<void> | null = null
  private disposed = false
  private messageChain: Promise<void> = Promise.resolve()

  constructor(private readonly options: TerminalPeerSessionOptions) {}

  enqueue(rawMessage: string): Promise<void> {
    this.messageChain = this.messageChain.then(async () => {
      if (this.disposed) return

      try {
        await this.dispatch(parseClientMessage(rawMessage))
      }
      catch (error) {
        this.sendError(error)
      }
    })

    return this.messageChain
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise

    this.disposed = true
    this.disposePromise = this.messageChain.then(() => this.detach())
    this.messageChain = this.disposePromise
    return this.disposePromise
  }

  sendHeartbeat(): void {
    if (!this.disposed) {
      this.options.send({ type: 'heartbeat', data: '' })
    }
  }

  private async dispatch(message: ClientMessage): Promise<void> {
    switch (message.action) {
      case 'attach':
        await this.attachSession(
          message.payload.sessionName,
          message.payload.cols,
          message.payload.rows,
          message.payload.appearance,
        )
        return
      case 'attachWindow':
        await this.attachWindow(
          message.payload.sessionName,
          message.payload.windowIndex,
          message.payload.cols,
          message.payload.rows,
          message.payload.appearance,
        )
        return
      case 'attachPane':
        await this.attachPane(
          message.payload.sessionName,
          message.payload.windowIndex,
          message.payload.paneId,
          message.payload.cols,
          message.payload.rows,
          message.payload.appearance,
        )
        return
      case 'setAppearance':
        await this.applyAppearance(message.payload.appearance)
        return
      case 'input':
        await this.writeInput(this.requireAttachment(), message.payload.data)
        return
      case 'scrollPane':
        await this.scrollPane(message.payload.direction, message.payload.lineCount)
        return
      case 'wheelInput': {
        const attachment = this.requireAttachment()
        this.activatePaneAttachment(attachment)
        const binary = message.payload.encoding === 'binary'
        const direction = binary
          ? (message.payload.data.charCodeAt(3) === 96 ? 'up' : 'down')
          : (message.payload.data.startsWith('\u001B[<64;') ? 'up' : 'down')
        const handled = message.payload.lineCount
          ? await this.options.sessions.prepareTerminalWheel(
              attachment.tmuxTarget,
              direction,
              message.payload.lineCount,
            )
          : await this.options.sessions.prepareTerminalWheel(attachment.tmuxTarget, direction)
        this.requireCurrentAttachment(attachment, 'wheel input')
        if (!handled) {
          if (attachment.paneId) {
            if (binary) await this.options.sessions.sendPaneInputBinary(attachment.paneId, message.payload.data)
            else await this.options.sessions.sendPaneInput(attachment.paneId, message.payload.data)
          }
          else {
            ;(attachment.process as PtyProcess).write(binary
              ? Buffer.from(message.payload.data, 'binary')
              : message.payload.data)
          }
        }
        else if (attachment.paneId) {
          await this.renderPaneViewport(attachment)
        }
        return
      }
      case 'reliableInput':
        await this.writeReliableInput(message.payload.id, message.payload.data)
        return
      case 'resize': {
        const attachment = this.attachment
        if (attachment) {
          const size = parseTerminalSize(message.payload.cols, message.payload.rows)
          attachment.process.resize(size.cols, size.rows)
        }
        return
      }
      case 'selectWindow':
        await this.options.sessions.selectWindow(message.payload.sessionName, message.payload.index)
        this.options.send({ type: 'status', data: `Selected window ${message.payload.index}.` })
        return
      case 'newWindow':
        await this.options.sessions.createWindow(message.payload.sessionName)
        this.options.send({ type: 'status', data: 'Created window.' })
        return
      case 'killWindow':
        await this.options.sessions.killWindow(message.payload.sessionName, message.payload.index)
        this.options.send({ type: 'status', data: `Closed window ${message.payload.index}.` })
        return
      case 'detach':
        await this.detach()
        return
      case 'ping':
        this.options.send({ type: 'pong', data: '' })
    }
  }

  private currentSessionName: string | null = null

  private async applyAppearance(appearance: 'dark' | 'light'): Promise<void> {
    if (!this.currentSessionName || !this.options.sessions.applyClientAppearance) return
    try {
      await this.options.sessions.applyClientAppearance(this.currentSessionName, appearance)
    }
    catch {
      // Appearance hints are optional and must not break an attach.
    }
  }

  private async attachSession(
    sessionName: string,
    cols?: number,
    rows?: number,
    appearance?: 'dark' | 'light',
  ): Promise<void> {
    await this.detach()
    const normalizedSessionName = normalizeSessionName(sessionName)
    this.currentSessionName = normalizedSessionName
    if (appearance) await this.applyAppearance(appearance)
    const attachment = this.spawnAttachment(
      normalizedSessionName,
      `tmux attach process`,
      `session:${normalizedSessionName}`,
      cols,
      rows,
    )
    this.attachment = attachment
    this.options.send({
      type: 'attached',
      data: `Attached to ${normalizedSessionName}.`,
      sessionName: normalizedSessionName,
    })
  }

  private async attachWindow(
    sessionName: string,
    windowIndex: number,
    cols?: number,
    rows?: number,
    appearance?: 'dark' | 'light',
  ): Promise<void> {
    await this.detach()
    const normalizedSessionName = normalizeSessionName(sessionName)
    this.currentSessionName = normalizedSessionName
    if (appearance) await this.applyAppearance(appearance)
    await this.options.sessions.selectWindow(sessionName, windowIndex)
    const windowClient = await this.options.sessions.createWindowClientSession(sessionName, windowIndex)
    this.options.onHelperActivated(windowClient.helperSessionName)

    try {
      const attachment = this.spawnAttachment(
        windowClient.helperSessionName,
        `tmux window ${windowClient.windowIndex}`,
        `window:${windowClient.sessionName}:${windowClient.windowIndex}`,
        cols,
        rows,
        windowClient.helperSessionName,
      )
      this.attachment = attachment
    }
    catch (error) {
      await this.releaseHelper(windowClient.helperSessionName)
      throw error
    }

    this.options.send({
      type: 'attached',
      data: `Attached to ${windowClient.sessionName}:${windowClient.windowIndex}.`,
      sessionName: windowClient.sessionName,
      windowIndex: windowClient.windowIndex,
    })
  }

  private async attachPane(
    sessionName: string,
    windowIndex: number,
    paneId: string,
    cols?: number,
    rows?: number,
    appearance?: 'dark' | 'light',
  ): Promise<void> {
    await this.detach()
    const normalizedSessionName = normalizeSessionName(sessionName)
    this.currentSessionName = normalizedSessionName
    if (appearance) await this.applyAppearance(appearance)
    const panes = await this.options.sessions.listPanes(normalizedSessionName, windowIndex)
    if (!panes.some(pane => pane.id === paneId)) {
      throw new Error('Tmux pane is no longer available.')
    }
    const size = parseTerminalSize(cols, rows)
    const process = this.options.paneControlProcesses.attach({
      paneId,
      sessionName: normalizedSessionName,
      windowIndex,
    }, size)
    const attachment = this.subscribe({
      helperReleased: false,
      label: `tmux pane ${paneId}`,
      paneId,
      process,
      reliableInputTarget: `pane:${paneId}`,
      tmuxTarget: paneId,
    })
    this.attachment = attachment
    const viewport = await this.captureInitialPaneViewport(attachment)
    this.options.send({
      type: 'attached',
      data: `Attached to ${normalizedSessionName}:${windowIndex}.${paneId}.`,
      sessionName: normalizedSessionName,
      windowIndex,
      paneId,
    })
    if (viewport) this.sendPaneViewport(attachment, viewport)
  }

  private spawnAttachment(
    sessionName: string,
    label: string,
    reliableInputTarget: string,
    cols?: number,
    rows?: number,
    helperSessionName?: string,
  ): Attachment {
    const size = parseTerminalSize(cols, rows)
    const process = this.options.attachmentProcesses.attach(sessionName, size)
    return this.subscribe({
      helperReleased: false,
      helperSessionName,
      label,
      process,
      reliableInputTarget,
      tmuxTarget: sessionName,
    })
  }

  private subscribe(attachment: Attachment): Attachment {
    attachment.dataSubscription = attachment.process.onData((data) => {
      if (this.attachment === attachment && !attachment.scrollActive) {
        this.options.send({ type: 'stdout', data })
      }
    })
    attachment.exitSubscription = attachment.process.onExit(({ exitCode, signal }) => {
      void this.handleExit(attachment, signal ?? exitCode)
    })
    return attachment
  }

  private async handleExit(attachment: Attachment, reason: number): Promise<void> {
    if (this.attachment !== attachment) return
    this.attachment = null
    this.disposeSubscriptions(attachment)

    if (attachment.helperSessionName) {
      await this.releaseAttachmentHelper(attachment)
    }

    this.options.send({
      type: 'status',
      data: `Detached from ${attachment.label} (${reason}).`,
    })
  }

  private async writeReliableInput(id: string, data: string): Promise<void> {
    const attachment = this.requireAttachment()
    await this.options.reliableInputs.deliver(id, attachment.reliableInputTarget, async () => {
      if (!attachment.paneId) {
        await this.options.sessions.resetTerminalScroll(attachment.tmuxTarget)
        this.requireCurrentAttachment(attachment, 'reliable input')
      }
      await this.writeInput(attachment, data)
    })

    this.options.send({ type: 'inputAck', data: '', inputId: id })
  }

  private async writeInput(attachment: Attachment, data: string): Promise<void> {
    this.activatePaneAttachment(attachment)
    if (attachment.scrollActive) {
      await this.options.sessions.resetTerminalScroll(attachment.tmuxTarget)
      this.requireCurrentAttachment(attachment, 'terminal scroll reset')
      await this.renderPaneViewport(attachment)
    }
    if (attachment.paneId) {
      await this.options.sessions.sendPaneInput(attachment.paneId, data)
      return
    }
    ;(attachment.process as PtyProcess).write(data)
  }

  private async scrollPane(direction: 'down' | 'up', lineCount?: 1): Promise<void> {
    const attachment = this.requireAttachment()
    if (!attachment.paneId) return
    this.activatePaneAttachment(attachment)
    const handled = await this.options.sessions.prepareTerminalWheel(
      attachment.paneId,
      direction,
      lineCount,
    )
    this.requireCurrentAttachment(attachment, 'pane scroll')
    if (handled) await this.renderPaneViewport(attachment)
  }

  private async renderPaneViewport(attachment: Attachment): Promise<void> {
    if (!attachment.paneId) return
    const viewport = await this.options.sessions.capturePaneViewport(attachment.paneId)
    this.requireCurrentAttachment(attachment, 'pane viewport capture')
    this.sendPaneViewport(attachment, viewport)
  }

  private async captureInitialPaneViewport(attachment: Attachment): Promise<TmuxPaneViewport | null> {
    let viewport: TmuxPaneViewport | null = null
    for (const delay of initialPaneCaptureDelays) {
      if (delay > 0) await (this.options.wait ?? wait)(delay)
      this.requireCurrentAttachment(attachment, 'initial pane viewport capture')
      viewport = await this.options.sessions.capturePaneViewport(attachment.paneId)
      this.requireCurrentAttachment(attachment, 'initial pane viewport capture')
      if (viewport.data.trim()) break
    }
    return viewport
  }

  private activatePaneAttachment(attachment: Attachment): void {
    if (attachment.paneId) {
      ;(attachment.process as TerminalPaneControlProcess).activate()
    }
  }

  private sendPaneViewport(attachment: Attachment, viewport: TmuxPaneViewport): void {
    attachment.scrollActive = viewport.inMode
    const cursor = viewport.inMode || !viewport.cursorVisible
      ? '\x1b[?25l'
      : `\x1b[${viewport.cursorY + 1};${viewport.cursorX + 1}H\x1b[?25h`
    this.options.send({
      type: 'stdout',
      // ED does not reset SGR attributes, while tmux snapshots assume default attributes.
      // Bound the snapshot with resets so dim text and colored backgrounds cannot leak across paints.
      data: `\x1b[0m\x1b[2J\x1b[3J\x1b[H${viewport.data}\x1b[0m${cursor}`,
    })
  }

  private requireCurrentAttachment(attachment: Attachment, operation: string): void {
    if (this.disposed || this.attachment !== attachment) {
      throw new Error(`Terminal attachment changed during ${operation}.`)
    }
  }

  private requireAttachment(): Attachment {
    if (!this.attachment) {
      throw new Error('No active tmux attachment.')
    }
    return this.attachment
  }

  private async detach(): Promise<void> {
    const attachment = this.attachment
    if (!attachment) return

    this.attachment = null
    this.currentSessionName = null
    this.disposeSubscriptions(attachment)
    attachment.process.kill()
    await this.releaseAttachmentHelper(attachment)
  }

  private disposeSubscriptions(attachment: Attachment): void {
    attachment.dataSubscription?.dispose()
    attachment.exitSubscription?.dispose()
    attachment.dataSubscription = undefined
    attachment.exitSubscription = undefined
  }

  private async releaseAttachmentHelper(attachment: Attachment): Promise<void> {
    if (!attachment.helperSessionName || attachment.helperReleased) return
    attachment.helperReleased = true
    await this.releaseHelper(attachment.helperSessionName)
  }

  private async releaseHelper(helperSessionName: string): Promise<void> {
    this.options.onHelperReleased(helperSessionName)
    await this.options.sessions.killBitveinsHelperSession(helperSessionName).catch(() => undefined)
  }

  private sendError(error: unknown): void {
    const data = error instanceof Error
      ? error.message
      : String(error)
    this.options.send({ type: 'error', data })
  }
}
