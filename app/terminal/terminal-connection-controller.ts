import type { ClientMessage, ServerMessage } from '#shared/contracts/terminal'
import type {
  ConnectionEnvironment,
  EnvironmentSubscription,
} from './connection-environment'
import { ConnectionWatchdog } from './connection-watchdog'
import type { ScheduledTask, Scheduler } from './scheduler'
import {
  TerminalConnectionMachine,
  type TerminalAttachment,
  type TerminalConnectionEffect,
  type TerminalConnectionEvent,
  type TerminalConnectionPhase,
} from './terminal-connection-machine'
import type { TerminalTransport, TerminalTransportFactory } from './terminal-transport'

interface TerminalConnectionControllerOptions {
  clock?: () => number
  environment: ConnectionEnvironment
  getSize: () => { cols?: number, rows?: number }
  onAttachmentBegin: () => void
  onAttachmentReady: () => void
  onCheckAuthentication: () => void
  onInputAcknowledged: (inputId: string) => void
  onOutput: (data: string) => void
  onReliableInputFlush: () => void
  onReliableInputReset: () => void
  onStateChange: (phase: Exclude<TerminalConnectionPhase, 'disposed'>, label: string) => void
  onStatus: (message: string, error: boolean) => void
  scheduler: Scheduler
  transportFactory: TerminalTransportFactory
}

interface ActiveTransport {
  id: number
  opened: boolean
  transport: TerminalTransport
}

const CONNECTION_STALE_MS = 45_000
const RESPONSE_TIMEOUT_MS = 8_000

export class TerminalConnectionController {
  private activeTransport: ActiveTransport | null = null
  private attachTask: ScheduledTask | null = null
  private readonly environmentSubscription: EnvironmentSubscription
  private lastResize: { cols: number, rows: number } | null = null
  private readonly machine = new TerminalConnectionMachine()
  private reconnectTask: ScheduledTask | null = null
  private readonly watchdog: ConnectionWatchdog

  constructor(private readonly options: TerminalConnectionControllerOptions) {
    this.watchdog = new ConnectionWatchdog({
      clock: options.clock,
      onTimeout: () => this.failCurrentTransport(),
      scheduler: options.scheduler,
      staleMs: CONNECTION_STALE_MS,
      timeoutMs: RESPONSE_TIMEOUT_MS,
    })
    this.environmentSubscription = options.environment.subscribe((event) => {
      if (event === 'offline') {
        this.transition({ type: 'offline' })
        return
      }
      this.checkConnection()
    })
    this.publishState()
  }

  get isAttached(): boolean {
    return this.machine.snapshot.phase === 'attached'
  }

  attach(sessionName: string): void {
    this.requestAttachment({ type: 'session', sessionName })
  }

  attachWindow(sessionName: string, windowIndex: number): void {
    this.requestAttachment({ type: 'window', sessionName, windowIndex })
  }

  detach(): void {
    this.lastResize = null
    this.transition({ type: 'detachRequested' })
  }

  authExpired(): void {
    this.transition({ type: 'authExpired' })
  }

  dispose(): void {
    if (this.machine.snapshot.phase === 'disposed') return
    this.transition({ type: 'disposeRequested' })
    this.environmentSubscription.dispose()
    this.watchdog.dispose()
  }

  sendInput(data: string): boolean {
    if (!this.isAttached || this.watchdog.isStale()) {
      this.probe()
      return false
    }
    return this.sendMessage({ action: 'input', payload: { data } })
  }

  sendWheelInput(data: string, encoding: 'binary' | 'utf8' = 'utf8'): boolean {
    if (!this.isAttached || this.watchdog.isStale()) {
      this.probe()
      return false
    }
    return this.sendMessage({ action: 'wheelInput', payload: { data, encoding } })
  }

  reportConnectionFailure(): void {
    this.failCurrentTransport()
  }

  sendMessage(message: ClientMessage): boolean {
    const current = this.activeTransport
    if (!current || this.machine.snapshot.transportStatus !== 'open') {
      return false
    }

    try {
      current.transport.send(message)
      return true
    }
    catch {
      this.transition({
        type: 'transportFailed',
        online: this.options.environment.isOnline(),
        transportId: current.id,
      })
      return false
    }
  }

  resize(cols: number, rows: number): void {
    const nextResize = { cols, rows }
    if (this.lastResize?.cols === cols && this.lastResize.rows === rows) return
    this.lastResize = nextResize
    if (this.isAttached) {
      this.sendMessage({ action: 'resize', payload: nextResize })
    }
  }

  selectWindow(sessionName: string, index: number): void {
    if (this.isAttached) {
      this.sendMessage({ action: 'selectWindow', payload: { sessionName, index } })
    }
  }

  newWindow(sessionName: string): void {
    if (this.isAttached) {
      this.sendMessage({ action: 'newWindow', payload: { sessionName } })
    }
  }

  killWindow(sessionName: string, index: number): void {
    if (this.isAttached) {
      this.sendMessage({ action: 'killWindow', payload: { sessionName, index } })
    }
  }

  private requestAttachment(attachment: TerminalAttachment): void {
    this.lastResize = null
    this.transition({
      type: 'attachmentRequested',
      attachment,
      online: this.options.environment.isOnline(),
    })
  }

  private transition(event: TerminalConnectionEvent): void {
    const effects = this.machine.dispatch(event)
    this.publishState()
    this.execute(effects)
  }

  private execute(effects: readonly TerminalConnectionEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case 'attachmentReady':
          this.options.onAttachmentReady()
          break
        case 'beginAttachment':
          this.options.onAttachmentBegin()
          break
        case 'cancelAttachTimeout':
          this.cancelAttachTimeout()
          break
        case 'cancelReconnect':
          this.cancelReconnect()
          break
        case 'checkAuthentication':
          this.options.onCheckAuthentication()
          break
        case 'closeTransport':
          this.closeTransport(effect.transportId)
          break
        case 'flushReliableInput':
          this.options.onReliableInputFlush()
          break
        case 'openTransport':
          this.openTransport(effect.transportId)
          break
        case 'resetReliableInput':
          this.options.onReliableInputReset()
          break
        case 'scheduleAttachTimeout':
          this.scheduleAttachTimeout(effect.transportId)
          break
        case 'scheduleReconnect':
          this.scheduleReconnect(effect.delayMs)
          break
        case 'sendAttach':
          this.sendAttachment(effect.transportId)
          break
        case 'sendDetach':
          this.sendToTransport(effect.transportId, { action: 'detach' })
          break
      }
    }
  }

  private openTransport(transportId: number): void {
    try {
      const transport = this.options.transportFactory.create({
        onClose: () => this.handleTransportFailure(transportId, true),
        onError: () => this.handleTransportFailure(transportId, true),
        onMessage: message => this.handleMessage(transportId, message),
        onOpen: () => this.handleTransportOpen(transportId),
        onProtocolError: () => this.handleTransportFailure(transportId),
      })
      this.activeTransport = { id: transportId, opened: false, transport }
    }
    catch {
      this.transition({
        type: 'transportFailed',
        checkAuthentication: true,
        online: this.options.environment.isOnline(),
        transportId,
      })
    }
  }

  private handleTransportOpen(transportId: number): void {
    const current = this.activeTransport
    if (!current || current.id !== transportId) return
    current.opened = true
    this.watchdog.activity()
    this.transition({ type: 'transportOpened', transportId })
  }

  private handleTransportFailure(
    transportId: number,
    checkAuthentication = false,
  ): void {
    const current = this.activeTransport
    if (!current || current.id !== transportId) return
    this.transition({
      type: 'transportFailed',
      checkAuthentication: checkAuthentication && !current.opened,
      online: this.options.environment.isOnline(),
      transportId,
    })
  }

  private handleMessage(transportId: number, message: ServerMessage): void {
    if (this.activeTransport?.id !== transportId) return
    this.watchdog.activity()

    if (
      message.type === 'attentionEvent'
      || message.type === 'heartbeat'
      || message.type === 'pong'
    ) return
    if (message.type === 'attached') {
      this.lastResize = null
      this.transition({
        type: 'attachmentConfirmed',
        sessionName: message.sessionName,
        transportId,
        windowIndex: message.windowIndex,
      })
      return
    }
    if (message.type === 'inputAck') {
      this.options.onInputAcknowledged(message.inputId)
      return
    }
    if (message.type === 'stdout') {
      this.options.onOutput(message.data)
      return
    }
    this.options.onStatus(message.data, message.type === 'error')
  }

  private sendAttachment(transportId: number): void {
    const attachment = this.machine.snapshot.attachment
    if (!attachment) return
    const size = this.options.getSize()
    const message: ClientMessage = attachment.type === 'window'
      ? {
          action: 'attachWindow',
          payload: {
            sessionName: attachment.sessionName,
            windowIndex: attachment.windowIndex,
            ...size,
          },
        }
      : {
          action: 'attach',
          payload: {
            sessionName: attachment.sessionName,
            ...size,
          },
        }
    this.sendToTransport(transportId, message)
  }

  private sendToTransport(transportId: number, message: ClientMessage): boolean {
    const current = this.activeTransport
    if (!current || current.id !== transportId) return false

    try {
      current.transport.send(message)
      return true
    }
    catch {
      this.handleTransportFailure(transportId)
      return false
    }
  }

  private closeTransport(transportId: number): void {
    const current = this.activeTransport
    if (!current || current.id !== transportId) return
    this.activeTransport = null
    current.transport.close()
    this.watchdog.reset()
  }

  private scheduleAttachTimeout(transportId: number): void {
    this.cancelAttachTimeout()
    this.attachTask = this.options.scheduler.schedule(() => {
      this.attachTask = null
      this.transition({
        type: 'attachmentTimeout',
        online: this.options.environment.isOnline(),
        transportId,
      })
    }, RESPONSE_TIMEOUT_MS)
  }

  private cancelAttachTimeout(): void {
    this.attachTask?.cancel()
    this.attachTask = null
  }

  private scheduleReconnect(delayMs: number): void {
    this.cancelReconnect()
    this.reconnectTask = this.options.scheduler.schedule(() => {
      this.reconnectTask = null
      this.transition({
        type: 'reconnectTimerFired',
        online: this.options.environment.isOnline(),
      })
    }, delayMs)
  }

  private cancelReconnect(): void {
    this.reconnectTask?.cancel()
    this.reconnectTask = null
  }

  private checkConnection(): void {
    if (
      !this.machine.snapshot.attachment
      || this.machine.snapshot.phase === 'disposed'
      || !this.options.environment.isVisible()
    ) {
      return
    }

    if (!this.options.environment.isOnline()) {
      this.transition({ type: 'offline' })
      return
    }
    if (this.machine.snapshot.transportStatus === 'none') {
      this.transition({ type: 'recover', online: true })
      return
    }
    if (this.machine.snapshot.transportStatus === 'open') {
      this.probe()
    }
  }

  private probe(): void {
    this.watchdog.probe(() => this.sendMessage({ action: 'ping' }))
  }

  private failCurrentTransport(): void {
    const current = this.activeTransport
    if (!current) return
    this.transition({
      type: 'transportFailed',
      online: this.options.environment.isOnline(),
      transportId: current.id,
    })
  }

  private publishState(): void {
    const { label, phase } = this.machine.snapshot
    this.options.onStateChange(phase === 'disposed' ? 'detached' : phase, label)
  }
}
