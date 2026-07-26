import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BitveinsUpdater } from '../../../cli/application/bitveins-updater'
import { resolveInstallationLayout } from '../../../cli/core/installation-layout'
import { FilesystemEnvironmentRepository } from '../../../cli/platform/filesystem-environment-repository'
import { FilesystemReleaseStore } from '../../../cli/platform/filesystem-release-store'
import type {
  DownloadedRelease,
  ReleaseSource,
} from '../../../cli/ports/release-source'
import type {
  InstalledRelease,
  ReleaseActivationSnapshot,
  ReleaseBundle,
  ReleaseStore,
} from '../../../cli/ports/release-store'
import { RecordingCliOutput } from '../support/cli-fakes'
import { createEnvironmentFixture } from '../support/release-fixture'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

async function createBundle(
  root: string,
  version: string,
  commit: string,
): Promise<string> {
  const bundle = join(root, version)
  await Promise.all([
    mkdir(join(bundle, 'app', '.output', 'server'), { recursive: true }),
    mkdir(join(bundle, 'bin'), { recursive: true }),
    mkdir(join(bundle, 'runtime', 'bin'), { recursive: true }),
    mkdir(join(bundle, 'share', 'bitveins'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(bundle, 'app', '.output', 'server', 'index.mjs'), ''),
    writeFile(join(bundle, 'bin', 'bitveins'), '', { mode: 0o755 }),
    writeFile(join(bundle, 'runtime', 'bin', 'node'), '', { mode: 0o755 }),
    writeFile(
      join(bundle, 'share', 'bitveins', 'release.json'),
      JSON.stringify({
        architecture: 'x64',
        commit,
        nodeVersion: 'v24.13.0',
        platform: 'linux',
        version,
      }),
    ),
  ])
  return bundle
}

class FixedReleaseSource implements ReleaseSource {
  cleanupCalls = 0

  constructor(private readonly root: string) {}

  async download(): Promise<DownloadedRelease> {
    return {
      cleanup: async () => {
        this.cleanupCalls += 1
      },
      root: this.root,
    }
  }
}

class RecordingInstaller {
  readonly calls: Array<{ port: number, releaseRoot: string }> = []
  error: Error | null = null

  async install(options: { port: number, releaseRoot: string }): Promise<void> {
    this.calls.push(options)
    if (this.error) {
      throw this.error
    }
  }
}

function release(version: string, commit: string): ReleaseBundle {
  return {
    metadata: {
      architecture: 'x64',
      commit,
      nodeVersion: process.version,
      platform: 'linux',
      version,
    },
    root: `/release/${version}`,
  }
}

class UpdateReleaseStore implements ReleaseStore {
  pruneError: Error | null = null

  constructor(
    readonly currentRelease: ReleaseBundle,
    readonly targetRelease: ReleaseBundle,
  ) {}

  async activate(): Promise<void> {}

  async current(): Promise<ReleaseBundle> {
    return this.currentRelease
  }

  async install(): Promise<InstalledRelease> {
    throw new Error('Not used by updater tests.')
  }

  async load(): Promise<ReleaseBundle> {
    return this.targetRelease
  }

  async prune(): Promise<void> {
    if (this.pruneError) {
      throw this.pruneError
    }
  }

  async recordActivation(): Promise<void> {}

  async removeInstalledRelease(): Promise<void> {}

  async removeInstallation(): Promise<void> {}

  async restore(): Promise<void> {}

  async snapshot(): Promise<ReleaseActivationSnapshot> {
    return { commandTarget: null, currentTarget: null, history: null }
  }
}

async function updaterFixture(options: {
  current: ReleaseBundle
  target: ReleaseBundle
}) {
  const root = await mkdtemp(join(tmpdir(), 'bitveins-update-case-'))
  temporaryDirectories.push(root)
  const layout = resolveInstallationLayout({ HOME: root })
  const environment = new FilesystemEnvironmentRepository(layout)
  await environment.write(createEnvironmentFixture({ port: 4567 }))
  const installer = new RecordingInstaller()
  const output = new RecordingCliOutput()
  const source = new FixedReleaseSource(options.target.root)
  const store = new UpdateReleaseStore(options.current, options.target)
  const updater = new BitveinsUpdater({
    environment,
    installer,
    output,
    releases: source,
    store,
  })
  return { installer, output, source, store, updater }
}

describe('BitveinsUpdater', () => {
  it('installs a newer verified bundle and always cleans its temporary files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-update-'))
    temporaryDirectories.push(root)
    const layout = resolveInstallationLayout({ HOME: join(root, 'home') })
    const current = await createBundle(
      layout.releasesDirectory,
      '0.1.0',
      'a'.repeat(40),
    )
    const target = await createBundle(root, '0.2.0', 'b'.repeat(40))
    await symlink(current, layout.currentReleaseLink)
    const environment = new FilesystemEnvironmentRepository(layout)
    await environment.write(createEnvironmentFixture({ port: 4567 }))
    const installer = new RecordingInstaller()
    const source = new FixedReleaseSource(target)
    const updater = new BitveinsUpdater({
      environment,
      installer,
      output: new RecordingCliOutput(),
      releases: source,
      store: new FilesystemReleaseStore(layout),
    })

    await updater.update('0.2.0')

    expect(installer.calls).toEqual([{ port: 4567, releaseRoot: target }])
    expect(source.cleanupCalls).toBe(1)
  })

  it('skips an identical release and still cleans the download', async () => {
    const current = release('0.2.0', 'b'.repeat(40))
    const fixture = await updaterFixture({ current, target: current })

    await fixture.updater.update()

    expect(fixture.installer.calls).toEqual([])
    expect(fixture.source.cleanupCalls).toBe(1)
    expect(fixture.output.infos).toContain(
      'Bitveins 0.2.0 is already installed.',
    )
  })

  it('allows an explicitly requested downgrade', async () => {
    const fixture = await updaterFixture({
      current: release('0.2.0', 'b'.repeat(40)),
      target: release('0.1.0', 'a'.repeat(40)),
    })

    await fixture.updater.update('0.1.0')

    expect(fixture.installer.calls).toEqual([{
      port: 4567,
      releaseRoot: '/release/0.1.0',
    }])
    expect(fixture.output.successes).toContain(
      'Updated Bitveins 0.2.0 → 0.1.0.',
    )
  })

  it('reports pruning failure without invalidating a healthy update', async () => {
    const fixture = await updaterFixture({
      current: release('0.1.0', 'a'.repeat(40)),
      target: release('0.2.0', 'b'.repeat(40)),
    })
    fixture.store.pruneError = new Error('read-only release directory')

    await fixture.updater.update()

    expect(fixture.output.infos).toContain(
      'Warning: old releases could not be pruned: read-only release directory',
    )
    expect(fixture.source.cleanupCalls).toBe(1)
  })

  it('cleans the download when installation fails', async () => {
    const fixture = await updaterFixture({
      current: release('0.1.0', 'a'.repeat(40)),
      target: release('0.2.0', 'b'.repeat(40)),
    })
    fixture.installer.error = new Error('activation failed')

    await expect(fixture.updater.update()).rejects.toThrow(
      'activation failed',
    )
    expect(fixture.source.cleanupCalls).toBe(1)
  })
})
