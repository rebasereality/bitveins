import {
  mkdtemp,
  rm,
  symlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import { BitveinsDoctor } from '../../../cli/application/bitveins-doctor'
import { resolveInstallationLayout } from '../../../cli/core/installation-layout'
import { FilesystemEnvironmentRepository } from '../../../cli/platform/filesystem-environment-repository'
import { FilesystemReleaseStore } from '../../../cli/platform/filesystem-release-store'
import {
  FakeHealthProbe,
  FakeHostInspector,
  FakeServiceManager,
  RecordingCliOutput,
} from '../support/cli-fakes'
import {
  createReleaseFixture,
  writeEnvironmentFixture,
} from '../support/release-fixture'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

async function healthyInstallation() {
  const home = await mkdtemp(join(tmpdir(), 'bitveins-doctor-'))
  temporaryDirectories.push(home)
  const layout = resolveInstallationLayout({ HOME: home })
  const release = await createReleaseFixture(layout)
  await symlink(release, layout.currentReleaseLink)
  await writeEnvironmentFixture(layout)
  return layout
}

describe('BitveinsDoctor', () => {
  it('reports a healthy loopback-only installation', async () => {
    const layout = await healthyInstallation()
    const output = new RecordingCliOutput()
    const host = new FakeHostInspector()
    host.addresses = ['127.0.0.1:4567']
    const doctor = new BitveinsDoctor({
      environment: new FilesystemEnvironmentRepository(layout),
      health: new FakeHealthProbe(),
      host,
      layout,
      output,
      releases: new FilesystemReleaseStore(layout),
      service: new FakeServiceManager(),
    })

    const report = await doctor.diagnose()

    expect(report).toEqual({ errors: [], warnings: [] })
    expect(output.errors).toEqual([])
    expect(output.successes).toEqual(['Bitveins installation is healthy.'])
    expect(output.infos).toContain(
      `Release 0.1.0 (${'a'.repeat(40)}, Node ${process.version})`,
    )
  })

  it('collects configuration, service, listener and linger failures', async () => {
    const layout = await healthyInstallation()
    await writeEnvironmentFixture(layout, { host: '0.0.0.0' })
    const output = new RecordingCliOutput()
    const service = new FakeServiceManager()
    service.active = false
    const host = new FakeHostInspector()
    host.addresses = ['0.0.0.0:4567']
    host.linger = false
    const doctor = new BitveinsDoctor({
      environment: new FilesystemEnvironmentRepository(layout),
      health: new FakeHealthProbe(),
      host,
      layout,
      output,
      releases: new FilesystemReleaseStore(layout),
      service,
    })

    const report = await doctor.diagnose()

    expect(report.errors).toEqual(expect.arrayContaining([
      'HOST must be exactly 127.0.0.1.',
      'bitveins.service is not active.',
      'Port 4567 is listening on a non-loopback address.',
    ]))
    expect(report.warnings).toContain(
      'systemd lingering is disabled; Bitveins may stop after logout.',
    )
    expect(output.successes).toEqual([])
    expect(output.errors).toEqual(report.errors)
  })

  it('reports absent dependencies, configuration and release without throwing', async () => {
    const home = await mkdtemp(join(tmpdir(), 'bitveins-doctor-missing-'))
    temporaryDirectories.push(home)
    const layout = resolveInstallationLayout({ HOME: home })
    const output = new RecordingCliOutput()
    const host = new FakeHostInspector()
    host.addresses = null
    host.bytes = null
    host.commands.clear()
    host.linger = null
    const doctor = new BitveinsDoctor({
      environment: new FilesystemEnvironmentRepository(layout),
      health: new FakeHealthProbe(),
      host,
      layout,
      output,
      releases: new FilesystemReleaseStore(layout),
      service: new FakeServiceManager(),
    })

    const report = await doctor.diagnose()

    expect(report.errors).toEqual(expect.arrayContaining([
      'systemctl is missing from PATH.',
      'tmux is missing from PATH.',
      expect.stringMatching(/ENOENT/),
    ]))
    expect(report.warnings).toEqual(expect.arrayContaining([
      'The ss command is unavailable; listener isolation was not inspected.',
      'Available disk space could not be inspected.',
    ]))
  })

  it('reports unsupported runtime, failed health and low update capacity', async () => {
    const layout = await healthyInstallation()
    const output = new RecordingCliOutput()
    const host = new FakeHostInspector()
    host.runtimeValue = {
      architecture: 'arm64',
      platform: 'linux',
      uid: 1000,
    }
    host.bytes = 128 * 1024 * 1024
    const health = new FakeHealthProbe()
    health.outcomes.push(new Error('health endpoint unavailable'))
    const doctor = new BitveinsDoctor({
      environment: new FilesystemEnvironmentRepository(layout),
      health,
      host,
      layout,
      output,
      releases: new FilesystemReleaseStore(layout),
      service: new FakeServiceManager(),
    })

    const report = await doctor.diagnose()

    expect(report.errors).toEqual(expect.arrayContaining([
      'This release supports Linux x86_64 only.',
      'health endpoint unavailable',
    ]))
    expect(report.warnings).toContain(
      'Less than 250 MiB is available for Bitveins updates.',
    )
  })
})
