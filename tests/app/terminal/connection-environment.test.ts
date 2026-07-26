// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserConnectionEnvironment } from '../../../app/terminal/connection-environment'
import { BrowserScheduler } from '../../../app/terminal/scheduler'

describe('browser connection adapters', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reports browser lifecycle events and disposes every listener', () => {
    const environment = new BrowserConnectionEnvironment()
    const events: string[] = []
    const subscription = environment.subscribe(event => events.push(event))

    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('pageshow'))
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(15_000)

    expect(events).toEqual(['offline', 'check', 'check', 'check', 'check'])
    expect(environment.isOnline()).toBe(navigator.onLine)
    expect(environment.isVisible()).toBe(document.visibilityState === 'visible')

    subscription.dispose()
    window.dispatchEvent(new Event('offline'))
    vi.advanceTimersByTime(15_000)
    expect(events).toHaveLength(5)
  })

  it('cancels scheduled browser work through its object handle', () => {
    const callback = vi.fn()
    const task = new BrowserScheduler().schedule(callback, 100)
    task.cancel()
    vi.advanceTimersByTime(100)

    expect(callback).not.toHaveBeenCalled()
  })

  it('provides inert server-side adapters when browser globals are absent', () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('navigator', undefined)
    const environment = new BrowserConnectionEnvironment()
    const listener = vi.fn()

    expect(environment.isOnline()).toBe(true)
    expect(environment.isVisible()).toBe(true)
    expect(() => environment.subscribe(listener).dispose()).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })
})
