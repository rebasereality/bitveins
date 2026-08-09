// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTerminalTouchScrollController,
  isTerminalTouchWheelEvent,
} from '../../../app/terminal/terminal-touch-scroll'

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'touch',
  })
}

function setup(options: {
  bufferType?: string
  mouseTrackingMode?: string
} = {}) {
  const host = document.createElement('div')
  const terminalElement = document.createElement('div')
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  terminalElement.appendChild(screen)
  host.appendChild(terminalElement)
  vi.spyOn(screen, 'getBoundingClientRect').mockReturnValue({
    bottom: 200,
    height: 200,
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
    isEnabled: () => true,
    isSelecting: () => selecting,
    terminal: () => ({
      buffer: { active: { type: options.bufferType ?? 'alternate' } },
      element: terminalElement,
      modes: { mouseTrackingMode: options.mouseTrackingMode ?? 'none' },
      rows: 10,
      scrollLines,
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

  it('scrolls the normal xterm buffer exactly one line per computed row', () => {
    const context = setup({ bufferType: 'normal' })
    context.controller.onPointerDown(pointer('pointerdown', 100, 80))
    context.controller.onPointerMove(pointer('pointermove', 100, 120))
    context.controller.onPointerMove(pointer('pointermove', 100, 100))

    expect(context.scrollLines.mock.calls.map(([amount]) => amount)).toEqual([-1, -1, 1])
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
})
