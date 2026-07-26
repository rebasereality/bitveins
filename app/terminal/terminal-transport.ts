import type { ClientMessage, ServerMessage } from '#shared/contracts/terminal'

export interface TerminalTransport {
  close(): void
  send(message: ClientMessage): void
}

export interface TerminalTransportHandlers {
  onClose(): void
  onError(): void
  onMessage(message: ServerMessage): void
  onOpen(): void
  onProtocolError(): void
}

export interface TerminalTransportFactory {
  create(handlers: TerminalTransportHandlers): TerminalTransport
}
