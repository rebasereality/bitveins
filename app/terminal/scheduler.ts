export interface ScheduledTask {
  cancel(): void
}

export interface Scheduler {
  schedule(callback: () => void, delayMs: number): ScheduledTask
}

export class BrowserScheduler implements Scheduler {
  schedule(callback: () => void, delayMs: number): ScheduledTask {
    const timer = window.setTimeout(callback, delayMs)
    return {
      cancel() {
        window.clearTimeout(timer)
      },
    }
  }
}
