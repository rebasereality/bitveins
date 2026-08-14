import { describe, expect, it, vi } from 'vitest'
import { createTerminalInputRouter, sgrWheelReport } from '../../../app/terminal/terminal-input-router'
import { markTerminalTouchWheelEvent } from '../../../app/terminal/terminal-touch-scroll'

function setup(options: {
  active?: boolean
  asyncWheelEnabled?: boolean
  mode?: 'async' | 'live'
  mouseTracking?: boolean
  resolveWheelCell?: (event: WheelEvent) => { col: number, row: number }
} = {}) {
  let mode = options.mode ?? 'async'
  const scheduled: Array<() => void> = []
  const enableStdin = vi.fn()
  const restoreInputMode = vi.fn()
  const sendInput = vi.fn()
  const sendScroll = vi.fn()
  const sendWheelInput = vi.fn()
  const router = createTerminalInputRouter({
    enableStdin,
    inputMode: () => mode,
    isActive: () => options.active ?? true,
    isAsyncWheelEnabled: () => options.asyncWheelEnabled ?? true,
    isMouseTrackingEnabled: () => options.mouseTracking ?? true,
    resolveWheelCell: options.resolveWheelCell,
    restoreInputMode,
    scheduleRestore: callback => scheduled.push(callback),
    sendInput,
    sendScroll,
    sendWheelInput,
  })

  return {
    enableStdin,
    restoreInputMode,
    router,
    runRestore: () => scheduled.shift()?.(),
    scheduled,
    sendInput,
    sendScroll,
    sendWheelInput,
    setMode: (value: 'async' | 'live') => { mode = value },
  }
}

describe('terminal input router', () => {
  it('builds SGR wheel reports', () => {
    expect(sgrWheelReport('up')).toBe('\x1b[<64;1;1M')
    expect(sgrWheelReport('down', 42, 12)).toBe('\x1b[<65;42;12M')
  })

  it('forwards OSC 11 color reports in async mode so Grok can read the canvas', () => {
    const context = setup({ mode: 'async' })
    const report = '\u001B]11;rgb:fafa/fafb/fafb\u001B\\'

    context.router.onData(report)

    expect(context.sendInput).toHaveBeenCalledExactlyOnceWith(report)
  })

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

  it('forwards untracked wheels as SGR reports so Grok still receives them', () => {
    const untracked = setup({ mouseTracking: false })
    const inactive = setup({ active: false })
    const wheel = { deltaY: -120, preventDefault: vi.fn() } as unknown as WheelEvent

    expect(untracked.router.onWheel(wheel)).toBe(false)
    expect(inactive.router.onWheel(wheel)).toBe(true)

    expect(untracked.sendScroll).not.toHaveBeenCalled()
    expect(untracked.sendWheelInput).toHaveBeenCalledExactlyOnceWith('\u001B[<64;1;1M', 'utf8')
    expect(wheel.preventDefault).toHaveBeenCalledOnce()
    expect(inactive.sendWheelInput).not.toHaveBeenCalled()
    expect(untracked.scheduled).toHaveLength(0)
    expect(inactive.enableStdin).not.toHaveBeenCalled()
  })

  it('requests one native tmux row for a touch wheel without mouse tracking', () => {
    const context = setup({ mouseTracking: false })
    const touchWheel = markTerminalTouchWheelEvent({
      deltaY: 1,
      preventDefault: vi.fn(),
    } as unknown as WheelEvent)

    expect(context.router.onWheel(touchWheel)).toBe(false)
    expect(context.sendWheelInput).toHaveBeenCalledExactlyOnceWith('\u001B[<65;1;1M', 'utf8', 1)
    expect(context.sendScroll).not.toHaveBeenCalled()
  })

  it('uses the resolved terminal cell in untracked SGR wheel reports', () => {
    const context = setup({
      mouseTracking: false,
      resolveWheelCell: () => ({ col: 42, row: 12 }),
    })

    context.router.onWheel({ deltaY: 80, preventDefault: vi.fn() } as unknown as WheelEvent)

    expect(context.sendWheelInput).toHaveBeenCalledExactlyOnceWith(sgrWheelReport('down', 42, 12), 'utf8')
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
