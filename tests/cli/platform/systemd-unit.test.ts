import { spawnSync } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveInstallationLayout } from '../../../cli/core/installation-layout'
import { renderSystemdUserUnit } from '../../../cli/platform/systemd-unit'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

describe('systemd user unit', () => {
  it('uses the packaged runtime, loopback and process-only shutdown', () => {
    const layout = resolveInstallationLayout({ HOME: '/home/alice % user' })
    const unit = renderSystemdUserUnit(layout, '/home/alice % user')
    const escapedReleaseLink = layout.currentReleaseLink.replaceAll('%', '%%')

    expect(unit).toContain('Environment=HOST=127.0.0.1')
    expect(unit).toContain('KillMode=process')
    expect(unit).toContain(`${escapedReleaseLink}/runtime/bin/node`)
    expect(unit).toContain(`${escapedReleaseLink}/app/.output/server/index.mjs`)
    expect(unit).not.toContain('/home/theman')
    expect(unit).toContain('%%')
  })

  it.runIf(process.platform === 'linux')('passes systemd unit verification', async () => {
    const home = await mkdtemp(join(tmpdir(), 'bitveins-systemd-'))
    temporaryDirectories.push(home)
    const layout = resolveInstallationLayout({ HOME: home })
    await Promise.all([
      mkdir(join(layout.currentReleaseLink, 'runtime', 'bin'), { recursive: true }),
      mkdir(join(layout.currentReleaseLink, 'app', '.output', 'server'), { recursive: true }),
      mkdir(layout.configDirectory, { recursive: true }),
      mkdir(layout.systemdDirectory, { recursive: true }),
    ])
    await Promise.all([
      writeFile(join(layout.currentReleaseLink, 'runtime', 'bin', 'node'), '#!/bin/sh\n'),
      writeFile(join(layout.currentReleaseLink, 'app', '.output', 'server', 'index.mjs'), ''),
      writeFile(layout.environmentFile, 'PORT=3000\n', { mode: 0o600 }),
    ])
    await chmod(join(layout.currentReleaseLink, 'runtime', 'bin', 'node'), 0o755)
    await writeFile(layout.systemdUnit, renderSystemdUserUnit(layout, home))

    const verification = spawnSync(
      'systemd-analyze',
      ['verify', layout.systemdUnit],
      { encoding: 'utf8' },
    )

    expect(verification.status, verification.stderr).toBe(0)
  })

  it('installs, reads, and restores service unit files', async () => {
    const { FilesystemServiceUnitRepository } = await import('../../../cli/platform/filesystem-service-unit-repository')
    const home = await mkdtemp(join(tmpdir(), 'bitveins-repo-unit-'))
    temporaryDirectories.push(home)
    const layout = resolveInstallationLayout({ HOME: home })
    await mkdir(layout.systemdDirectory, { recursive: true })

    const repo = new FilesystemServiceUnitRepository(layout, home)

    // Non-existent unit returns null
    await expect(repo.readOptional()).resolves.toBeNull()

    // Install unit
    await repo.install()
    const content = await repo.readOptional()
    expect(content).toContain('Environment=HOST=127.0.0.1')

    // Restore unit with new content
    await repo.restore('custom-unit-content')
    await expect(repo.readOptional()).resolves.toBe('custom-unit-content')

    // Restore null removes file
    await repo.restore(null)
    await expect(repo.readOptional()).resolves.toBeNull()

    // Non-regular file (directory) throws
    await mkdir(layout.systemdUnit)
    await expect(repo.readOptional()).rejects.toThrow(/must be a regular file/)
  })
})
