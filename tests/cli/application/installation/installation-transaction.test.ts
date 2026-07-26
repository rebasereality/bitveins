import { describe, expect, it } from 'vitest'
import { InstallationSnapshot } from '../../../../cli/application/installation/installation-snapshot'
import { InstallationTransaction } from '../../../../cli/application/installation/installation-transaction'
import { CliTransactionError } from '../../../../cli/core/cli-error'
import type { BitveinsEnvironment } from '../../../../cli/core/environment-file'
import type { EnvironmentRepository } from '../../../../cli/ports/environment-repository'
import type {
  InstalledRelease,
  ReleaseActivationSnapshot,
  ReleaseBundle,
  ReleaseStore,
} from '../../../../cli/ports/release-store'
import type { ServiceUnitRepository } from '../../../../cli/ports/service-unit-repository'
import {
  FakeHealthProbe,
  FakeServiceManager,
  RecordingCliOutput,
} from '../../support/cli-fakes'
import { createEnvironmentFixture } from '../../support/release-fixture'

class MemoryEnvironmentRepository implements EnvironmentRepository {
  readonly writes: BitveinsEnvironment[] = []
  removeCalls = 0

  constructor(public value: BitveinsEnvironment | null) {}

  async read(): Promise<BitveinsEnvironment> {
    if (!this.value) {
      throw new Error('Environment is absent.')
    }
    return this.value
  }

  async readOptional(): Promise<BitveinsEnvironment | null> {
    return this.value
  }

  async remove(): Promise<void> {
    this.removeCalls += 1
    this.value = null
  }

  async write(environment: BitveinsEnvironment): Promise<void> {
    this.value = environment
    this.writes.push(environment)
  }
}

class MemoryReleaseStore implements ReleaseStore {
  activated: string | null = null
  readonly removed: string[] = []
  restoreError: Error | null = null

  constructor(public state: ReleaseActivationSnapshot) {}

  async activate(path: string): Promise<void> {
    this.activated = path
    this.state = {
      commandTarget: `/command/${path}`,
      currentTarget: path,
      history: this.state.history,
    }
  }

  async current(): Promise<ReleaseBundle> {
    throw new Error('Not used by transaction tests.')
  }

  async install(): Promise<InstalledRelease> {
    throw new Error('Not used by transaction tests.')
  }

  async load(): Promise<ReleaseBundle> {
    throw new Error('Not used by transaction tests.')
  }

  async prune(): Promise<void> {
    throw new Error('Not used by transaction tests.')
  }

  async recordActivation(
    path: string,
    previousTarget: string | null,
  ): Promise<void> {
    this.state = {
      ...this.state,
      history: {
        current: path,
        previous: previousTarget,
        version: 1,
      },
    }
  }

  async removeInstalledRelease(path: string): Promise<void> {
    this.removed.push(path)
  }

  async removeInstallation(): Promise<void> {
    throw new Error('Not used by transaction tests.')
  }

  async restore(snapshot: ReleaseActivationSnapshot): Promise<void> {
    if (this.restoreError) {
      throw this.restoreError
    }
    this.state = snapshot
  }

  async snapshot(): Promise<ReleaseActivationSnapshot> {
    return this.state
  }
}

class MemoryServiceUnitRepository implements ServiceUnitRepository {
  installCalls = 0
  readonly restores: Array<string | null> = []

  constructor(public content: string | null) {}

  async install(): Promise<void> {
    this.installCalls += 1
    this.content = 'new unit'
  }

  async readOptional(): Promise<string | null> {
    return this.content
  }

  async restore(content: string | null): Promise<void> {
    this.content = content
    this.restores.push(content)
  }
}

function installedRelease(created = true): InstalledRelease {
  return {
    bundle: {
      metadata: {
        architecture: 'x64',
        commit: 'b'.repeat(40),
        nodeVersion: process.version,
        platform: 'linux',
        version: '0.2.0',
      },
      root: '/source/0.2.0',
    },
    created,
    path: '/releases/0.2.0',
  }
}

function transactionFixture(options: {
  environment?: BitveinsEnvironment | null
  release?: ReleaseActivationSnapshot
  serviceUnit?: string | null
} = {}) {
  const environment = new MemoryEnvironmentRepository(
    options.environment === undefined
      ? createEnvironmentFixture({ port: 3000 })
      : options.environment,
  )
  const health = new FakeHealthProbe()
  const output = new RecordingCliOutput()
  const releases = new MemoryReleaseStore(options.release ?? {
    commandTarget: '/command/0.1.0',
    currentTarget: '/releases/0.1.0',
    history: {
      current: '/releases/0.1.0',
      previous: null,
      version: 1,
    },
  })
  const service = new FakeServiceManager()
  const serviceUnit = new MemoryServiceUnitRepository(
    options.serviceUnit === undefined ? 'old unit' : options.serviceUnit,
  )
  const transaction = new InstallationTransaction({
    environment,
    health,
    output,
    releases,
    service,
    serviceUnit,
  })
  return {
    environment,
    health,
    output,
    releases,
    service,
    serviceUnit,
    transaction,
  }
}

describe('InstallationSnapshot', () => {
  it('owns immutable copies of nested configuration values', () => {
    const source = createEnvironmentFixture({
      allowedOrigins: ['http://127.0.0.1:3000'],
      extensions: { BITVEINS_CUSTOM: 'before' },
    })
    const snapshot = new InstallationSnapshot({
      environment: source,
      release: { commandTarget: null, currentTarget: null, history: null },
      serviceUnit: null,
    })

    source.allowedOrigins.push('https://mutated.example')
    source.extensions.BITVEINS_CUSTOM = 'after'

    expect(snapshot.environment?.allowedOrigins).toEqual([
      'http://127.0.0.1:3000',
    ])
    expect(snapshot.environment?.extensions).toEqual({
      BITVEINS_CUSTOM: 'before',
    })
    expect(Object.isFrozen(snapshot.environment)).toBe(true)
  })
})

describe('InstallationTransaction', () => {
  it('captures repositories and activates a healthy update', async () => {
    const fixture = transactionFixture()
    const snapshot = await fixture.transaction.capture()
    const environment = createEnvironmentFixture({ port: 4567 })

    await fixture.transaction.activate({
      environment,
      release: installedRelease(),
      snapshot,
      writeEnvironment: false,
    })

    expect(fixture.environment.writes).toEqual([])
    expect(fixture.releases.activated).toBe('/releases/0.2.0')
    expect(fixture.serviceUnit.installCalls).toBe(1)
    expect(fixture.service.calls).toEqual([
      'daemonReload',
      'enableAndStart',
      'restart',
    ])
    expect(fixture.health.calls).toEqual([{ options: {}, port: 4567 }])
  })

  it('removes a failed first installation and restores the empty state', async () => {
    const fixture = transactionFixture({
      environment: null,
      release: { commandTarget: null, currentTarget: null, history: null },
      serviceUnit: null,
    })
    const snapshot = await fixture.transaction.capture()
    const environment = createEnvironmentFixture({ port: 4567 })
    fixture.health.outcomes.push(new Error('new release unhealthy'))

    await expect(fixture.transaction.activate({
      environment,
      release: installedRelease(),
      snapshot,
      writeEnvironment: true,
    })).rejects.toThrow('new release unhealthy')

    expect(fixture.environment.value).toBeNull()
    expect(fixture.environment.removeCalls).toBe(1)
    expect(fixture.releases.state).toEqual(snapshot.release)
    expect(fixture.releases.removed).toEqual(['/releases/0.2.0'])
    expect(fixture.serviceUnit.content).toBeNull()
    expect(fixture.service.calls).toEqual([
      'daemonReload',
      'enableAndStart',
      'daemonReload',
      'disable',
    ])
  })

  it('restores and health-checks the previous installation after a failed update', async () => {
    const previous = createEnvironmentFixture({ port: 3000 })
    const fixture = transactionFixture({ environment: previous })
    const snapshot = await fixture.transaction.capture()
    fixture.health.outcomes.push(new Error('new release unhealthy'), null)

    await expect(fixture.transaction.activate({
      environment: previous,
      release: installedRelease(false),
      snapshot,
      writeEnvironment: false,
    })).rejects.toThrow('new release unhealthy')

    expect(fixture.environment.value).toEqual(previous)
    expect(fixture.releases.state).toEqual(snapshot.release)
    expect(fixture.serviceUnit.content).toBe('old unit')
    expect(fixture.health.calls.map(call => call.port)).toEqual([3000, 3000])
    expect(fixture.service.calls).toEqual([
      'daemonReload',
      'enableAndStart',
      'restart',
      'daemonReload',
      'restart',
    ])
  })

  it('exposes both causes when activation and rollback fail', async () => {
    const fixture = transactionFixture()
    const snapshot = await fixture.transaction.capture()
    fixture.health.outcomes.push(new Error('activation failed'))
    fixture.releases.restoreError = new Error('rollback failed')

    const failure = await fixture.transaction.activate({
      environment: createEnvironmentFixture(),
      release: installedRelease(),
      snapshot,
      writeEnvironment: false,
    }).catch(error => error)

    expect(failure).toBeInstanceOf(CliTransactionError)
    expect(failure.details).toEqual([
      'operation: activation failed',
      'rollback: rollback failed',
    ])
    expect(failure.cause).toBeInstanceOf(AggregateError)
  })
})
