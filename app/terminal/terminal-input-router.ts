import type { InputMode } from '../types/session'
import { isOscColorReport } from './terminal-color-report'
import { isTerminalTouchWheelEvent } from './terminal-touch-scroll'

interface TerminalInputRouterOptions {
  enableStdin: () => void
  inputMode: () => InputMode
  isActive: () => boolean
  isAttached?: () => boolean
  isAsyncWheelEnabled: () => boolean
  isMouseTrackingEnabled: () => boolean
  resolveWheelCell?: (event: WheelEvent) => { col: number, row: number }
  restoreInputMode: () => void
  scheduleRestore?: (callback: () => void) => void
  sendInput: (data: string) => void
  sendScroll: (direction: 'down' | 'up', lineCount?: 1) => void
  sendWheelInput: (data: string, encoding: 'binary' | 'utf8', lineCount?: 1) => void
}

export function sgrWheelReport(
  direction: 'down' | 'up',
  col = 1,
  row = 1,
): string {
  return `\x1b[<${direction === 'up' ? 64 : 65};${Math.max(1, col)};${Math.max(1, row)}M`
}

export interface TerminalInputRouter {
  dispose: () => void
  onBinary: (data: string) => void
  onData: (data: string) => void
  onWheel: (event?: WheelEvent) => boolean
}

export function createTerminalInputRouter(options: TerminalInputRouterOptions): TerminalInputRouter {
  let disposed = false
  let routingWheel = false
  let wheelLineCount: 1 | undefined
  const scheduleRestore = options.scheduleRestore ?? queueMicrotask

  return {
    dispose(): void {
      disposed = true
      routingWheel = false
      wheelLineCount = undefined
    },
    onBinary(data: string): void {
      if (disposed || !options.isActive() || !routingWheel) return
      if (wheelLineCount) options.sendWheelInput(data, 'binary', wheelLineCount)
      else options.sendWheelInput(data, 'binary')
    },
    onData(data: string): void {
      if (disposed) return
      if (isOscColorReport(data)) {
        if (options.isAttached?.() ?? options.isActive()) options.sendInput(data)
        return
      }
      if (!options.isActive()) return
      if (routingWheel) {
        if (wheelLineCount) options.sendWheelInput(data, 'utf8', wheelLineCount)
        else options.sendWheelInput(data, 'utf8')
      }
      else if (options.inputMode() === 'live') {
        options.sendInput(data)
      }
    },
    onWheel(event?: WheelEvent): boolean {
      if (disposed || !options.isActive()) return true

      const asyncWheel = options.inputMode() === 'async' && options.isAsyncWheelEnabled()
      const wheelEnabled = options.inputMode() === 'live' || asyncWheel
      if (!wheelEnabled) return true

      if (!options.isMouseTrackingEnabled()) {
        if (!event || event.deltaY === 0) return false
        event.preventDefault()
        const cell = options.resolveWheelCell?.(event) ?? { col: 1, row: 1 }
        const lineCount = isTerminalTouchWheelEvent(event) ? 1 : undefined
        if (lineCount) {
          options.sendWheelInput(
            sgrWheelReport(event.deltaY < 0 ? 'up' : 'down', cell.col, cell.row),
            'utf8',
            lineCount,
          )
        }
        else {
          options.sendWheelInput(
            sgrWheelReport(event.deltaY < 0 ? 'up' : 'down', cell.col, cell.row),
            'utf8',
          )
        }
        return false
      }

      routingWheel = true
      wheelLineCount = isTerminalTouchWheelEvent(event) ? 1 : undefined
      if (asyncWheel) {
        options.enableStdin()
      }
      scheduleRestore(() => {
        if (disposed) return
        routingWheel = false
        wheelLineCount = undefined
        if (asyncWheel) options.restoreInputMode()
      })

      return true
    },
  }
}
