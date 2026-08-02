import { describe, expect, it, vi } from 'vitest'
import type {
  ConnectionEnvironment,
  ConnectionEnvironmentEvent,
  EnvironmentSubscription,
} from '../../../app/terminal/connection-environment'
import type { ScheduledTask, Scheduler } from '../../../app/terminal/scheduler'
import { TerminalConnectionController } from '../../../app/terminal/terminal-connection-controller'
import type {
  TerminalTransport,
  TerminalTransportFactory,
  TerminalTransportHandlers,
} from '../../../app/terminal/terminal-transport'
import type { ClientMessage, ServerMessage } from '../../../shared/contracts/terminal'

class FakeEnvironment implements ConnectionEnvironment {
  listener: ((event: ConnectionEnvironmentEvent) => void) | null = null
  online = true
  visible = true

  isOnline(): boolean {
    return this.online
  }

  isVisible(): boolean {
    return this.visible
  }

  subscribe(listener: (event: ConnectionEnvironmentEvent) => void): EnvironmentSubscription {
    this.listener = listener
    return {
      dispose: () => {
        this.listener = null
      },
    }
  }

  emit(event: ConnectionEnvironmentEvent): void {
    this.listener?.(event)
  }
}

interface FakeScheduledTask extends ScheduledTask {
  callback: () => void
  cancelled: boolean
  delayMs: number
}

class FakeScheduler implements Scheduler {
  readonly tasks: FakeScheduledTask[] = []

  schedule(callback: () => void, delayMs: number): ScheduledTask {
    const task: FakeScheduledTask = {
      callback,
      cancelled: false,
      delayMs,
      cancel() {
        task.cancelled = true
      },
    }
    this.tasks.push(task)
    return task
  }

  run(delayMs: number): void {
    const task = this.tasks.find(candidate => !candidate.cancelled && candidate.delayMs === delayMs)
    if (!task) throw new Error(`No active ${delayMs}ms task.`)
    task.cancelled = true
    task.callback()
  }
}

class FakeTransport implements TerminalTransport {
  closed = false
  readonly messages: ClientMessage[] = []
  throwOnSend = false

  constructor(readonly handlers: TerminalTransportHandlers) {}

  close(): void {
    this.closed = true
  }

  send(message: ClientMessage): void {
    if (this.closed || this.throwOnSend) throw new Error('closed')
    this.messages.push(message)
  }

  open(): void {
    this.handlers.onOpen()
  }

  message(message: ServerMessage): void {
    this.handlers.onMessage(message)
  }

  error(): void {
    this.handlers.onError()
  }

  remoteClose(): void {
    this.handlers.onClose()
  }
}

class FakeTransportFactory implements TerminalTransportFactory {
  readonly transports: FakeTransport[] = []
  throwOnCreate = false

  create(handlers: TerminalTransportHandlers): TerminalTransport {
    if (this.throwOnCreate) throw new Error('factory failed')
    const transport = new FakeTransport(handlers)
    this.transports.push(transport)
    return transport
  }
}

function setup() {
  let now = 100
  const environment = new FakeEnvironment()
  const scheduler = new FakeScheduler()
  const transportFactory = new FakeTransportFactory()
  const states: Array<{ label: string, phase: string }> = []
  const output: string[] = []
  const status: Array<{ error: boolean, message: string }> = []
  const attachmentBegin = vi.fn()
  const attachmentReady = vi.fn()
  const checkAuthentication = vi.fn()
  const flushReliable = vi.fn()
  const resetReliable = vi.fn()
  const acknowledge = vi.fn()
  const controller = new TerminalConnectionController({
    clock: () => now,
    environment,
    getSize: () => ({ cols: 120, rows: 40 }),
    onAttachmentBegin: attachmentBegin,
    onAttachmentReady: attachmentReady,
    onCheckAuthentication: checkAuthentication,
    onInputAcknowledged: acknowledge,
    onOutput: data => output.push(data),
    onReliableInputFlush: flushReliable,
    onReliableInputReset: resetReliable,
    onStateChange: (phase, label) => states.push({ label, phase }),
    onStatus: (message, error) => status.push({ error, message }),
    scheduler,
    transportFactory,
  })

  return {
    acknowledge,
    attachmentBegin,
    attachmentReady,
    checkAuthentication,
    controller,
    environment,
    flushReliable,
    now: (value: number) => { now = value },
    output,
    resetReliable,
    scheduler,
    states,
    status,
    transportFactory,
  }
}

describe('TerminalConnectionController', () => {
  it('attaches a window with typed messages and publishes output', () => {
    const context = setup()
    context.controller.attachWindow('main', 2)
    const transport = context.transportFactory.transports[0]!
    transport.open()

    expect(transport.messages).toContainEqual({
      action: 'attachWindow',
      payload: {
        cols: 120,
        rows: 40,
        sessionName: 'main',
        windowIndex: 2,
      },
    })
    expect(context.attachmentBegin).toHaveBeenCalledOnce()

    transport.message({
      type: 'attached',
      data: 'attached',
      sessionName: 'main',
      windowIndex: 2,
    })
    transport.message({ type: 'stdout', data: 'hello' })
    transport.message({ type: 'inputAck', data: '', inputId: 'input-1' })

    expect(context.controller.isAttached).toBe(true)
    expect(context.attachmentReady).toHaveBeenCalledOnce()
    expect(context.flushReliable).toHaveBeenCalledOnce()
    expect(context.output).toEqual(['hello'])
    expect(context.acknowledge).toHaveBeenCalledWith('input-1')
  })

  it('reconnects with a deterministic scheduler and ignores the old transport', () => {
    const context = setup()
    context.controller.attach('main')
    const first = context.transportFactory.transports[0]!
    first.open()
    first.error()

    expect(first.closed).toBe(true)
    expect(context.states.at(-1)).toEqual({
      label: 'Reconnecting in 1s…',
      phase: 'reconnecting',
    })

    context.scheduler.run(1000)
    const second = context.transportFactory.transports[1]!
    expect(second).toBeDefined()

    first.message({ type: 'stdout', data: 'stale' })
    expect(context.output).toEqual([])

    second.open()
    expect(second.messages[0]).toMatchObject({
      action: 'attach',
      payload: { sessionName: 'main' },
    })
  })

  it('suspends while offline and resumes when the environment recovers', () => {
    const context = setup()
    context.controller.attach('main')
    const first = context.transportFactory.transports[0]!
    first.open()

    context.environment.online = false
    context.environment.emit('offline')
    expect(first.closed).toBe(true)
    expect(context.states.at(-1)?.phase).toBe('offline')

    context.environment.online = true
    context.environment.emit('check')
    expect(context.transportFactory.transports).toHaveLength(2)
    expect(context.states.at(-1)?.phase).toBe('connecting')
  })

  it('sends detach before closing and never schedules a reconnect', () => {
    const context = setup()
    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!
    transport.open()

    context.controller.detach()

    expect(transport.messages.at(-1)).toEqual({ action: 'detach' })
    expect(transport.closed).toBe(true)
    expect(context.states.at(-1)?.phase).toBe('detached')
    expect(context.scheduler.tasks.filter(task => !task.cancelled)).toEqual([])
  })

  it('times out an attachment and probes authentication when opening fails', () => {
    const context = setup()
    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!
    transport.open()
    context.scheduler.run(8000)

    expect(transport.closed).toBe(true)
    expect(context.states.at(-1)?.phase).toBe('reconnecting')

    context.scheduler.run(1000)
    const unopened = context.transportFactory.transports[1]!
    unopened.remoteClose()
    expect(context.checkAuthentication).toHaveBeenCalledOnce()
  })

  it('uses the watchdog before sending stale terminal input', () => {
    const context = setup()
    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!
    transport.open()
    transport.message({ type: 'attached', data: '', sessionName: 'main' })

    context.now(45_101)
    expect(context.controller.sendInput('ls\r')).toBe(false)
    expect(transport.messages.at(-1)).toEqual({ action: 'ping' })

    context.scheduler.run(8000)
    expect(transport.closed).toBe(true)
    expect(context.states.at(-1)?.phase).toBe('reconnecting')
  })

  it('disposes its environment, timers, and active transport exactly once', () => {
    const context = setup()
    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!

    context.controller.dispose()
    context.controller.dispose()

    expect(transport.closed).toBe(true)
    expect(context.environment.listener).toBeNull()
    expect(context.states.at(-1)?.phase).toBe('detached')
  })

  it('sends input, resize, and window commands only after attachment', () => {
    const context = setup()

    expect(context.controller.sendMessage({ action: 'ping' })).toBe(false)
    expect(context.controller.sendInput('before')).toBe(false)
    expect(context.controller.sendWheelInput('\u001B[<64;20;8M')).toBe(false)
    context.controller.resize(80, 24)
    context.controller.selectWindow('main', 1)
    context.controller.newWindow('main')
    context.controller.killWindow('main', 1)

    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!
    transport.open()
    transport.message({ type: 'attached', data: '', sessionName: 'main' })

    expect(context.controller.sendInput('after')).toBe(true)
    expect(context.controller.sendWheelInput('\u001B[<64;20;8M')).toBe(true)
    context.controller.resize(100, 30)
    context.controller.resize(100, 30)
    context.controller.selectWindow('main', 2)
    context.controller.newWindow('main')
    context.controller.killWindow('main', 2)

    expect(transport.messages.slice(-6)).toEqual([
      { action: 'input', payload: { data: 'after' } },
      { action: 'wheelInput', payload: { data: '\u001B[<64;20;8M', encoding: 'utf8' } },
      { action: 'resize', payload: { cols: 100, rows: 30 } },
      { action: 'selectWindow', payload: { index: 2, sessionName: 'main' } },
      { action: 'newWindow', payload: { sessionName: 'main' } },
      { action: 'killWindow', payload: { index: 2, sessionName: 'main' } },
    ])
  })

  it('routes heartbeat, pong, status, and error messages by intent', () => {
    const context = setup()
    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!
    transport.open()

    transport.message({ type: 'heartbeat', data: '' })
    transport.message({ type: 'pong', data: '' })
    transport.message({ type: 'status', data: 'ready' })
    transport.message({ type: 'error', data: 'broken' })

    expect(context.status).toEqual([
      { error: false, message: 'ready' },
      { error: true, message: 'broken' },
    ])
  })

  it('handles authentication expiry as an intentional detach', () => {
    const context = setup()
    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!
    transport.open()

    context.controller.authExpired()

    expect(transport.messages.at(-1)).toEqual({ action: 'detach' })
    expect(transport.closed).toBe(true)
    expect(context.states.at(-1)).toEqual({
      label: 'Unlock required',
      phase: 'detached',
    })
  })

  it('recovers cleanly when transport construction or sending throws', () => {
    const failedCreation = setup()
    failedCreation.transportFactory.throwOnCreate = true
    failedCreation.controller.attach('main')

    expect(failedCreation.checkAuthentication).toHaveBeenCalledOnce()
    expect(failedCreation.states.at(-1)?.phase).toBe('reconnecting')

    const failedSend = setup()
    failedSend.controller.attach('main')
    const transport = failedSend.transportFactory.transports[0]!
    transport.open()
    transport.message({ type: 'attached', data: '', sessionName: 'main' })
    transport.throwOnSend = true

    expect(failedSend.controller.sendMessage({ action: 'ping' })).toBe(false)
    expect(transport.closed).toBe(true)
    expect(failedSend.states.at(-1)?.phase).toBe('reconnecting')
  })

  it('ignores late open, close, and messages from a replaced transport', () => {
    const context = setup()
    context.controller.attach('main')
    const first = context.transportFactory.transports[0]!
    first.error()
    context.scheduler.run(1000)
    const second = context.transportFactory.transports[1]!

    first.open()
    first.remoteClose()
    first.message({ type: 'stdout', data: 'late' })

    expect(context.output).toEqual([])
    expect(context.transportFactory.transports).toHaveLength(2)
    second.open()
    expect(second.messages[0]).toMatchObject({ action: 'attach' })
  })

  it('checks visibility, network state, and open connections on lifecycle events', () => {
    const context = setup()

    context.environment.emit('check')
    expect(context.transportFactory.transports).toEqual([])

    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!
    context.environment.visible = false
    context.environment.emit('check')
    expect(context.transportFactory.transports).toHaveLength(1)

    context.environment.visible = true
    context.environment.online = false
    context.environment.emit('check')
    expect(transport.closed).toBe(true)
    expect(context.states.at(-1)?.phase).toBe('offline')

    context.environment.online = true
    context.environment.emit('check')
    const recovered = context.transportFactory.transports[1]!
    recovered.open()
    context.now(45_101)
    context.environment.emit('check')
    expect(recovered.messages.at(-1)).toEqual({ action: 'ping' })
  })

  it('reports explicit failures only while a transport is active', () => {
    const context = setup()

    context.controller.reportConnectionFailure()
    expect(context.states.at(-1)?.phase).toBe('detached')

    context.controller.attach('main')
    const transport = context.transportFactory.transports[0]!
    context.controller.reportConnectionFailure()

    expect(transport.closed).toBe(true)
    expect(context.states.at(-1)?.phase).toBe('reconnecting')
  })
})
