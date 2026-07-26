import type { BitveinsEnvironment } from '../../core/environment-file'
import type { ReleaseActivationSnapshot } from '../../ports/release-store'

export class InstallationSnapshot {
  readonly environment: BitveinsEnvironment | null
  readonly release: ReleaseActivationSnapshot
  readonly serviceUnit: string | null

  constructor(values: {
    environment: BitveinsEnvironment | null
    release: ReleaseActivationSnapshot
    serviceUnit: string | null
  }) {
    this.environment = values.environment
      ? Object.freeze({
          ...values.environment,
          allowedOrigins: Object.freeze([...values.environment.allowedOrigins]),
          extensions: Object.freeze({ ...values.environment.extensions }),
        })
      : null
    this.release = Object.freeze({ ...values.release })
    this.serviceUnit = values.serviceUnit
    Object.freeze(this)
  }
}
