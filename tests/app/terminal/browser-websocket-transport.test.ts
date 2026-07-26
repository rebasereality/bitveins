// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BrowserWebSocketTransport,
  BrowserWebSocketTransportFactory,
} from '../../../app/terminal/browser-websocket-transport'
import type { TerminalTransportHandlers } from '../../../app/terminal/terminal-transport'

class FakeWebSocket {
  readonly OPEN = 1
  private readonly activeListeners = new Map<string, Set<EventListener>>()
  private readonly capturedListeners = new Map<string, EventListener>()
  closeCount = 0
  readyState = this.OPEN
  readonly sent: string[] = []

  constructor(readonly url = '/ws') {}

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.activeListeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.activeListeners.set(type, listeners)
    this.capturedListeners.set(type, listener)
  }

  close(): void {
    this.closeCount += 1
    this.readyState = 3
  }

  dispatchEvent(event: Event): void {
    for (const listener of this.activeListeners.get(event.type) ?? []) {
      listener(event)
    }
  }

  invokeCaptured(type: string, event: Event): void {
    this.capturedListeners.get(type)?.(event)
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.activeListeners.get(type)?.delete(listener)
  }

  send(data: string): void {
    this.sent.push(data)
  }
}

function setup() {
  const socket = new FakeWebSocket()
  const handlers: TerminalTransportHandlers = {
    onClose: vi.fn(),
    onError: vi.fn(),
    onMessage: vi.fn(),
    onOpen: vi.fn(),
    onProtocolError: vi.fn(),
  }
  const transport = new BrowserWebSocketTransport(
    socket,
    handlers,
  )
  return { handlers, socket, transport }
}

describe('BrowserWebSocketTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('serializes typed messages after the browser opens the socket', () => {
    const { handlers, socket, transport } = setup()
    socket.dispatchEvent(new Event('open'))
    transport.send({ action: 'ping' })

    expect(handlers.onOpen).toHaveBeenCalledOnce()
    expect(socket.sent).toEqual([JSON.stringify({ action: 'ping' })])
  })

  it('parses valid server messages and rejects malformed payloads', () => {
    const { handlers, socket } = setup()
    socket.dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({ type: 'stdout', data: 'hello' }),
    }))
    socket.dispatchEvent(new MessageEvent('message', { data: '{invalid' }))

    expect(handlers.onMessage).toHaveBeenCalledWith({
      type: 'stdout',
      data: 'hello',
    })
    expect(handlers.onProtocolError).toHaveBeenCalledOnce()
  })

  it('forwards browser errors and remote close exactly once', () => {
    const { handlers, socket } = setup()
    socket.dispatchEvent(new Event('error'))
    socket.dispatchEvent(new Event('close'))
    socket.dispatchEvent(new Event('close'))

    expect(handlers.onError).toHaveBeenCalledOnce()
    expect(handlers.onClose).toHaveBeenCalledOnce()
  })

  it('removes listeners and rejects sends after an intentional close', () => {
    const { handlers, socket, transport } = setup()
    transport.close()
    transport.close()
    socket.dispatchEvent(new Event('open'))

    expect(socket.closeCount).toBe(1)
    expect(handlers.onOpen).not.toHaveBeenCalled()
    expect(() => transport.send({ action: 'ping' })).toThrow('WebSocket is not open.')
  })

  it('ignores browser callbacks that were already queued before close', () => {
    const { handlers, socket, transport } = setup()
    transport.close()

    socket.invokeCaptured('open', new Event('open'))
    socket.invokeCaptured('message', new MessageEvent('message', {
      data: JSON.stringify({ type: 'stdout', data: 'late' }),
    }))
    socket.invokeCaptured('error', new Event('error'))
    socket.invokeCaptured('close', new Event('close'))

    expect(handlers.onOpen).not.toHaveBeenCalled()
    expect(handlers.onMessage).not.toHaveBeenCalled()
    expect(handlers.onError).not.toHaveBeenCalled()
    expect(handlers.onClose).not.toHaveBeenCalled()
  })

  it('creates sockets from both an injected and the browser constructor', () => {
    const handlers: TerminalTransportHandlers = {
      onClose: vi.fn(),
      onError: vi.fn(),
      onMessage: vi.fn(),
      onOpen: vi.fn(),
      onProtocolError: vi.fn(),
    }
    const injected = new BrowserWebSocketTransportFactory(() => '/injected', FakeWebSocket)
    const browser = new BrowserWebSocketTransportFactory(() => '/browser')
    vi.stubGlobal('WebSocket', FakeWebSocket)

    const first = injected.create(handlers)
    const second = browser.create(handlers)

    expect(first).toBeInstanceOf(BrowserWebSocketTransport)
    expect(second).toBeInstanceOf(BrowserWebSocketTransport)
    first.close()
    second.close()
    vi.unstubAllGlobals()
  })
})
