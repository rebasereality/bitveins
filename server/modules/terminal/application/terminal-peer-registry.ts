import type { ServerMessage } from '#shared/contracts/terminal'

export interface TerminalPeer {
  send(data: string): void
}

export interface ManagedTerminalPeerSession {
  dispose(): Promise<void>
  enqueue(rawMessage: string): Promise<void>
  sendHeartbeat(): void
}

interface TerminalPeerRegistryOptions<Peer extends TerminalPeer> {
  createSession(peer: Peer, helperLifecycle: {
    activated(name: string): void
    released(name: string): void
  }): ManagedTerminalPeerSession
  sessions: {
    killStaleBitveinsHelpers(activeHelpers?: ReadonlySet<string>): Promise<void>
  }
}

export class TerminalPeerRegistry<Peer extends TerminalPeer> {
  private readonly activeHelpers = new Set<string>()
  private readonly activePeers = new Set<Peer>()
  private readonly peerSessions = new WeakMap<Peer, ManagedTerminalPeerSession>()

  constructor(private readonly options: TerminalPeerRegistryOptions<Peer>) {}

  open(peer: Peer): void {
    if (this.peerSessions.has(peer)) return

    this.activePeers.add(peer)
    this.peerSessions.set(peer, this.options.createSession(peer, {
      activated: name => this.activeHelpers.add(name),
      released: name => this.activeHelpers.delete(name),
    }))
  }

  message(peer: Peer, rawMessage: string): Promise<void> {
    return this.requireSession(peer).enqueue(rawMessage)
  }

  async close(peer: Peer): Promise<void> {
    this.activePeers.delete(peer)
    const session = this.peerSessions.get(peer)
    this.peerSessions.delete(peer)
    await session?.dispose()
  }

  async fail(peer: Peer, error: Error): Promise<void> {
    this.send(peer, { type: 'error', data: error.message })
    await this.close(peer)
  }

  heartbeat(): void {
    for (const peer of this.activePeers) {
      this.peerSessions.get(peer)?.sendHeartbeat()
    }
  }

  cleanupStaleHelpers(): Promise<void> {
    return this.options.sessions.killStaleBitveinsHelpers(this.activeHelpers)
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.activePeers].map(peer => this.close(peer)))
  }

  private requireSession(peer: Peer): ManagedTerminalPeerSession {
    const session = this.peerSessions.get(peer)
    if (!session) {
      throw new Error('WebSocket peer is not open.')
    }
    return session
  }

  private send(peer: Peer, message: ServerMessage): void {
    try {
      peer.send(JSON.stringify(message))
    }
    catch {
      // The peer may already be closed.
    }
  }
}
