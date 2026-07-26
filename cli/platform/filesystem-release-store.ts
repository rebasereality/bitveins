import {
  access,
  lstat,
  readdir,
  readlink,
  stat,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import {
  dirname,
  join,
  resolve,
} from 'node:path'
import type { InstallationLayout } from '../core/installation-layout'
import type {
  InstalledRelease,
  ReleaseActivationSnapshot,
  ReleaseBundle,
  ReleaseStore,
} from '../ports/release-store'
import { FilesystemReleaseActivationHistory } from './release-activation-history'
import { loadReleaseBundle } from './release-bundle'
import {
  assertSafeChild,
  copyReleaseAtomic,
  currentSymlinkTarget,
  ensureDirectory,
  removeFile,
  removeSafeChild,
  replaceSymlink,
} from './secure-filesystem'

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  }
  catch {
    return false
  }
}

function assertOwnedTarget(
  link: string,
  target: string | null,
  boundary: string,
  label: string,
): void {
  if (target) {
    assertSafeChild(resolve(dirname(link), target), boundary, label)
  }
}

export class FilesystemReleaseStore implements ReleaseStore {
  private readonly history: FilesystemReleaseActivationHistory

  constructor(private readonly layout: InstallationLayout) {
    this.history = new FilesystemReleaseActivationHistory(layout)
  }

  async activate(path: string): Promise<void> {
    assertSafeChild(path, this.layout.releasesDirectory, 'release activation')
    await replaceSymlink(this.layout.currentReleaseLink, path)
    await ensureDirectory(this.layout.binDirectory)
    await replaceSymlink(
      this.layout.commandPath,
      join(this.layout.currentReleaseLink, 'bin', 'bitveins'),
    )
  }

  async current(): Promise<ReleaseBundle> {
    return await this.load(this.layout.currentReleaseLink)
  }

  async install(source: string): Promise<InstalledRelease> {
    const bundle = await this.load(source)
    const destination = join(
      this.layout.releasesDirectory,
      bundle.metadata.version,
    )

    if (await pathExists(destination)) {
      if (!(await lstat(destination)).isDirectory()) {
        throw new Error(
          `Installed release path is not a directory: ${destination}`,
        )
      }
      const existing = await this.load(destination)
      if (existing.metadata.commit !== bundle.metadata.commit) {
        throw new Error(
          `Release ${existing.metadata.version} is already installed from another commit.`,
        )
      }
      return { bundle: existing, created: false, path: destination }
    }

    await copyReleaseAtomic(source, destination)
    const mode = (await stat(join(destination, 'bin', 'bitveins'))).mode
    if ((mode & 0o111) === 0) {
      await removeSafeChild(
        destination,
        this.layout.releasesDirectory,
        'non-executable release',
      )
      throw new Error('The installed Bitveins command is not executable.')
    }
    return {
      bundle: await this.load(destination),
      created: true,
      path: destination,
    }
  }

  async load(root: string): Promise<ReleaseBundle> {
    return await loadReleaseBundle(root)
  }

  async prune(): Promise<void> {
    const recorded = await this.history.readOptional()
    const currentTarget = await currentSymlinkTarget(
      this.layout.currentReleaseLink,
    )
    const keep = new Set<string>()
    const currentPath = currentTarget
      ? resolve(dirname(this.layout.currentReleaseLink), currentTarget)
      : null
    if (currentPath) {
      assertSafeChild(
        currentPath,
        this.layout.releasesDirectory,
        'current release',
      )
      keep.add(currentPath)
    }
    if (recorded) {
      const recordedCurrent = resolve(
        this.history.resolveRelease(recorded.current),
      )
      if (recordedCurrent !== currentPath) {
        throw new Error(
          'Release activation history does not match the current release link.',
        )
      }
      if (recorded.previous) {
        keep.add(resolve(this.history.resolveRelease(recorded.previous)))
      }
    }

    const removable = (await readdir(
      this.layout.releasesDirectory,
      { withFileTypes: true },
    ))
      .filter(entry => entry.isDirectory())
      .map(entry => join(this.layout.releasesDirectory, entry.name))
      .filter(path => !keep.has(resolve(path)))
    await Promise.all(removable.map(path => this.removeInstalledRelease(
      path,
      'old release',
    )))
  }

  async recordActivation(
    path: string,
    previousTarget: string | null,
  ): Promise<void> {
    await this.history.record(path, previousTarget)
  }

  async removeInstalledRelease(path: string, label: string): Promise<void> {
    await removeSafeChild(path, this.layout.releasesDirectory, label)
  }

  async removeInstallation(): Promise<void> {
    await this.removeCommandIfOwned()
    await removeSafeChild(
      this.layout.installationRoot,
      dirname(this.layout.installationRoot),
      'installation',
    )
  }

  async restore(snapshot: ReleaseActivationSnapshot): Promise<void> {
    if (snapshot.currentTarget) {
      await replaceSymlink(
        this.layout.currentReleaseLink,
        snapshot.currentTarget,
      )
    }
    else {
      await removeFile(this.layout.currentReleaseLink)
    }

    if (snapshot.commandTarget) {
      await replaceSymlink(this.layout.commandPath, snapshot.commandTarget)
    }
    else {
      await removeFile(this.layout.commandPath)
    }
    await this.history.restore(snapshot.history)
  }

  async snapshot(): Promise<ReleaseActivationSnapshot> {
    const [currentTarget, commandTarget, history] = await Promise.all([
      currentSymlinkTarget(this.layout.currentReleaseLink),
      currentSymlinkTarget(this.layout.commandPath),
      this.history.readOptional(),
    ])
    assertOwnedTarget(
      this.layout.currentReleaseLink,
      currentTarget,
      this.layout.releasesDirectory,
      'current release link',
    )
    assertOwnedTarget(
      this.layout.commandPath,
      commandTarget,
      this.layout.installationRoot,
      'Bitveins command link',
    )
    return { commandTarget, currentTarget, history }
  }

  private async removeCommandIfOwned(): Promise<void> {
    try {
      const stats = await lstat(this.layout.commandPath)
      if (!stats.isSymbolicLink()) {
        throw new Error(
          `Refusing to remove non-symlink command at ${this.layout.commandPath}.`,
        )
      }
      const target = resolve(
        dirname(this.layout.commandPath),
        await readlink(this.layout.commandPath),
      )
      assertSafeChild(
        target,
        this.layout.installationRoot,
        'Bitveins command',
      )
      await removeFile(this.layout.commandPath)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
}
