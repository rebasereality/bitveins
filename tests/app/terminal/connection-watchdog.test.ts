import { describe, expect, it, vi } from 'vitest'
import { ConnectionWatchdog } from '../../../app/terminal/connection-watchdog'
import type { ScheduledTask, Scheduler } from '../../../app/terminal/scheduler'

class TestScheduler implements Scheduler {
  tasks: Array<{ callback: () => void, cancelled: boolean }> = []

  schedule(callback: () => void): ScheduledTask {
    const task = {
      callback,
      cancelled: false,
      cancel() {
        task.cancelled = true
      },
    }
    this.tasks.push(task)
    return task
  }

  run(): void {
    for (const task of this.tasks.splice(0)) {
      if (!task.cancelled) task.callback()
    }
  }
}

describe('terminal connection watchdog', () => {
  it('allows only one in-flight probe and clears it on server activity', () => {
    let now = 0
    const scheduler = new TestScheduler()
    const onTimeout = vi.fn()
    const send = vi.fn(() => true)
    const watchdog = new ConnectionWatchdog({
      clock: () => now,
      onTimeout,
      scheduler,
      staleMs: 100,
      timeoutMs: 20,
    })

    watchdog.activity()
    now = 100

    expect(watchdog.probe(send)).toBe(true)
    expect(watchdog.probe(send)).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)

    watchdog.activity()
    scheduler.run()
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('times out one unanswered probe exactly once', () => {
    let now = 0
    const scheduler = new TestScheduler()
    const onTimeout = vi.fn()
    const watchdog = new ConnectionWatchdog({
      clock: () => now,
      onTimeout,
      scheduler,
      staleMs: 100,
      timeoutMs: 20,
    })

    watchdog.activity()
    now = 100
    watchdog.probe(() => true)
    scheduler.run()

    expect(onTimeout).toHaveBeenCalledTimes(1)
    scheduler.run()
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not start a probe while fresh or when sending fails', () => {
    let now = 0
    const scheduler = new TestScheduler()
    const watchdog = new ConnectionWatchdog({
      clock: () => now,
      onTimeout: vi.fn(),
      scheduler,
      staleMs: 100,
      timeoutMs: 20,
    })

    watchdog.activity()
    expect(watchdog.probe(() => true)).toBe(false)
    now = 100
    expect(watchdog.probe(() => false)).toBe(false)
    expect(scheduler.tasks).toEqual([])
  })

  it('uses the system clock when no clock is injected', () => {
    const scheduler = new TestScheduler()
    const watchdog = new ConnectionWatchdog({
      onTimeout: vi.fn(),
      scheduler,
      staleMs: Number.MAX_SAFE_INTEGER,
      timeoutMs: 20,
    })

    watchdog.activity()

    expect(watchdog.isStale()).toBe(false)
  })
})
