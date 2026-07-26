import {
  access,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BitveinsUninstaller } from '../../../cli/application/bitveins-uninstaller'
import { resolveInstallationLayout } from '../../../cli/core/installation-layout'
import { FilesystemInstallationCleaner } from '../../../cli/platform/filesystem-installation-cleaner'
import { FilesystemReleaseStore } from '../../../cli/platform/filesystem-release-store'
import { FilesystemServiceUnitRepository } from '../../../cli/platform/filesystem-service-unit-repository'
import {
  FakeServiceManager,
  RecordingCliOutput,
} from '../support/cli-fakes'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

async function installedLayout(root: string) {
  const layout = resolveInstallationLayout({ HOME: root })
  const release = join(layout.releasesDirectory, '0.1.0')
  await Promise.all([
    mkdir(layout.binDirectory, { recursive: true }),
    mkdir(layout.configDirectory, { recursive: true }),
    mkdir(layout.dataDirectory, { recursive: true }),
    mkdir(join(release, 'bin'), { recursive: true }),
    mkdir(layout.systemdDirectory, { recursive: true }),
  ])
  await Promise.all([
    writeFile(layout.environmentFile, 'SECRET=value\n', { mode: 0o600 }),
    writeFile(join(layout.dataDirectory, 'history.sqlite'), ''),
    writeFile(layout.systemdUnit, '[Service]\n'),
    writeFile(join(release, 'bin', 'bitveins'), ''),
  ])
  await symlink(release, layout.currentReleaseLink)
  await symlink(join(layout.currentReleaseLink, 'bin', 'bitveins'), layout.commandPath)
  return layout
}

function createUninstaller(
  home: string,
  layout: ReturnType<typeof resolveInstallationLayout>,
) {
  const service = new FakeServiceManager()
  const uninstaller = new BitveinsUninstaller({
    cleaner: new FilesystemInstallationCleaner(layout),
    output: new RecordingCliOutput(),
    releases: new FilesystemReleaseStore(layout),
    service,
    serviceUnit: new FilesystemServiceUnitRepository(layout, home),
  })
  return { service, uninstaller }
}

describe('BitveinsUninstaller', () => {
  it('preserves config and data by default and can be repeated safely', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-uninstall-'))
    temporaryDirectories.push(root)
    const layout = await installedLayout(root)
    const { service, uninstaller } = createUninstaller(root, layout)

    await uninstaller.uninstall(false)
    await uninstaller.uninstall(false)

    await expect(access(layout.installationRoot)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(layout.commandPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(layout.environmentFile)).resolves.toBeUndefined()
    await expect(access(layout.dataDirectory)).resolves.toBeUndefined()
    expect(service.calls.filter(call => call === 'disable')).toHaveLength(2)
  })

  it('removes only recognized Bitveins data during an explicit purge', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-purge-'))
    temporaryDirectories.push(root)
    const layout = await installedLayout(root)
    await mkdir(layout.stateDirectory, { recursive: true })
    const unrelated = join(root, '.config', 'keep-me')
    await writeFile(unrelated, 'safe')
    const { uninstaller } = createUninstaller(root, layout)

    await uninstaller.uninstall(true)

    for (const path of [
      layout.configDirectory,
      layout.dataDirectory,
      layout.stateDirectory,
    ]) {
      await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
    }
    await expect(access(unrelated)).resolves.toBeUndefined()
  })
})
