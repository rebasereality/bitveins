import { Buffer } from 'node:buffer'
import type { ClientMessage, ServerMessage } from '#shared/contracts/terminal'
import { parseClientMessage, parseTerminalSize } from '#shared/contracts/terminal'
import { normalizeSessionName } from '../../sessions/model/session-validation'
import type { Disposable, PtyProcess } from '../ports/pty-factory'
import type { TerminalAttachmentProcessFactory } from '../ports/terminal-attachment-process-factory'

interface ReliableInputDeduplicator {
  deliver(
    id: string,
    target: string,
    operation: () => Promise<void> | void,
  ): Promise<void>
}

interface TerminalSessionOperations {
  createWindow(name: string): Promise<unknown>
  createWindowClientSession(name: string, index: unknown): Promise<{
    helperSessionName: string
    sessionName: string
    windowIndex: number
  }>
  killBitveinsHelperSession(name: string): Promise<void>
  killWindow(name: string, index: unknown): Promise<void>
  prepareTerminalWheel(sessionName: string, direction: 'down' | 'up', lineCount?: 1): Promise<boolean>
  resetTerminalScroll(sessionName: string): Promise<void>
  selectWindow(name: string, index: unknown): Promise<void>
}

interface TerminalPeerSessionOptions {
  attachmentProcesses: TerminalAttachmentProcessFactory
  onHelperActivated: (name: string) => void
  onHelperReleased: (name: string) => void
  reliableInputs: ReliableInputDeduplicator
  send: (message: ServerMessage) => void
  sessions: TerminalSessionOperations
}

interface Attachment {
  dataSubscription?: Disposable
  exitSubscription?: Disposable
  helperReleased: boolean
  helperSessionName?: string
  label: string
  pty: PtyProcess
  reliableInputTarget: string
  tmuxTarget: string
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
        )
        return
      case 'attachWindow':
        await this.attachWindow(
          message.payload.sessionName,
          message.payload.windowIndex,
          message.payload.cols,
          message.payload.rows,
        )
        return
      case 'input':
        this.requireAttachment().pty.write(message.payload.data)
        return
      case 'wheelInput': {
        const attachment = this.requireAttachment()
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
          attachment.pty.write(binary
            ? Buffer.from(message.payload.data, 'binary')
            : message.payload.data)
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
          attachment.pty.resize(size.cols, size.rows)
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

  private async attachSession(sessionName: string, cols?: number, rows?: number): Promise<void> {
    await this.detach()
    const normalizedSessionName = normalizeSessionName(sessionName)
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
  ): Promise<void> {
    await this.detach()
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

  private spawnAttachment(
    sessionName: string,
    label: string,
    reliableInputTarget: string,
    cols?: number,
    rows?: number,
    helperSessionName?: string,
  ): Attachment {
    const size = parseTerminalSize(cols, rows)
    const pty = this.options.attachmentProcesses.attach(sessionName, size)
    const attachment: Attachment = {
      helperReleased: false,
      helperSessionName,
      label,
      pty,
      reliableInputTarget,
      tmuxTarget: sessionName,
    }
    attachment.dataSubscription = pty.onData((data) => {
      if (this.attachment === attachment) {
        this.options.send({ type: 'stdout', data })
      }
    })
    attachment.exitSubscription = pty.onExit(({ exitCode, signal }) => {
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
      await this.options.sessions.resetTerminalScroll(attachment.tmuxTarget)
      this.requireCurrentAttachment(attachment, 'reliable input')
      attachment.pty.write(data)
    })

    this.options.send({ type: 'inputAck', data: '', inputId: id })
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
    this.disposeSubscriptions(attachment)
    attachment.pty.kill()
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
