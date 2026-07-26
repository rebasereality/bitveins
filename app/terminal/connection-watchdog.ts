import type { ScheduledTask, Scheduler } from './scheduler'

interface ConnectionWatchdogOptions {
  clock?: () => number
  onTimeout: () => void
  scheduler: Scheduler
  staleMs: number
  timeoutMs: number
}

export class ConnectionWatchdog {
  private readonly clock: () => number
  private lastActivity = 0
  private probeTask: ScheduledTask | null = null

  constructor(private readonly options: ConnectionWatchdogOptions) {
    this.clock = options.clock ?? Date.now
  }

  activity(): void {
    this.lastActivity = this.clock()
    this.clearProbe()
  }

  isStale(): boolean {
    return this.clock() - this.lastActivity >= this.options.staleMs
  }

  probe(send: () => boolean): boolean {
    if (this.probeTask || !this.isStale() || !send()) {
      return false
    }

    this.probeTask = this.options.scheduler.schedule(() => {
      this.probeTask = null
      this.options.onTimeout()
    }, this.options.timeoutMs)
    return true
  }

  reset(): void {
    this.lastActivity = 0
    this.clearProbe()
  }

  dispose(): void {
    this.clearProbe()
  }

  private clearProbe(): void {
    this.probeTask?.cancel()
    this.probeTask = null
  }
}
