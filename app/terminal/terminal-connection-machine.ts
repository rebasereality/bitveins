export type TerminalAttachment
  = | { type: 'session', sessionName: string }
    | { type: 'window', sessionName: string, windowIndex: number }
    | { type: 'pane', sessionName: string, windowIndex: number, paneId: string }

export type TerminalConnectionPhase
  = | 'attached'
    | 'attaching'
    | 'connecting'
    | 'detached'
    | 'disposed'
    | 'offline'
    | 'reconnecting'

type TransportStatus = 'connecting' | 'none' | 'open'

export interface TerminalConnectionSnapshot {
  attachment: TerminalAttachment | null
  label: string
  phase: TerminalConnectionPhase
  reconnectAttempts: number
  transportId: number | null
  transportStatus: TransportStatus
}

export type TerminalConnectionEvent
  = | { type: 'attachmentConfirmed', sessionName: string, transportId: number, windowIndex?: number, paneId?: string }
    | { type: 'attachmentRequested', attachment: TerminalAttachment, online: boolean }
    | { type: 'attachmentTimeout', online: boolean, transportId: number }
    | { type: 'authExpired' }
    | { type: 'detachRequested' }
    | { type: 'disposeRequested' }
    | { type: 'offline' }
    | { type: 'recover', online: boolean }
    | { type: 'reconnectTimerFired', online: boolean }
    | { type: 'transportFailed', checkAuthentication?: boolean, online: boolean, transportId: number }
    | { type: 'transportOpened', transportId: number }

export type TerminalConnectionEffect
  = | { type: 'attachmentReady' }
    | { type: 'beginAttachment' }
    | { type: 'cancelAttachTimeout' }
    | { type: 'cancelReconnect' }
    | { type: 'checkAuthentication' }
    | { type: 'closeTransport', transportId: number }
    | { type: 'flushReliableInput' }
    | { type: 'openTransport', transportId: number }
    | { type: 'resetReliableInput' }
    | { type: 'scheduleAttachTimeout', transportId: number }
    | { type: 'scheduleReconnect', delayMs: number }
    | { type: 'sendAttach', transportId: number }
    | { type: 'sendDetach', transportId: number }

const RECONNECT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000]

export class TerminalConnectionMachine {
  private state: TerminalConnectionSnapshot = {
    attachment: null,
    label: 'Detached',
    phase: 'detached',
    reconnectAttempts: 0,
    transportId: null,
    transportStatus: 'none',
  }

  private nextTransportId = 1

  get snapshot(): Readonly<TerminalConnectionSnapshot> {
    return this.state
  }

  dispatch(event: TerminalConnectionEvent): TerminalConnectionEffect[] {
    if (this.state.phase === 'disposed' && event.type !== 'disposeRequested') {
      return []
    }

    switch (event.type) {
      case 'attachmentRequested':
        return this.requestAttachment(event.attachment, event.online)
      case 'transportOpened':
        return this.opened(event.transportId)
      case 'attachmentConfirmed':
        return this.confirmAttachment(event)
      case 'transportFailed':
        return this.failTransport(event)
      case 'attachmentTimeout':
        return this.failTransport({
          type: 'transportFailed',
          online: event.online,
          transportId: event.transportId,
        })
      case 'reconnectTimerFired':
        return this.reconnect(event.online)
      case 'offline':
        return this.goOffline()
      case 'recover':
        return this.recover(event.online)
      case 'authExpired':
        return this.expireAuthentication()
      case 'detachRequested':
        return this.detach(false)
      case 'disposeRequested':
        return this.detach(true)
    }
  }

  private requestAttachment(
    attachment: TerminalAttachment,
    online: boolean,
  ): TerminalConnectionEffect[] {
    this.state = {
      ...this.state,
      attachment,
      reconnectAttempts: 0,
    }

    if (!online) {
      return this.goOffline()
    }

    if (this.state.transportStatus === 'open' && this.state.transportId !== null) {
      const transportId = this.state.transportId
      this.state = { ...this.state, label: 'Attaching terminal…', phase: 'attaching' }
      return [
        { type: 'cancelAttachTimeout' },
        { type: 'beginAttachment' },
        { type: 'scheduleAttachTimeout', transportId },
        { type: 'sendAttach', transportId },
      ]
    }

    if (this.state.transportStatus === 'connecting') {
      return []
    }

    return this.openTransport(false)
  }

  private opened(transportId: number): TerminalConnectionEffect[] {
    if (!this.isCurrentTransport(transportId) || this.state.transportStatus !== 'connecting') {
      return []
    }

    this.state = {
      ...this.state,
      label: 'Attaching terminal…',
      phase: 'attaching',
      transportStatus: 'open',
    }
    return [
      { type: 'beginAttachment' },
      { type: 'scheduleAttachTimeout', transportId },
      { type: 'sendAttach', transportId },
    ]
  }

  private confirmAttachment(
    event: Extract<TerminalConnectionEvent, { type: 'attachmentConfirmed' }>,
  ): TerminalConnectionEffect[] {
    if (
      !this.isCurrentTransport(event.transportId)
      || this.state.transportStatus !== 'open'
      || !this.matchesAttachment(event.sessionName, event.windowIndex, event.paneId)
    ) {
      return []
    }

    this.state = {
      ...this.state,
      label: 'Connected',
      phase: 'attached',
      reconnectAttempts: 0,
    }
    return [
      { type: 'cancelAttachTimeout' },
      { type: 'attachmentReady' },
      { type: 'flushReliableInput' },
    ]
  }

  private failTransport(
    event: Extract<TerminalConnectionEvent, { type: 'transportFailed' }>,
  ): TerminalConnectionEffect[] {
    if (!this.isCurrentTransport(event.transportId)) {
      return []
    }

    const effects: TerminalConnectionEffect[] = [
      { type: 'cancelAttachTimeout' },
      { type: 'closeTransport', transportId: event.transportId },
      { type: 'resetReliableInput' },
    ]
    if (event.checkAuthentication) {
      effects.push({ type: 'checkAuthentication' })
    }

    this.state = {
      ...this.state,
      transportId: null,
      transportStatus: 'none',
    }

    if (!this.state.attachment) {
      this.state = { ...this.state, label: 'Detached', phase: 'detached' }
      return effects
    }
    if (!event.online) {
      this.state = { ...this.state, label: 'Offline — waiting for network', phase: 'offline' }
      effects.push({ type: 'cancelReconnect' })
      return effects
    }

    const delay = this.nextReconnectDelay()
    this.state = {
      ...this.state,
      label: `Reconnecting in ${Math.round(delay / 1000)}s…`,
      phase: 'reconnecting',
    }
    effects.push({ type: 'scheduleReconnect', delayMs: delay })
    return effects
  }

  private reconnect(online: boolean): TerminalConnectionEffect[] {
    if (!this.state.attachment || this.state.transportStatus !== 'none') {
      return []
    }
    if (!online) {
      return this.goOffline()
    }
    return this.openTransport(true)
  }

  private recover(online: boolean): TerminalConnectionEffect[] {
    if (!this.state.attachment || this.state.transportStatus !== 'none') {
      return []
    }
    if (!online) {
      return this.goOffline()
    }
    this.state = { ...this.state, reconnectAttempts: 0 }
    return this.openTransport(false)
  }

  private goOffline(): TerminalConnectionEffect[] {
    const effects: TerminalConnectionEffect[] = [
      { type: 'cancelAttachTimeout' },
      { type: 'cancelReconnect' },
      { type: 'resetReliableInput' },
    ]
    if (this.state.transportId !== null) {
      effects.push({ type: 'closeTransport', transportId: this.state.transportId })
    }
    this.state = {
      ...this.state,
      label: this.state.attachment ? 'Offline — waiting for network' : 'Detached',
      phase: this.state.attachment ? 'offline' : 'detached',
      transportId: null,
      transportStatus: 'none',
    }
    return effects
  }

  private expireAuthentication(): TerminalConnectionEffect[] {
    const effects = this.detach(false)
    this.state = { ...this.state, label: 'Unlock required' }
    return effects
  }

  private detach(dispose: boolean): TerminalConnectionEffect[] {
    const effects: TerminalConnectionEffect[] = [
      { type: 'cancelAttachTimeout' },
      { type: 'cancelReconnect' },
      { type: 'resetReliableInput' },
    ]
    if (this.state.transportId !== null) {
      if (this.state.transportStatus === 'open' && !dispose) {
        effects.push({ type: 'sendDetach', transportId: this.state.transportId })
      }
      effects.push({ type: 'closeTransport', transportId: this.state.transportId })
    }
    this.state = {
      attachment: null,
      label: 'Detached',
      phase: dispose ? 'disposed' : 'detached',
      reconnectAttempts: 0,
      transportId: null,
      transportStatus: 'none',
    }
    return effects
  }

  private openTransport(reconnecting: boolean): TerminalConnectionEffect[] {
    const transportId = this.nextTransportId++
    this.state = {
      ...this.state,
      label: reconnecting ? 'Reconnecting…' : 'Connecting…',
      phase: reconnecting ? 'reconnecting' : 'connecting',
      transportId,
      transportStatus: 'connecting',
    }
    return [
      { type: 'cancelReconnect' },
      { type: 'openTransport', transportId },
    ]
  }

  private nextReconnectDelay(): number {
    const delay = RECONNECT_BACKOFF_MS[
      Math.min(this.state.reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)
    ] ?? 16_000
    this.state = {
      ...this.state,
      reconnectAttempts: this.state.reconnectAttempts + 1,
    }
    return delay
  }

  private isCurrentTransport(transportId: number): boolean {
    return this.state.transportId === transportId
  }

  private matchesAttachment(sessionName: string, windowIndex?: number, paneId?: string): boolean {
    const attachment = this.state.attachment
    if (!attachment || attachment.sessionName !== sessionName) return false
    if (attachment.type === 'session') return true
    if (attachment.windowIndex !== windowIndex) return false
    return attachment.type === 'window' || attachment.paneId === paneId
  }
}
