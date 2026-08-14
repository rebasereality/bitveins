import type { ClientMessage } from '#shared/contracts/terminal'
import { parseServerMessage } from '#shared/contracts/terminal'
import type {
  TerminalTransport,
  TerminalTransportFactory,
  TerminalTransportHandlers,
} from './terminal-transport'

interface BrowserSocket {
  readonly OPEN: number
  readonly readyState: number
  addEventListener(type: string, listener: EventListener): void
  close(): void
  removeEventListener(type: string, listener: EventListener): void
  send(data: string): void
}

type WebSocketConstructor = new (url: string) => BrowserSocket

export class BrowserWebSocketTransport implements TerminalTransport {
  private disposed = false

  constructor(
    private readonly socket: BrowserSocket,
    private readonly handlers: TerminalTransportHandlers,
  ) {
    socket.addEventListener('open', this.handleOpen)
    socket.addEventListener('message', this.handleMessage)
    socket.addEventListener('close', this.handleClose)
    socket.addEventListener('error', this.handleError)
  }

  send(message: ClientMessage): void {
    if (this.disposed || this.socket.readyState !== this.socket.OPEN) {
      throw new Error('WebSocket is not open.')
    }
    this.socket.send(JSON.stringify(message))
  }

  close(): void {
    if (this.disposed) return
    this.disposed = true
    this.removeListeners()
    this.socket.close()
  }

  private readonly handleOpen = (): void => {
    if (this.disposed) return
    this.handlers.onOpen()
  }

  private readonly handleMessage = (event: Event): void => {
    if (this.disposed) return

    try {
      const data = event instanceof MessageEvent ? event.data : undefined
      const message = parseServerMessage(String(data))
      if (message.type === 'attentionEvent') {
        window.dispatchEvent(new CustomEvent('bitveins:attention-event', {
          detail: message.event,
        }))
        return
      }
      if (message.type === 'promptDraft') {
        window.dispatchEvent(new CustomEvent('bitveins:prompt-draft', {
          detail: message,
        }))
        return
      }
      if (message.type === 'promptDraftCleared') {
        window.dispatchEvent(new CustomEvent('bitveins:prompt-draft-cleared', {
          detail: message,
        }))
        return
      }
      if (message.type === 'promptFocusClaimed') {
        window.dispatchEvent(new CustomEvent('bitveins:prompt-focus-claimed', {
          detail: message,
        }))
        return
      }
      if (message.type === 'promptFocusReleased') {
        window.dispatchEvent(new CustomEvent('bitveins:prompt-focus-released', {
          detail: message,
        }))
        return
      }
      this.handlers.onMessage(message)
    }
    catch {
      this.handlers.onProtocolError()
    }
  }

  private readonly handleClose = (): void => {
    if (this.disposed) return
    this.disposed = true
    this.removeListeners()
    this.handlers.onClose()
  }

  private readonly handleError = (): void => {
    if (!this.disposed) {
      this.handlers.onError()
    }
  }

  private removeListeners(): void {
    this.socket.removeEventListener('open', this.handleOpen)
    this.socket.removeEventListener('message', this.handleMessage)
    this.socket.removeEventListener('close', this.handleClose)
    this.socket.removeEventListener('error', this.handleError)
  }
}

export class BrowserWebSocketTransportFactory implements TerminalTransportFactory {
  constructor(
    private readonly url: () => string,
    private readonly WebSocketClass?: WebSocketConstructor,
  ) {}

  create(handlers: TerminalTransportHandlers): TerminalTransport {
    const WebSocketImplementation = this.WebSocketClass ?? WebSocket
    return new BrowserWebSocketTransport(
      new WebSocketImplementation(this.url()),
      handlers,
    )
  }
}
