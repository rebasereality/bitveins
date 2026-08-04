import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import {
  CliConfigurationError,
  CliIntegrityError,
  CliPrerequisiteError,
} from '../core/cli-error'
import type { CommandRunner } from '../ports/command-runner'
import { FileOperationLock } from './operation-lock'

const pluginId = 'bitveins-notifications'
const pluginFiles = [
  '__init__.py',
  'plugin.yaml',
  'README.md',
  'test_plugin.py',
] as const
const maximumPluginFileSize = 1_048_576

function validateProfile(profile: string): void {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile)) {
    throw new CliConfigurationError(
      'Hermes profile name must match [a-z0-9][a-z0-9_-]{0,63}.',
    )
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, error => (isMissing(error) ? false : Promise.reject(error)))
}

function validateTrustedSourceOwner(uid: bigint, path: string): void {
  if (typeof process.getuid !== 'function') return
  const trustedOwners = new Set([0n, BigInt(process.getuid())])
  if (!trustedOwners.has(uid)) {
    throw new CliIntegrityError(
      `Hermes plugin source is not owned by the current user or root: ${path}`,
    )
  }
}

async function ensureOwnedPrivateDirectory(path: string, create: boolean): Promise<void> {
  if (create) {
    await mkdir(path, { mode: 0o700, recursive: true })
  }

  let pathStats
  try {
    pathStats = await lstat(path, { bigint: true })
  }
  catch (error) {
    if (!create && isMissing(error)) {
      throw new CliConfigurationError(`Hermes profile does not exist: ${path}`, { cause: error })
    }
    throw error
  }
  if (pathStats.isSymbolicLink()) {
    throw new CliConfigurationError(`Refusing symbolic link in Hermes plugin path: ${path}`)
  }
  if (!pathStats.isDirectory()) {
    throw new CliConfigurationError(`Expected a directory in Hermes plugin path: ${path}`)
  }
  if (typeof process.getuid === 'function' && pathStats.uid !== BigInt(process.getuid())) {
    throw new CliConfigurationError(`Hermes plugin path is not owned by the current user: ${path}`)
  }

  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const openedStats = await handle.stat({ bigint: true })
    if (openedStats.dev !== pathStats.dev || openedStats.ino !== pathStats.ino) {
      throw new Error(`Hermes plugin path changed during validation: ${path}`)
    }
    await handle.chmod(0o700)
  }
  finally {
    await handle.close()
  }

  const verified = await lstat(path, { bigint: true })
  if (verified.dev !== pathStats.dev || verified.ino !== pathStats.ino) {
    throw new Error(`Hermes plugin path changed during validation: ${path}`)
  }
}

async function readValidatedSourceFile(path: string): Promise<Buffer> {
  const pathStats = await lstat(path, { bigint: true })
  if (pathStats.isSymbolicLink() || !pathStats.isFile()) {
    throw new CliIntegrityError(`Hermes plugin source must be a regular file: ${path}`)
  }
  if ((pathStats.mode & 0o022n) !== 0n) {
    throw new CliIntegrityError(`Hermes plugin source must not be group- or world-writable: ${path}`)
  }
  validateTrustedSourceOwner(pathStats.uid, path)
  if (pathStats.size > BigInt(maximumPluginFileSize)) {
    throw new CliIntegrityError(`Hermes plugin source file is too large: ${path}`)
  }

  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const openedStats = await handle.stat({ bigint: true })
    if (openedStats.dev !== pathStats.dev || openedStats.ino !== pathStats.ino) {
      throw new Error(`Hermes plugin source changed during validation: ${path}`)
    }
    return await handle.readFile()
  }
  finally {
    await handle.close()
  }
}

async function validateSourceDirectory(path: string): Promise<void> {
  const pathStats = await lstat(path, { bigint: true })
  if (pathStats.isSymbolicLink() || !pathStats.isDirectory()) {
    throw new CliIntegrityError(`Hermes plugin source directory is not a regular directory: ${path}`)
  }
  if ((pathStats.mode & 0o022n) !== 0n) {
    throw new CliIntegrityError(
      `Hermes plugin source directory must not be group- or world-writable: ${path}`,
    )
  }
  validateTrustedSourceOwner(pathStats.uid, path)
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const openedStats = await handle.stat({ bigint: true })
    if (openedStats.dev !== pathStats.dev || openedStats.ino !== pathStats.ino) {
      throw new CliIntegrityError(`Hermes plugin source directory changed: ${path}`)
    }
  }
  finally {
    await handle.close()
  }
}

async function stagePlugin(sourceDirectory: string, stagingDirectory: string): Promise<void> {
  await validateSourceDirectory(sourceDirectory)
  await ensureOwnedPrivateDirectory(stagingDirectory, true)
  for (const file of pluginFiles) {
    const content = await readValidatedSourceFile(join(sourceDirectory, file))
    await writeFile(join(stagingDirectory, file), content, { flag: 'wx', mode: 0o600 })
  }

  const stagedFiles = (await readdir(stagingDirectory)).sort()
  if (stagedFiles.length !== pluginFiles.length
    || stagedFiles.some((file, index) => file !== [...pluginFiles].sort()[index])) {
    throw new Error('Staged Hermes plugin does not match the release allowlist.')
  }
  for (const file of pluginFiles) {
    const stats = await lstat(join(stagingDirectory, file))
    if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o777) !== 0o600) {
      throw new Error(`Invalid staged Hermes plugin file: ${file}`)
    }
  }
}

function resolveHermesRoot(configuredHome: string): string {
  const absolute = resolve(configuredHome)
  return basename(dirname(absolute)) === 'profiles'
    ? dirname(dirname(absolute))
    : absolute
}

export class FilesystemHermesPluginInstaller {
  private readonly hermesRoot: string

  constructor(private readonly dependencies: {
    commands: CommandRunner
    home: string
    hermesHome?: string
    sourceDirectory: string
  }) {
    this.hermesRoot = resolveHermesRoot(
      dependencies.hermesHome ?? join(dependencies.home, '.hermes'),
    )
  }

  async install(profile = 'default'): Promise<string> {
    validateProfile(profile)
    const hermes = await this.dependencies.commands.which('hermes')
    if (!hermes) {
      throw new CliPrerequisiteError('Hermes Agent CLI was not found in PATH.', {
        hint: 'Install Hermes Agent before enabling lifecycle notifications.',
      })
    }

    await ensureOwnedPrivateDirectory(this.hermesRoot, true)
    const hermesRoot = await realpath(this.hermesRoot)
    await ensureOwnedPrivateDirectory(hermesRoot, false)
    const lock = new FileOperationLock(join(hermesRoot, '.bitveins-plugin-install.lock'))

    return lock.run(async () => {
      let profileDirectory = hermesRoot
      if (profile !== 'default') {
        const profilesDirectory = join(hermesRoot, 'profiles')
        profileDirectory = join(profilesDirectory, profile)
        await ensureOwnedPrivateDirectory(profilesDirectory, false)
        await ensureOwnedPrivateDirectory(profileDirectory, false)
      }

      const pluginsDirectory = join(profileDirectory, 'plugins')
      await ensureOwnedPrivateDirectory(pluginsDirectory, true)
      const targetDirectory = join(pluginsDirectory, pluginId)
      if (await pathExists(targetDirectory)) {
        await ensureOwnedPrivateDirectory(targetDirectory, false)
      }

      const nonce = randomUUID()
      const stagingDirectory = join(pluginsDirectory, `.${pluginId}.staging-${nonce}`)
      const backupDirectory = join(pluginsDirectory, `.${pluginId}.backup-${nonce}`)
      let backupExists = false

      try {
        await stagePlugin(this.dependencies.sourceDirectory, stagingDirectory)
        if (await pathExists(targetDirectory)) {
          await rename(targetDirectory, backupDirectory)
          backupExists = true
        }
        try {
          await rename(stagingDirectory, targetDirectory)
        }
        catch (error) {
          if (backupExists) {
            await rename(backupDirectory, targetDirectory)
            backupExists = false
          }
          throw error
        }

        try {
          await this.dependencies.commands.run(
            hermes,
            ['--profile', profile, 'plugins', 'enable', pluginId],
            { environment: { HERMES_HOME: hermesRoot } },
          )
        }
        catch (error) {
          await rm(targetDirectory, { force: true, recursive: true })
          if (backupExists) {
            await rename(backupDirectory, targetDirectory)
            backupExists = false
          }
          throw error
        }

        if (backupExists) {
          await rm(backupDirectory, { force: true, recursive: true })
          backupExists = false
        }
        return targetDirectory
      }
      finally {
        await rm(stagingDirectory, { force: true, recursive: true })
      }
    })
  }
}
