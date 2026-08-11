interface TouchScrollTerminal {
  readonly element?: HTMLElement
  readonly rows: number
}

interface TerminalTouchScrollOptions {
  isEnabled: () => boolean
  isSelecting: () => boolean
  terminal: () => TouchScrollTerminal | null
  terminalHost: () => HTMLElement | null
}

export const terminalTouchScrollThreshold = 12
const fallbackLineHeight = 16
const maxWheelEventsPerMove = 32
const touchWheelEvents = new WeakSet<WheelEvent>()

export function isTerminalTouchWheelEvent(event?: WheelEvent): boolean {
  return Boolean(event && touchWheelEvents.has(event))
}

export function markTerminalTouchWheelEvent(event: WheelEvent): WheelEvent {
  touchWheelEvents.add(event)
  return event
}

export function createTerminalTouchScrollController(options: TerminalTouchScrollOptions) {
  let activePointerId: number | null = null
  let clickResetTimer: ReturnType<typeof setTimeout> | null = null
  let lastY = 0
  let pixelRemainder = 0
  let scrolling = false
  let startX = 0
  let startY = 0
  let suppressNextClick = false
  let wheelTarget: EventTarget | null = null

  function resetGesture(): void {
    activePointerId = null
    lastY = 0
    pixelRemainder = 0
    scrolling = false
    startX = 0
    startY = 0
    wheelTarget = null
  }

  function cancel(): void {
    resetGesture()
  }

  function lineHeight(): number {
    const terminal = options.terminal()
    const screen = options.terminalHost()?.querySelector<HTMLElement>('.xterm-screen')
    const height = screen?.getBoundingClientRect().height ?? 0
    return terminal && terminal.rows > 0 && height > 0
      ? height / terminal.rows
      : fallbackLineHeight
  }

  function resolveWheelTarget(candidate: EventTarget | null): EventTarget | null {
    const terminalElement = options.terminal()?.element
    if (!terminalElement) return null
    if (candidate instanceof Node && terminalElement.contains(candidate)) return candidate
    return terminalElement.querySelector('.xterm-screen') ?? terminalElement
  }

  function dispatchWheel(direction: 'down' | 'up', source: PointerEvent): void {
    const target = wheelTarget ?? resolveWheelTarget(source.target)
    if (!target) return
    const wheelEvent = markTerminalTouchWheelEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: source.clientX,
      clientY: source.clientY,
      composed: true,
      deltaMode: WheelEvent.DOM_DELTA_LINE,
      deltaY: direction === 'up' ? -1 : 1,
      view: window,
    }))
    target.dispatchEvent(wheelEvent)
  }

  function consumeMovement(event: PointerEvent): void {
    pixelRemainder += event.clientY - lastY
    lastY = event.clientY
    const height = lineHeight()
    const availableLines = Math.trunc(pixelRemainder / height)
    const lines = Math.sign(availableLines) * Math.min(
      Math.abs(availableLines),
      maxWheelEventsPerMove,
    )
    if (lines === 0) return
    pixelRemainder -= lines * height
    const direction = lines > 0 ? 'up' : 'down'
    for (let index = 0; index < Math.abs(lines); index += 1) {
      dispatchWheel(direction, event)
    }
  }

  function onPointerDown(event: PointerEvent): void {
    if (
      event.pointerType !== 'touch'
      || !options.isEnabled()
      || options.isSelecting()
      || activePointerId !== null
    ) return
    activePointerId = event.pointerId
    lastY = event.clientY
    startX = event.clientX
    startY = event.clientY
    wheelTarget = resolveWheelTarget(event.target)
  }

  function onPointerMove(event: PointerEvent): boolean {
    if (event.pointerType !== 'touch' || activePointerId !== event.pointerId) return false
    if (options.isSelecting()) {
      resetGesture()
      return false
    }
    if (!scrolling) {
      const deltaX = event.clientX - startX
      const deltaY = event.clientY - startY
      if (Math.hypot(deltaX, deltaY) <= terminalTouchScrollThreshold) return false
      if (Math.abs(deltaY) <= Math.abs(deltaX)) {
        resetGesture()
        return false
      }
      scrolling = true
      try {
        options.terminalHost()?.setPointerCapture(event.pointerId)
      }
      catch {
        // Synthetic and browser-canceled touch streams cannot always be captured.
      }
    }
    event.preventDefault()
    consumeMovement(event)
    return true
  }

  function onPointerUp(event: PointerEvent): boolean {
    if (event.pointerType !== 'touch' || activePointerId !== event.pointerId) return false
    const wasScrolling = scrolling
    if (wasScrolling) {
      event.preventDefault()
      suppressNextClick = true
      if (clickResetTimer) clearTimeout(clickResetTimer)
      clickResetTimer = setTimeout(() => {
        suppressNextClick = false
        clickResetTimer = null
      }, 350)
    }
    try {
      options.terminalHost()?.releasePointerCapture(event.pointerId)
    }
    catch {
      // Ignore stale captures after OS/browser gesture cancellation.
    }
    resetGesture()
    return wasScrolling
  }

  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerType === 'touch' && activePointerId === event.pointerId) resetGesture()
  }

  function onClick(event: MouseEvent): boolean {
    if (!suppressNextClick) return false
    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = false
    return true
  }

  function dispose(): void {
    if (clickResetTimer) clearTimeout(clickResetTimer)
    clickResetTimer = null
    suppressNextClick = false
    resetGesture()
  }

  return {
    cancel,
    dispose,
    onClick,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
