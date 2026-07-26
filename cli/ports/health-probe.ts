export interface HealthProbeOptions {
  attempts?: number
  delayMs?: number
}

export interface HealthProbe {
  waitUntilHealthy(port: number, options?: HealthProbeOptions): Promise<void>
}
