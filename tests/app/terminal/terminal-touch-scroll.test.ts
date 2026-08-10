// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTerminalTouchScrollController,
  isTerminalTouchWheelEvent,
} from '../../../app/terminal/terminal-touch-scroll'

function pointer(
  type: string,
  x: number,
  y: number,
  options: { pointerId?: number, pointerType?: string } = {},
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: options.pointerId ?? 1,
    pointerType: options.pointerType ?? 'touch',
  })
}

function setup(options: {
  bufferType?: string
  enabled?: boolean
  includeElement?: boolean
  mouseTrackingMode?: string
  screenHeight?: number
  terminalRows?: number
} = {}) {
  const host = document.createElement('div')
  const terminalElement = document.createElement('div')
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  terminalElement.appendChild(screen)
  host.appendChild(terminalElement)
  vi.spyOn(screen, 'getBoundingClientRect').mockReturnValue({
    bottom: options.screenHeight ?? 200,
    height: options.screenHeight ?? 200,
    left: 0,
    right: 200,
    top: 0,
    width: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  let selecting = false
  const scrollLines = vi.fn()
  const wheel = vi.fn()
  screen.addEventListener('wheel', wheel)
  const controller = createTerminalTouchScrollController({
    isEnabled: () => options.enabled ?? true,
    isSelecting: () => selecting,
    terminal: () => ({
      element: options.includeElement === false ? undefined : terminalElement,
      rows: options.terminalRows ?? 10,
    }),
    terminalHost: () => host,
  })
  return {
    controller,
    screen,
    scrollLines,
    setSelecting: (value: boolean) => {
      selecting = value
    },
    wheel,
  }
}

describe('terminal touch scroll', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('turns a downward finger swipe into wheel-up rows and the inverse', () => {
    const context = setup()
    context.controller.onPointerDown(pointer('pointerdown', 100, 80))
    expect(context.controller.onPointerMove(pointer('pointermove', 100, 90))).toBe(false)
    const down = pointer('pointermove', 100, 120)
    expect(context.controller.onPointerMove(down)).toBe(true)
    expect(down.defaultPrevented).toBe(true)
    expect(context.wheel.mock.calls.map(([event]) => (event as WheelEvent).deltaY))
      .toEqual([-1, -1])
    expect(context.wheel.mock.calls.every(([event]) => (
      isTerminalTouchWheelEvent(event as WheelEvent)
    ))).toBe(true)

    context.controller.onPointerMove(pointer('pointermove', 100, 100))
    expect(context.wheel.mock.calls.map(([event]) => (event as WheelEvent).deltaY))
      .toEqual([-1, -1, 1])
  })

  it('routes normal-buffer touch movement through tmux instead of local xterm history', () => {
    const context = setup({ bufferType: 'normal' })
    context.controller.onPointerDown(pointer('pointerdown', 100, 80))
    context.controller.onPointerMove(pointer('pointermove', 100, 120))
    context.controller.onPointerMove(pointer('pointermove', 100, 100))

    expect(context.scrollLines).not.toHaveBeenCalled()
    expect(context.wheel.mock.calls.map(([event]) => (event as WheelEvent).deltaY))
      .toEqual([-1, -1, 1])
  })

  it('caps oversized moves while using the fallback line height', () => {
    const context = setup({ bufferType: 'normal', screenHeight: 0 })
    context.controller.onPointerDown(pointer('pointerdown', 100, 0))
    context.controller.onPointerMove(pointer('pointermove', 100, 1000))

    expect(context.wheel).toHaveBeenCalledTimes(32)
  })

  it('ignores disabled, non-touch and secondary pointer streams', () => {
    const disabled = setup({ enabled: false })
    disabled.controller.onPointerDown(pointer('pointerdown', 20, 20))
    expect(disabled.controller.onPointerMove(pointer('pointermove', 20, 80))).toBe(false)

    const context = setup()
    context.controller.onPointerDown(pointer('pointerdown', 20, 20, { pointerType: 'mouse' }))
    context.controller.onPointerDown(pointer('pointerdown', 20, 20))
    context.controller.onPointerDown(pointer('pointerdown', 20, 20, { pointerId: 2 }))

    expect(context.controller.onPointerMove(pointer('pointermove', 20, 80, { pointerId: 2 })))
      .toBe(false)
    expect(context.controller.onPointerUp(pointer('pointerup', 20, 20, { pointerType: 'mouse' })))
      .toBe(false)
    context.controller.onPointerCancel(pointer('pointercancel', 20, 20, { pointerId: 2 }))
    expect(context.wheel).not.toHaveBeenCalled()
  })

  it('safely consumes vertical touch movement before xterm is mounted', () => {
    const context = setup({ includeElement: false })
    context.controller.onPointerDown(pointer('pointerdown', 100, 80))
    const move = pointer('pointermove', 100, 120)

    expect(context.controller.onPointerMove(move)).toBe(true)
    expect(move.defaultPrevented).toBe(true)
    expect(context.controller.onPointerUp(pointer('pointerup', 100, 120))).toBe(true)
    expect(context.wheel).not.toHaveBeenCalled()
  })

  it('leaves taps, horizontal gestures and active text selection alone', () => {
    const context = setup()
    context.controller.onPointerDown(pointer('pointerdown', 20, 20))
    expect(context.controller.onPointerMove(pointer('pointermove', 60, 25))).toBe(false)
    expect(context.wheel).not.toHaveBeenCalled()

    context.controller.onPointerDown(pointer('pointerdown', 20, 20))
    context.setSelecting(true)
    expect(context.controller.onPointerMove(pointer('pointermove', 20, 80))).toBe(false)
    expect(context.wheel).not.toHaveBeenCalled()
  })

  it('suppresses only the click synthesized after a completed swipe', () => {
    vi.useFakeTimers()
    const context = setup()
    context.controller.onPointerDown(pointer('pointerdown', 100, 80))
    context.controller.onPointerMove(pointer('pointermove', 100, 120))
    context.controller.onPointerUp(pointer('pointerup', 100, 120))

    const firstClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    expect(context.controller.onClick(firstClick)).toBe(true)
    expect(firstClick.defaultPrevented).toBe(true)
    expect(context.controller.onClick(new MouseEvent('click', { cancelable: true }))).toBe(false)
  })

  it('expires click suppression and clears pending state on dispose', () => {
    vi.useFakeTimers()
    const context = setup()
    expect(context.controller.onPointerUp(pointer('pointerup', 100, 80))).toBe(false)

    context.controller.onPointerDown(pointer('pointerdown', 100, 80))
    context.controller.onPointerMove(pointer('pointermove', 100, 120))
    context.controller.onPointerUp(pointer('pointerup', 100, 120))
    vi.advanceTimersByTime(350)

    expect(context.controller.onClick(new MouseEvent('click', { cancelable: true }))).toBe(false)
    context.controller.onPointerDown(pointer('pointerdown', 100, 80))
    context.controller.onPointerMove(pointer('pointermove', 100, 120))
    context.controller.onPointerUp(pointer('pointerup', 100, 120))
    context.controller.dispose()
    expect(context.controller.onClick(new MouseEvent('click', { cancelable: true }))).toBe(false)
  })
})
