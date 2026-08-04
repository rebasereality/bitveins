import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  CliConfigurationError,
  CliIntegrityError,
  CliPrerequisiteError,
} from '../core/cli-error'
import type { CommandRunner } from '../ports/command-runner'
import { FileOperationLock } from './operation-lock'

const marketplaceName = 'bitveins'
const pluginId = 'bitveins-notifications'
const pluginFiles = [
  '.agents/plugins/marketplace.json',
  'plugins/bitveins-notifications/.codex-plugin/plugin.json',
  'plugins/bitveins-notifications/README.md',
  'plugins/bitveins-notifications/hooks/hooks.json',
  'plugins/bitveins-notifications/hooks/bitveins_notifications.py',
] as const
const maximumPluginFileSize = 1_048_576

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, error => (isMissing(error) ? false : Promise.reject(error)))
}

function validateTrustedSourceOwner(uid: bigint, path: string): void {
  if (typeof process.getuid !== 'function') return
  if (![0n, BigInt(process.getuid())].includes(uid)) {
    throw new CliIntegrityError(
      `Codex plugin source is not owned by the current user or root: ${path}`,
    )
  }
}

async function ensureOwnedPrivateDirectory(path: string, create: boolean): Promise<void> {
  if (create) await mkdir(path, { mode: 0o700, recursive: true })

  let metadata
  try {
    metadata = await lstat(path, { bigint: true })
  }
  catch (error) {
    if (!create && isMissing(error)) {
      throw new CliConfigurationError(`Codex plugin directory does not exist: ${path}`, {
        cause: error,
      })
    }
    throw error
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new CliConfigurationError(`Expected a regular Codex plugin directory: ${path}`)
  }
  if (typeof process.getuid === 'function' && metadata.uid !== BigInt(process.getuid())) {
    throw new CliConfigurationError(`Codex plugin path is not owned by the current user: ${path}`)
  }

  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const opened = await handle.stat({ bigint: true })
    if (opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
      throw new Error(`Codex plugin path changed during validation: ${path}`)
    }
    await handle.chmod(0o700)
  }
  finally {
    await handle.close()
  }
}

async function validateSourceDirectory(path: string): Promise<void> {
  const metadata = await lstat(path, { bigint: true })
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new CliIntegrityError(`Codex plugin source must be a regular directory: ${path}`)
  }
  if ((metadata.mode & 0o022n) !== 0n) {
    throw new CliIntegrityError(`Codex plugin source directory must not be group- or world-writable: ${path}`)
  }
  validateTrustedSourceOwner(metadata.uid, path)
}

async function readValidatedSourceFile(path: string): Promise<Buffer> {
  const metadata = await lstat(path, { bigint: true })
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new CliIntegrityError(`Codex plugin source must be a regular file: ${path}`)
  }
  if ((metadata.mode & 0o022n) !== 0n) {
    throw new CliIntegrityError(`Codex plugin source must not be group- or world-writable: ${path}`)
  }
  validateTrustedSourceOwner(metadata.uid, path)
  if (metadata.size > BigInt(maximumPluginFileSize)) {
    throw new CliIntegrityError(`Codex plugin source file is too large: ${path}`)
  }

  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat({ bigint: true })
    if (opened.dev !== metadata.dev || opened.ino !== metadata.ino) {
      throw new Error(`Codex plugin source changed during validation: ${path}`)
    }
    return await handle.readFile()
  }
  finally {
    await handle.close()
  }
}

async function stageMarketplace(source: string, staging: string): Promise<void> {
  await validateSourceDirectory(source)
  await ensureOwnedPrivateDirectory(staging, true)
  const validatedDirectories = new Set([source])
  for (const relativePath of pluginFiles) {
    let directory = dirname(relativePath)
    const ancestors: string[] = []
    while (directory !== '.') {
      ancestors.unshift(directory)
      directory = dirname(directory)
    }
    for (const relativeDirectory of ancestors) {
      const absoluteDirectory = join(source, relativeDirectory)
      if (!validatedDirectories.has(absoluteDirectory)) {
        await validateSourceDirectory(absoluteDirectory)
        validatedDirectories.add(absoluteDirectory)
      }
    }
    const target = join(staging, relativePath)
    await mkdir(dirname(target), { mode: 0o700, recursive: true })
    const content = await readValidatedSourceFile(join(source, relativePath))
    await writeFile(target, content, { flag: 'wx', mode: 0o600 })
  }
}

interface MarketplaceList {
  marketplaces?: Array<{ name?: unknown, root?: unknown }>
}

function configuredMarketplaceRoot(raw: string): string | null {
  let parsed: MarketplaceList
  try {
    parsed = JSON.parse(raw) as MarketplaceList
  }
  catch (error) {
    throw new CliConfigurationError('Codex returned an invalid marketplace list.', {
      cause: error,
    })
  }
  const matches = (parsed.marketplaces ?? []).filter(item => item.name === marketplaceName)
  if (matches.length > 1 || (matches.length === 1 && typeof matches[0]?.root !== 'string')) {
    throw new CliConfigurationError('Codex returned an invalid Bitveins marketplace entry.')
  }
  return matches.length === 1 ? matches[0]!.root as string : null
}

export class FilesystemCodexPluginInstaller {
  constructor(private readonly dependencies: {
    commands: CommandRunner
    sourceDirectory: string
    targetDirectory: string
  }) {}

  async install(): Promise<string> {
    const codex = await this.dependencies.commands.which('codex')
    if (!codex) {
      throw new CliPrerequisiteError('Codex CLI was not found in PATH.', {
        hint: 'Install Codex before enabling lifecycle notifications.',
      })
    }

    const parent = dirname(this.dependencies.targetDirectory)
    await ensureOwnedPrivateDirectory(parent, true)
    const lock = new FileOperationLock(join(parent, '.codex-plugin-install.lock'))

    return lock.run(async () => {
      const marketplaceResult = await this.dependencies.commands.run(
        codex,
        ['plugin', 'marketplace', 'list', '--json'],
      )
      const configuredRoot = configuredMarketplaceRoot(marketplaceResult.stdout)
      if (configuredRoot && configuredRoot !== this.dependencies.targetDirectory) {
        throw new CliConfigurationError(
          `Codex marketplace ${marketplaceName} already points to ${configuredRoot}.`,
          { hint: 'Remove the conflicting marketplace before installing the Bitveins plugin.' },
        )
      }

      const nonce = randomUUID()
      const staging = `${this.dependencies.targetDirectory}.staging-${nonce}`
      const backup = `${this.dependencies.targetDirectory}.backup-${nonce}`
      let backupExists = false
      let marketplaceAdded = false

      try {
        await stageMarketplace(this.dependencies.sourceDirectory, staging)
        if (await pathExists(this.dependencies.targetDirectory)) {
          await ensureOwnedPrivateDirectory(this.dependencies.targetDirectory, false)
          await rename(this.dependencies.targetDirectory, backup)
          backupExists = true
        }
        try {
          await rename(staging, this.dependencies.targetDirectory)
        }
        catch (error) {
          if (backupExists) {
            await rename(backup, this.dependencies.targetDirectory)
            backupExists = false
          }
          throw error
        }

        try {
          if (!configuredRoot) {
            await this.dependencies.commands.run(
              codex,
              ['plugin', 'marketplace', 'add', this.dependencies.targetDirectory],
            )
            marketplaceAdded = true
          }
          await this.dependencies.commands.run(
            codex,
            ['plugin', 'add', `${pluginId}@${marketplaceName}`],
          )
        }
        catch (error) {
          if (marketplaceAdded) {
            await this.dependencies.commands.run(
              codex,
              ['plugin', 'marketplace', 'remove', marketplaceName],
              { allowFailure: true },
            )
          }
          await rm(this.dependencies.targetDirectory, { force: true, recursive: true })
          if (backupExists) {
            await rename(backup, this.dependencies.targetDirectory)
            backupExists = false
          }
          throw error
        }

        if (backupExists) {
          await rm(backup, { force: true, recursive: true })
          backupExists = false
        }
        return join(
          this.dependencies.targetDirectory,
          'plugins',
          pluginId,
        )
      }
      finally {
        await rm(staging, { force: true, recursive: true })
      }
    })
  }
}
