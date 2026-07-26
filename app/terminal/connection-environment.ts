export type ConnectionEnvironmentEvent = 'check' | 'offline'

export interface EnvironmentSubscription {
  dispose(): void
}

export interface ConnectionEnvironment {
  isOnline(): boolean
  isVisible(): boolean
  subscribe(listener: (event: ConnectionEnvironmentEvent) => void): EnvironmentSubscription
}

const WATCHDOG_INTERVAL_MS = 15_000

export class BrowserConnectionEnvironment implements ConnectionEnvironment {
  isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine
  }

  isVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible'
  }

  subscribe(listener: (event: ConnectionEnvironmentEvent) => void): EnvironmentSubscription {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { dispose() {} }
    }

    const check = () => listener('check')
    const offline = () => listener('offline')
    document.addEventListener('visibilitychange', check)
    window.addEventListener('online', check)
    window.addEventListener('offline', offline)
    window.addEventListener('pageshow', check)
    const timer = window.setInterval(check, WATCHDOG_INTERVAL_MS)

    return {
      dispose() {
        window.clearInterval(timer)
        document.removeEventListener('visibilitychange', check)
        window.removeEventListener('online', check)
        window.removeEventListener('offline', offline)
        window.removeEventListener('pageshow', check)
      },
    }
  }
}
