import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BitveinsPasswordManager } from '../../../cli/application/bitveins-password-manager'
import { resolveInstallationLayout } from '../../../cli/core/installation-layout'
import { FilesystemEnvironmentRepository } from '../../../cli/platform/filesystem-environment-repository'
import type { PasswordReader } from '../../../cli/ports/password-reader'
import {
  hashBitveinsPassword,
  verifyBitveinsPassword,
} from '../../../shared/security/password-hasher'
import {
  FakeHealthProbe,
  FakeServiceManager,
  RecordingCliOutput,
} from '../support/cli-fakes'
import { createEnvironmentFixture } from '../support/release-fixture'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

class FixedPassword implements PasswordReader {
  async readNewPassword(): Promise<string> {
    return 'a newly rotated secure password'
  }
}

async function configuredManager(prefix: string) {
  const home = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(home)
  const layout = resolveInstallationLayout({ HOME: home })
  const environment = new FilesystemEnvironmentRepository(layout)
  await environment.write(createEnvironmentFixture({
    authPasswordHash: await hashBitveinsPassword(
      'the original secure password',
    ),
    authVersion: '9',
    port: 3000,
    sessionPassword: 'a'.repeat(64),
  }))
  const health = new FakeHealthProbe()
  const output = new RecordingCliOutput()
  const service = new FakeServiceManager()
  const manager = new BitveinsPasswordManager({
    environment,
    health,
    output,
    passwordReader: new FixedPassword(),
    service,
  })
  return { environment, health, manager, output, service }
}

describe('BitveinsPasswordManager', () => {
  it('rotates the hash and revokes existing auth sessions', async () => {
    const fixture = await configuredManager('bitveins-password-')

    await fixture.manager.rotate()

    const environment = await fixture.environment.read()
    expect(environment.authVersion).toBe('10')
    await expect(verifyBitveinsPassword(
      environment.authPasswordHash,
      'a newly rotated secure password',
    )).resolves.toBe(true)
    expect(fixture.service.calls).toEqual(['restart'])
    expect(fixture.health.calls).toHaveLength(1)
  })

  it('restores the previous configuration when the rotated service is unhealthy', async () => {
    const fixture = await configuredManager('bitveins-password-rollback-')
    const previous = await fixture.environment.read()
    fixture.health.outcomes.push(
      new Error('rotated service unhealthy'),
      null,
    )

    await expect(fixture.manager.rotate()).rejects.toThrow(
      /rotated service unhealthy/,
    )

    expect(await fixture.environment.read()).toEqual(previous)
    expect(fixture.service.calls).toEqual(['restart', 'restart'])
    expect(fixture.health.calls).toHaveLength(2)
  })

  it('throws CliTransactionError when both rotation and rollback fail', async () => {
    const fixture = await configuredManager('bitveins-password-dual-fail-')
    fixture.health.outcomes.push(
      new Error('rotation failed'),
      new Error('rollback failed'),
    )

    await expect(fixture.manager.rotate()).rejects.toThrow(
      /Password rotation and automatic rollback both failed/,
    )
  })
})
