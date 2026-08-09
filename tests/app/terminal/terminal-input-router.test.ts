import { describe, expect, it, vi } from 'vitest'
import { createTerminalInputRouter } from '../../../app/terminal/terminal-input-router'
import { markTerminalTouchWheelEvent } from '../../../app/terminal/terminal-touch-scroll'

function setup(options: {
  active?: boolean
  asyncWheelEnabled?: boolean
  mode?: 'async' | 'live'
  mouseTracking?: boolean
} = {}) {
  let mode = options.mode ?? 'async'
  const scheduled: Array<() => void> = []
  const enableStdin = vi.fn()
  const restoreInputMode = vi.fn()
  const sendInput = vi.fn()
  const sendWheelInput = vi.fn()
  const router = createTerminalInputRouter({
    enableStdin,
    inputMode: () => mode,
    isActive: () => options.active ?? true,
    isAsyncWheelEnabled: () => options.asyncWheelEnabled ?? true,
    isMouseTrackingEnabled: () => options.mouseTracking ?? true,
    restoreInputMode,
    scheduleRestore: callback => scheduled.push(callback),
    sendInput,
    sendWheelInput,
  })

  return {
    enableStdin,
    restoreInputMode,
    router,
    runRestore: () => scheduled.shift()?.(),
    scheduled,
    sendInput,
    sendWheelInput,
    setMode: (value: 'async' | 'live') => { mode = value },
  }
}

describe('terminal input router', () => {
  it('routes only data produced synchronously by an async wheel event', () => {
    const context = setup()

    context.router.onData('keyboard-before')
    expect(context.sendInput).not.toHaveBeenCalled()

    expect(context.router.onWheel()).toBe(true)
    expect(context.enableStdin).toHaveBeenCalledOnce()
    expect(context.scheduled).toHaveLength(1)

    context.router.onData('\u001B[<64;20;8M')
    expect(context.sendWheelInput).toHaveBeenCalledExactlyOnceWith('\u001B[<64;20;8M', 'utf8')
    expect(context.sendInput).not.toHaveBeenCalled()

    context.runRestore()
    expect(context.restoreInputMode).toHaveBeenCalledOnce()

    context.router.onData('keyboard-after')
    expect(context.sendInput).not.toHaveBeenCalled()
    expect(context.sendWheelInput).toHaveBeenCalledOnce()
  })

  it('routes legacy binary wheel reports without treating them as keyboard input', () => {
    const context = setup()
    const report = `\u001B[M${String.fromCharCode(96, 52, 40)}`

    expect(context.router.onWheel()).toBe(true)
    context.router.onBinary(report)

    expect(context.sendWheelInput).toHaveBeenCalledExactlyOnceWith(report, 'binary')
    expect(context.sendInput).not.toHaveBeenCalled()
  })

  it('marks touch wheel input for single-line tmux scrolling', () => {
    const context = setup()
    const touchWheel = markTerminalTouchWheelEvent({} as WheelEvent)

    expect(context.router.onWheel(touchWheel)).toBe(true)
    context.router.onData('\u001B[<64;20;8M')

    expect(context.sendWheelInput)
      .toHaveBeenCalledExactlyOnceWith('\u001B[<64;20;8M', 'utf8', 1)
  })

  it('leaves xterm wheel handling enabled without opening async input when forwarding is unavailable', () => {
    const context = setup({ asyncWheelEnabled: false })

    expect(context.router.onWheel()).toBe(true)
    context.router.onData('\u001B[<65;20;8M')

    expect(context.enableStdin).not.toHaveBeenCalled()
    expect(context.restoreInputMode).not.toHaveBeenCalled()
    expect(context.sendInput).not.toHaveBeenCalled()
    expect(context.sendWheelInput).not.toHaveBeenCalled()
    expect(context.scheduled).toHaveLength(0)
  })

  it('routes live wheel data atomically while preserving regular live input', () => {
    const context = setup({ mode: 'live' })

    expect(context.router.onWheel()).toBe(true)
    context.router.onData('\u001B[<64;20;8M')
    context.runRestore()
    context.router.onData('a')

    expect(context.sendWheelInput).toHaveBeenCalledExactlyOnceWith('\u001B[<64;20;8M', 'utf8')
    expect(context.sendInput).toHaveBeenCalledExactlyOnceWith('a')
    expect(context.enableStdin).not.toHaveBeenCalled()
    expect(context.restoreInputMode).not.toHaveBeenCalled()
  })

  it('does not route tmux wheel input without mouse tracking or while inactive', () => {
    const untracked = setup({ mouseTracking: false })
    const inactive = setup({ active: false })

    expect(untracked.router.onWheel()).toBe(true)
    expect(inactive.router.onWheel()).toBe(true)

    expect(untracked.sendWheelInput).not.toHaveBeenCalled()
    expect(inactive.sendWheelInput).not.toHaveBeenCalled()
    expect(untracked.scheduled).toHaveLength(0)
    expect(inactive.enableStdin).not.toHaveBeenCalled()
  })

  it('cancels late wheel restoration after disposal', () => {
    const context = setup()

    context.router.onWheel()
    context.router.dispose()
    context.runRestore()
    context.router.onData('\u001B[<64;20;8M')

    expect(context.restoreInputMode).not.toHaveBeenCalled()
    expect(context.sendInput).not.toHaveBeenCalled()
    expect(context.sendWheelInput).not.toHaveBeenCalled()
  })

  it('restores the current input mode if the mode changes during the wheel event', () => {
    const context = setup()

    context.router.onWheel()
    context.setMode('live')
    context.runRestore()
    context.router.onData('b')

    expect(context.restoreInputMode).toHaveBeenCalledOnce()
    expect(context.sendInput).toHaveBeenCalledExactlyOnceWith('b')
  })
})
