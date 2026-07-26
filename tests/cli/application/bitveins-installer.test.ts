import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { parseEnvironmentFile } from '../../../cli/core/environment-file'
import { resolveInstallationLayout } from '../../../cli/core/installation-layout'
import type { PasswordReader } from '../../../cli/ports/password-reader'
import { verifyBitveinsPassword } from '../../../shared/security/password-hasher'
import {
  FakeHealthProbe,
  FakeHostInspector,
  FakeServiceManager,
} from '../support/cli-fakes'
import { createNativeInstallationFixture } from '../support/native-installation-fixture'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

async function createRelease(root: string, version = '0.1.0'): Promise<string> {
  const release = join(root, `bundle-${version}`)
  await Promise.all([
    mkdir(join(release, 'app', '.output', 'server'), { recursive: true }),
    mkdir(join(release, 'bin'), { recursive: true }),
    mkdir(join(release, 'runtime', 'bin'), { recursive: true }),
    mkdir(join(release, 'share', 'bitveins'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(release, 'app', '.output', 'server', 'index.mjs'), ''),
    writeFile(join(release, 'bin', 'bitveins'), '#!/bin/sh\n'),
    writeFile(join(release, 'runtime', 'bin', 'node'), '#!/bin/sh\n'),
    writeFile(join(release, 'share', 'bitveins', 'release.json'), JSON.stringify({
      architecture: 'x64',
      commit: 'a'.repeat(40),
      nodeVersion: 'v24.13.0',
      platform: 'linux',
      version,
    })),
  ])
  await Promise.all([
    chmod(join(release, 'bin', 'bitveins'), 0o755),
    chmod(join(release, 'runtime', 'bin', 'node'), 0o755),
  ])
  return release
}

class FixedPasswordReader implements PasswordReader {
  constructor(private readonly password = 'correct horse battery staple') {}

  async readNewPassword(): Promise<string> {
    return this.password
  }
}

class FailingStartService extends FakeServiceManager {
  override async enableAndStart(): Promise<void> {
    this.calls.push('enableAndStart')
    throw new Error('systemd unavailable')
  }
}

describe('BitveinsInstaller', () => {
  it('installs a release, private config and systemd user service', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-installer-'))
    temporaryDirectories.push(root)
    const release = await createRelease(root)
    const home = join(root, 'home with spaces')
    const layout = resolveInstallationLayout({ HOME: home })
    const fixture = createNativeInstallationFixture({
      home,
      layout,
      passwordReader: new FixedPasswordReader(),
    })

    await fixture.installer.install({
      allowedOrigin: 'https://terminal.example.com',
      port: 3456,
      releaseRoot: release,
    })

    expect(await readlink(layout.currentReleaseLink))
      .toBe(join(layout.releasesDirectory, '0.1.0'))
    expect(await readlink(layout.commandPath))
      .toBe(join(layout.currentReleaseLink, 'bin', 'bitveins'))
    expect((await stat(layout.environmentFile)).mode & 0o777).toBe(0o600)
    const environment = parseEnvironmentFile(
      await readFile(layout.environmentFile, 'utf8'),
    )
    expect(environment.host).toBe('127.0.0.1')
    await expect(verifyBitveinsPassword(
      environment.authPasswordHash,
      'correct horse battery staple',
    )).resolves.toBe(true)
    expect(await readFile(layout.systemdUnit, 'utf8'))
      .not.toContain('/home/theman')
    expect(fixture.service.calls).toContain('enableAndStart')
  })

  it('reuses an existing valid configuration without asking for another password', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-installer-idempotent-'))
    temporaryDirectories.push(root)
    const release = await createRelease(root)
    const home = join(root, 'home')
    const layout = resolveInstallationLayout({ HOME: home })
    const first = createNativeInstallationFixture({
      home,
      layout,
      passwordReader: new FixedPasswordReader(),
    })
    await first.installer.install({ port: 3000, releaseRoot: release })
    const originalEnvironment = await readFile(layout.environmentFile, 'utf8')
    const unexpectedPasswordPrompt = vi.fn(async () => {
      throw new Error('password should not be requested')
    })
    const repeated = createNativeInstallationFixture({
      health: first.health,
      home,
      host: first.host,
      layout,
      passwordReader: { readNewPassword: unexpectedPasswordPrompt },
      service: first.service,
    })

    await repeated.installer.install({ port: 3000, releaseRoot: release })

    expect(unexpectedPasswordPrompt).not.toHaveBeenCalled()
    expect(await readFile(layout.environmentFile, 'utf8'))
      .toBe(originalEnvironment)
  })

  it('rolls back first-install links and secrets when systemd fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-rollback-'))
    temporaryDirectories.push(root)
    const home = join(root, 'home')
    const layout = resolveInstallationLayout({ HOME: home })
    const fixture = createNativeInstallationFixture({
      home,
      layout,
      passwordReader: new FixedPasswordReader(),
      service: new FailingStartService(),
    })

    await expect(fixture.installer.install({
      port: 3000,
      releaseRoot: await createRelease(root),
    })).rejects.toThrow(/systemd unavailable/)

    for (const path of [
      layout.commandPath,
      layout.currentReleaseLink,
      layout.environmentFile,
      layout.systemdUnit,
      join(layout.releasesDirectory, '0.1.0'),
    ]) {
      await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it('fails closed when a required host command is unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-preflight-'))
    temporaryDirectories.push(root)
    const host = new FakeHostInspector()
    host.commands.delete('tmux')
    const layout = resolveInstallationLayout({ HOME: root })
    const fixture = createNativeInstallationFixture({
      home: root,
      host,
      layout,
      passwordReader: new FixedPasswordReader(),
    })

    await expect(fixture.installer.install({
      port: 3000,
      releaseRoot: await createRelease(root),
    })).rejects.toThrow(/tmux is required/)
  })

  it('rejects root, unsupported hosts and occupied first-install ports', async () => {
    const cases = [
      {
        configure(host: FakeHostInspector) {
          host.runtimeValue = {
            architecture: 'x64',
            platform: 'linux',
            uid: 0,
          }
        },
        message: /not root/,
      },
      {
        configure(host: FakeHostInspector) {
          host.runtimeValue = {
            architecture: 'arm64',
            platform: 'linux',
            uid: 1000,
          }
        },
        message: /Linux x86_64 only/,
      },
      {
        configure(host: FakeHostInspector) {
          host.commands.delete('systemctl')
        },
        message: /systemctl is required/,
      },
      {
        configure(host: FakeHostInspector) {
          host.portAvailable = false
        },
        message: /already in use/,
      },
    ]

    for (const [index, testCase] of cases.entries()) {
      const root = await mkdtemp(join(tmpdir(), `bitveins-preflight-${index}-`))
      temporaryDirectories.push(root)
      const host = new FakeHostInspector()
      testCase.configure(host)
      const fixture = createNativeInstallationFixture({
        home: root,
        host,
        layout: resolveInstallationLayout({ HOME: root }),
        passwordReader: new FixedPasswordReader(),
      })

      await expect(fixture.installer.install({
        port: 3000,
        releaseRoot: await createRelease(root),
      })).rejects.toThrow(testCase.message)
    }
  })

  it('refuses to replace a command symlink owned by another installation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-command-owner-'))
    temporaryDirectories.push(root)
    const home = join(root, 'home')
    const layout = resolveInstallationLayout({ HOME: home })
    await mkdir(layout.binDirectory, { recursive: true })
    await symlink('/opt/another-bitveins/bin/bitveins', layout.commandPath)
    const fixture = createNativeInstallationFixture({
      home,
      layout,
      passwordReader: new FixedPasswordReader(),
    })

    await expect(fixture.installer.install({
      port: 3000,
      releaseRoot: await createRelease(root),
    })).rejects.toThrow(/unsafe Bitveins command link/)
    expect(await readlink(layout.commandPath))
      .toBe('/opt/another-bitveins/bin/bitveins')
  })

  it('restores and restarts the previous release after a failed update health check', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-update-rollback-'))
    temporaryDirectories.push(root)
    const home = join(root, 'home')
    const layout = resolveInstallationLayout({ HOME: home })
    const health = new FakeHealthProbe()
    const fixture = createNativeInstallationFixture({
      health,
      home,
      layout,
      passwordReader: new FixedPasswordReader(),
    })
    await fixture.installer.install({
      port: 3000,
      releaseRoot: await createRelease(root, '0.1.0'),
    })
    health.outcomes.push(new Error('new release is unhealthy'), null)

    await expect(fixture.installer.install({
      port: 3000,
      releaseRoot: await createRelease(root, '0.2.0'),
    })).rejects.toThrow(/new release is unhealthy/)

    expect(await readlink(layout.currentReleaseLink))
      .toBe(join(layout.releasesDirectory, '0.1.0'))
    await expect(access(join(layout.releasesDirectory, '0.2.0')))
      .rejects.toMatchObject({ code: 'ENOENT' })
    expect(fixture.service.calls.filter(call => call === 'restart')).toHaveLength(2)
    expect(health.calls.at(-1)?.port).toBe(3000)
  })
})
