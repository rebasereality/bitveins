import type { BitveinsEnvironment } from '../core/environment-file'

export interface EnvironmentRepository {
  read(): Promise<BitveinsEnvironment>
  readOptional(): Promise<BitveinsEnvironment | null>
  remove(): Promise<void>
  write(environment: BitveinsEnvironment): Promise<void>
}
