import { describe, expect, it, vi } from 'vitest'
import {
  TerminalPeerRegistry,
  type ManagedTerminalPeerSession,
  type TerminalPeer,
} from '../../../../../server/modules/terminal/application/terminal-peer-registry'

class FakePeer implements TerminalPeer {
  readonly sent: string[] = []

  send(data: string): void {
    this.sent.push(data)
  }
}

class FakeManagedSession implements ManagedTerminalPeerSession {
  dispose = vi.fn(async () => {})
  enqueue = vi.fn(async () => {})
  sendHeartbeat = vi.fn()
}

function setup() {
  const managedSessions: FakeManagedSession[] = []
  const lifecycles: Array<{
    activated(name: string): void
    released(name: string): void
  }> = []
  const killStaleBitveinsHelpers = vi.fn(async () => {})
  const registry = new TerminalPeerRegistry<FakePeer>({
    createSession(_peer, lifecycle) {
      const session = new FakeManagedSession()
      managedSessions.push(session)
      lifecycles.push(lifecycle)
      return session
    },
    sessions: { killStaleBitveinsHelpers },
  })
  return {
    killStaleBitveinsHelpers,
    lifecycles,
    managedSessions,
    registry,
  }
}

describe('TerminalPeerRegistry', () => {
  it('creates one managed session per peer and delegates ordered messages', async () => {
    const context = setup()
    const peer = new FakePeer()

    context.registry.open(peer)
    context.registry.open(peer)
    await context.registry.message(peer, '{"action":"ping"}')

    expect(context.managedSessions).toHaveLength(1)
    expect(context.managedSessions[0]?.enqueue).toHaveBeenCalledWith('{"action":"ping"}')
  })

  it('broadcasts heartbeat only to active peers', async () => {
    const context = setup()
    const first = new FakePeer()
    const second = new FakePeer()
    context.registry.open(first)
    context.registry.open(second)

    context.registry.heartbeat()
    await context.registry.close(first)
    context.registry.heartbeat()

    expect(context.managedSessions[0]?.sendHeartbeat).toHaveBeenCalledTimes(1)
    expect(context.managedSessions[1]?.sendHeartbeat).toHaveBeenCalledTimes(2)
    expect(context.managedSessions[0]?.dispose).toHaveBeenCalledOnce()
  })

  it('broadcasts a typed attention event once to every active peer', async () => {
    const context = setup()
    const first = new FakePeer()
    const second = new FakePeer()
    context.registry.open(first)
    context.registry.open(second)
    await context.registry.close(second)

    context.registry.broadcastAttention({
      createdAt: '2026-08-03T12:00:00.000Z',
      id: 'evt_123456789012',
      source: 'codex',
      title: 'Completed',
      type: 'completed',
    })

    expect(first.sent.map(message => JSON.parse(message))).toContainEqual({
      type: 'attentionEvent',
      event: expect.objectContaining({ id: 'evt_123456789012' }),
    })
    expect(second.sent).toEqual([])
  })

  it('tracks the exact active helper set used by cleanup', async () => {
    const context = setup()
    const peer = new FakePeer()
    context.registry.open(peer)
    context.lifecycles[0]?.activated('_bitveins_active')
    context.lifecycles[0]?.activated('_bitveins_released')
    context.lifecycles[0]?.released('_bitveins_released')

    await context.registry.cleanupStaleHelpers()

    expect(context.killStaleBitveinsHelpers).toHaveBeenCalledOnce()
    const activeHelpers = context.killStaleBitveinsHelpers.mock.calls[0]?.[0]
    expect([...activeHelpers!]).toEqual(['_bitveins_active'])
  })

  it('sends an error before disposing a failed peer', async () => {
    const context = setup()
    const peer = new FakePeer()
    context.registry.open(peer)

    await context.registry.fail(peer, new Error('broken'))

    expect(JSON.parse(peer.sent[0]!)).toEqual({ type: 'error', data: 'broken' })
    expect(context.managedSessions[0]?.dispose).toHaveBeenCalledOnce()
  })

  it('rejects messages for peers that were never opened', async () => {
    const context = setup()
    expect(() => context.registry.message(new FakePeer(), 'message'))
      .toThrow('WebSocket peer is not open.')
  })

  it('disposes all active peers and tolerates repeated close', async () => {
    const context = setup()
    const first = new FakePeer()
    const second = new FakePeer()
    context.registry.open(first)
    context.registry.open(second)

    await context.registry.dispose()
    await context.registry.close(first)

    expect(context.managedSessions[0]?.dispose).toHaveBeenCalledOnce()
    expect(context.managedSessions[1]?.dispose).toHaveBeenCalledOnce()
  })
})
