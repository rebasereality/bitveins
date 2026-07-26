import type {
  HealthProbe,
  HealthProbeOptions,
} from '../ports/health-probe'
import { waitForBitveinsHealth } from './health-check'

export class NodeHealthProbe implements HealthProbe {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async waitUntilHealthy(
    port: number,
    options: HealthProbeOptions = {},
  ): Promise<void> {
    await waitForBitveinsHealth(port, {
      ...options,
      fetcher: this.fetcher,
    })
  }
}
