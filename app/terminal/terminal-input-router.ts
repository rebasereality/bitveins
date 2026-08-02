import type { InputMode } from '../types/session'

interface TerminalInputRouterOptions {
  enableStdin: () => void
  inputMode: () => InputMode
  isActive: () => boolean
  isAsyncWheelEnabled: () => boolean
  isMouseTrackingEnabled: () => boolean
  restoreInputMode: () => void
  scheduleRestore?: (callback: () => void) => void
  sendInput: (data: string) => void
  sendWheelInput: (data: string, encoding: 'binary' | 'utf8') => void
}

export interface TerminalInputRouter {
  dispose: () => void
  onBinary: (data: string) => void
  onData: (data: string) => void
  onWheel: () => boolean
}

export function createTerminalInputRouter(options: TerminalInputRouterOptions): TerminalInputRouter {
  let disposed = false
  let routingWheel = false
  const scheduleRestore = options.scheduleRestore ?? queueMicrotask

  return {
    dispose(): void {
      disposed = true
      routingWheel = false
    },
    onBinary(data: string): void {
      if (disposed || !options.isActive() || !routingWheel) return
      options.sendWheelInput(data, 'binary')
    },
    onData(data: string): void {
      if (disposed || !options.isActive()) return
      if (routingWheel) {
        options.sendWheelInput(data, 'utf8')
      }
      else if (options.inputMode() === 'live') {
        options.sendInput(data)
      }
    },
    onWheel(): boolean {
      if (disposed || !options.isActive()) return true

      if (!options.isMouseTrackingEnabled()) return true

      const asyncWheel = options.inputMode() === 'async' && options.isAsyncWheelEnabled()
      if (options.inputMode() !== 'live' && !asyncWheel) return true

      routingWheel = true
      if (asyncWheel) {
        options.enableStdin()
      }
      scheduleRestore(() => {
        if (disposed) return
        routingWheel = false
        if (asyncWheel) options.restoreInputMode()
      })

      return true
    },
  }
}
