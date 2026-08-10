import { describe, expect, it } from 'vitest'
import {
  TerminalConnectionMachine,
  type TerminalConnectionEffect,
} from '../../../app/terminal/terminal-connection-machine'

function effect<T extends TerminalConnectionEffect['type']>(
  effects: TerminalConnectionEffect[],
  type: T,
): Extract<TerminalConnectionEffect, { type: T }> {
  const found = effects.find(item => item.type === type)
  if (!found) throw new Error(`Missing ${type} effect.`)
  return found as Extract<TerminalConnectionEffect, { type: T }>
}

function connect(machine: TerminalConnectionMachine, sessionName = 'main'): number {
  const effects = machine.dispatch({
    type: 'attachmentRequested',
    attachment: { type: 'session', sessionName },
    online: true,
  })
  const { transportId } = effect(effects, 'openTransport')
  machine.dispatch({ type: 'transportOpened', transportId })
  return transportId
}

describe('TerminalConnectionMachine', () => {
  it('models a complete attachment without contradictory booleans', () => {
    const machine = new TerminalConnectionMachine()
    const transportId = connect(machine)

    expect(machine.snapshot.phase).toBe('attaching')
    expect(machine.snapshot.transportStatus).toBe('open')

    const effects = machine.dispatch({
      type: 'attachmentConfirmed',
      sessionName: 'main',
      transportId,
    })

    expect(machine.snapshot).toMatchObject({
      label: 'Connected',
      phase: 'attached',
      reconnectAttempts: 0,
      transportId,
      transportStatus: 'open',
    })
    expect(effects.map(item => item.type)).toEqual([
      'cancelAttachTimeout',
      'attachmentReady',
      'flushReliableInput',
    ])
  })

  it('waits offline without opening a transport', () => {
    const machine = new TerminalConnectionMachine()
    const effects = machine.dispatch({
      type: 'attachmentRequested',
      attachment: { type: 'session', sessionName: 'main' },
      online: false,
    })

    expect(machine.snapshot).toMatchObject({
      phase: 'offline',
      transportId: null,
      transportStatus: 'none',
    })
    expect(effects.some(item => item.type === 'openTransport')).toBe(false)
  })

  it('uses deterministic exponential reconnect delays', () => {
    const machine = new TerminalConnectionMachine()
    const firstTransportId = connect(machine)
    const firstFailure = machine.dispatch({
      type: 'transportFailed',
      online: true,
      transportId: firstTransportId,
    })

    expect(effect(firstFailure, 'scheduleReconnect').delayMs).toBe(1000)
    expect(machine.snapshot.reconnectAttempts).toBe(1)

    const reconnect = machine.dispatch({ type: 'reconnectTimerFired', online: true })
    const secondTransportId = effect(reconnect, 'openTransport').transportId
    machine.dispatch({ type: 'transportOpened', transportId: secondTransportId })
    const secondFailure = machine.dispatch({
      type: 'transportFailed',
      online: true,
      transportId: secondTransportId,
    })

    expect(effect(secondFailure, 'scheduleReconnect').delayMs).toBe(2000)
    expect(machine.snapshot.reconnectAttempts).toBe(2)
  })

  it('ignores events from an obsolete transport generation', () => {
    const machine = new TerminalConnectionMachine()
    const firstTransportId = connect(machine)
    machine.dispatch({
      type: 'transportFailed',
      online: true,
      transportId: firstTransportId,
    })
    const reconnect = machine.dispatch({ type: 'reconnectTimerFired', online: true })
    const currentTransportId = effect(reconnect, 'openTransport').transportId

    expect(machine.dispatch({ type: 'transportOpened', transportId: firstTransportId })).toEqual([])
    expect(machine.snapshot.transportId).toBe(currentTransportId)
  })

  it('reattaches over an already-open transport', () => {
    const machine = new TerminalConnectionMachine()
    const transportId = connect(machine)
    machine.dispatch({
      type: 'attachmentConfirmed',
      sessionName: 'main',
      transportId,
    })

    const effects = machine.dispatch({
      type: 'attachmentRequested',
      attachment: { type: 'window', sessionName: 'main', windowIndex: 2 },
      online: true,
    })

    expect(machine.snapshot.phase).toBe('attaching')
    expect(effect(effects, 'sendAttach').transportId).toBe(transportId)
    expect(effects.some(item => item.type === 'openTransport')).toBe(false)
  })

  it('rejects attachment confirmations for the wrong window', () => {
    const machine = new TerminalConnectionMachine()
    const openEffects = machine.dispatch({
      type: 'attachmentRequested',
      attachment: { type: 'window', sessionName: 'main', windowIndex: 2 },
      online: true,
    })
    const transportId = effect(openEffects, 'openTransport').transportId
    machine.dispatch({ type: 'transportOpened', transportId })

    expect(machine.dispatch({
      type: 'attachmentConfirmed',
      sessionName: 'main',
      transportId,
      windowIndex: 3,
    })).toEqual([])
    expect(machine.snapshot.phase).toBe('attaching')
  })

  it('rejects a pane confirmation for a sibling pane', () => {
    const machine = new TerminalConnectionMachine()
    const openEffects = machine.dispatch({
      type: 'attachmentRequested',
      attachment: { type: 'pane', paneId: '%7', sessionName: 'main', windowIndex: 2 },
      online: true,
    })
    const transportId = effect(openEffects, 'openTransport').transportId
    machine.dispatch({ type: 'transportOpened', transportId })

    expect(machine.dispatch({
      type: 'attachmentConfirmed',
      paneId: '%8',
      sessionName: 'main',
      transportId,
      windowIndex: 2,
    })).toEqual([])
    expect(machine.snapshot.phase).toBe('attaching')
  })

  it('closes the active transport on offline and recovers online', () => {
    const machine = new TerminalConnectionMachine()
    const transportId = connect(machine)
    const offlineEffects = machine.dispatch({ type: 'offline' })

    expect(effect(offlineEffects, 'closeTransport').transportId).toBe(transportId)
    expect(machine.snapshot.phase).toBe('offline')

    const recoverEffects = machine.dispatch({ type: 'recover', online: true })
    expect(effect(recoverEffects, 'openTransport').transportId).not.toBe(transportId)
    expect(machine.snapshot.phase).toBe('connecting')
  })

  it('detaches intentionally without scheduling a reconnect', () => {
    const machine = new TerminalConnectionMachine()
    const transportId = connect(machine)
    const effects = machine.dispatch({ type: 'detachRequested' })

    expect(effect(effects, 'sendDetach').transportId).toBe(transportId)
    expect(effect(effects, 'closeTransport').transportId).toBe(transportId)
    expect(effects.some(item => item.type === 'scheduleReconnect')).toBe(false)
    expect(machine.snapshot.phase).toBe('detached')
    expect(machine.snapshot.attachment).toBeNull()
  })

  it('makes dispose terminal and ignores later transport events', () => {
    const machine = new TerminalConnectionMachine()
    const transportId = connect(machine)
    machine.dispatch({ type: 'disposeRequested' })

    expect(machine.snapshot.phase).toBe('disposed')
    expect(machine.dispatch({ type: 'transportOpened', transportId })).toEqual([])
  })

  it('keeps the latest attachment request while a transport is connecting', () => {
    const machine = new TerminalConnectionMachine()
    const effects = machine.dispatch({
      type: 'attachmentRequested',
      attachment: { type: 'session', sessionName: 'first' },
      online: true,
    })
    const transportId = effect(effects, 'openTransport').transportId

    expect(machine.dispatch({
      type: 'attachmentRequested',
      attachment: { type: 'window', sessionName: 'second', windowIndex: 4 },
      online: true,
    })).toEqual([])
    expect(machine.snapshot.attachment).toEqual({
      type: 'window',
      sessionName: 'second',
      windowIndex: 4,
    })
    machine.dispatch({ type: 'transportOpened', transportId })
    expect(machine.snapshot.phase).toBe('attaching')
  })

  it('ignores duplicate opens and confirmations for another session', () => {
    const machine = new TerminalConnectionMachine()
    const transportId = connect(machine)

    expect(machine.dispatch({ type: 'transportOpened', transportId })).toEqual([])
    expect(machine.dispatch({
      type: 'attachmentConfirmed',
      sessionName: 'another',
      transportId,
    })).toEqual([])
    expect(machine.snapshot.phase).toBe('attaching')
  })

  it('moves a failed transport offline and resumes only when online', () => {
    const machine = new TerminalConnectionMachine()
    const transportId = connect(machine)

    const failure = machine.dispatch({
      type: 'transportFailed',
      checkAuthentication: true,
      online: false,
      transportId,
    })

    expect(machine.snapshot.phase).toBe('offline')
    expect(failure.map(item => item.type)).toContain('checkAuthentication')
    expect(failure.map(item => item.type)).toContain('cancelReconnect')
    expect(machine.dispatch({ type: 'recover', online: false })).not.toContainEqual(
      expect.objectContaining({ type: 'openTransport' }),
    )
    expect(machine.snapshot.phase).toBe('offline')
    expect(machine.dispatch({ type: 'recover', online: true })).toContainEqual(
      expect.objectContaining({ type: 'openTransport' }),
    )
  })

  it('handles an offline reconnect timer and ignores invalid recovery requests', () => {
    const machine = new TerminalConnectionMachine()

    expect(machine.dispatch({ type: 'reconnectTimerFired', online: true })).toEqual([])
    expect(machine.dispatch({ type: 'recover', online: true })).toEqual([])

    const transportId = connect(machine)
    machine.dispatch({
      type: 'transportFailed',
      online: true,
      transportId,
    })
    const effects = machine.dispatch({ type: 'reconnectTimerFired', online: false })

    expect(machine.snapshot.phase).toBe('offline')
    expect(effects.map(item => item.type)).toContain('cancelReconnect')
  })

  it('distinguishes a detached offline event and authentication expiry', () => {
    const machine = new TerminalConnectionMachine()

    machine.dispatch({ type: 'offline' })
    expect(machine.snapshot).toMatchObject({
      label: 'Detached',
      phase: 'detached',
    })

    const transportId = connect(machine)
    const effects = machine.dispatch({ type: 'authExpired' })
    expect(effect(effects, 'sendDetach').transportId).toBe(transportId)
    expect(machine.snapshot).toMatchObject({
      attachment: null,
      label: 'Unlock required',
      phase: 'detached',
    })
  })

  it('caps the reconnect backoff after repeated failures', () => {
    const machine = new TerminalConnectionMachine()
    let transportId = connect(machine)
    const delays: number[] = []

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const failed = machine.dispatch({
        type: 'transportFailed',
        online: true,
        transportId,
      })
      delays.push(effect(failed, 'scheduleReconnect').delayMs)
      const reconnect = machine.dispatch({ type: 'reconnectTimerFired', online: true })
      transportId = effect(reconnect, 'openTransport').transportId
      machine.dispatch({ type: 'transportOpened', transportId })
    }

    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 16000, 16000])
  })
})
