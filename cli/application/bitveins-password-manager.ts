import { CliTransactionError } from '../core/cli-error'
import { incrementAuthVersion } from '../core/environment-file'
import type { CliOutput } from '../ports/cli-output'
import type { EnvironmentRepository } from '../ports/environment-repository'
import type { HealthProbe } from '../ports/health-probe'
import type { PasswordReader } from '../ports/password-reader'
import type { ServiceManager } from '../ports/service-manager'
import { hashBitveinsPassword } from '../../shared/security/password-hasher'

export class BitveinsPasswordManager {
  constructor(private readonly dependencies: {
    environment: EnvironmentRepository
    health: HealthProbe
    output: CliOutput
    passwordReader: PasswordReader
    service: ServiceManager
  }) {}

  async rotate(): Promise<void> {
    const previous = await this.dependencies.environment.read()
    const next = {
      ...previous,
      authPasswordHash: await hashBitveinsPassword(
        await this.dependencies.passwordReader.readNewPassword(),
      ),
      authVersion: incrementAuthVersion(previous.authVersion),
    }

    await this.dependencies.environment.write(next)
    try {
      await this.dependencies.service.restart()
      await this.dependencies.health.waitUntilHealthy(next.port)
    }
    catch (operationError) {
      this.dependencies.output.error(
        'Password rotation failed; restoring the previous configuration.',
      )
      try {
        await this.dependencies.environment.write(previous)
        await this.dependencies.service.restart()
        await this.dependencies.health.waitUntilHealthy(previous.port)
      }
      catch (rollbackError) {
        throw new CliTransactionError(
          'Password rotation and automatic rollback both failed.',
          {
            cause: new AggregateError([operationError, rollbackError]),
            details: [
              `rotation: ${this.message(operationError)}`,
              `rollback: ${this.message(rollbackError)}`,
            ],
          },
        )
      }
      throw operationError
    }

    this.dependencies.output.success(
      'Bitveins password changed and existing sessions revoked.',
    )
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
