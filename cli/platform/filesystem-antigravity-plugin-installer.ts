import { constants } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  CliConfigurationError,
  CliIntegrityError,
} from '../core/cli-error'
import { FileOperationLock } from './operation-lock'

const scriptFileName = 'bitveins_antigravity_notifications.py'
const maximumFileSize = 1_048_576

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function validateTrustedSourceOwner(uid: bigint, path: string): void {
  if (typeof process.getuid !== 'function') return
  const trustedOwners = new Set([0n, BigInt(process.getuid())])
  if (!trustedOwners.has(uid)) {
    throw new CliIntegrityError(
      `Antigravity plugin source is not owned by the current user or root: ${path}`,
    )
  }
}

async function ensureOwnedPrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { mode: 0o700, recursive: true })

  let pathStats
  try {
    pathStats = await lstat(path, { bigint: true })
  }
  catch (error) {
    throw new CliConfigurationError(`Directory does not exist: ${path}`, { cause: error })
  }
  if (pathStats.isSymbolicLink()) {
    throw new CliConfigurationError(`Refusing symbolic link in path: ${path}`)
  }
  if (!pathStats.isDirectory()) {
    throw new CliConfigurationError(`Expected a directory in path: ${path}`)
  }
  if (typeof process.getuid === 'function' && pathStats.uid !== BigInt(process.getuid())) {
    throw new CliConfigurationError(`Path is not owned by the current user: ${path}`)
  }

  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const openedStats = await handle.stat({ bigint: true })
    if (openedStats.dev !== pathStats.dev || openedStats.ino !== pathStats.ino) {
      throw new Error(`Path changed during validation: ${path}`)
    }
    await handle.chmod(0o700)
  }
  finally {
    await handle.close()
  }
}

async function readValidatedSourceFile(path: string): Promise<Buffer> {
  const pathStats = await lstat(path, { bigint: true })
  if (pathStats.isSymbolicLink() || !pathStats.isFile()) {
    throw new CliIntegrityError(`Antigravity hook source must be a regular file: ${path}`)
  }
  if ((pathStats.mode & 0o022n) !== 0n) {
    throw new CliIntegrityError(`Antigravity hook source must not be group- or world-writable: ${path}`)
  }
  validateTrustedSourceOwner(pathStats.uid, path)
  if (pathStats.size > BigInt(maximumFileSize)) {
    throw new CliIntegrityError(`Antigravity hook source file is too large: ${path}`)
  }

  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const openedStats = await handle.stat({ bigint: true })
    if (openedStats.dev !== pathStats.dev || openedStats.ino !== pathStats.ino) {
      throw new Error(`Antigravity hook source changed during validation: ${path}`)
    }
    return await handle.readFile()
  }
  finally {
    await handle.close()
  }
}

export class FilesystemAntigravityPluginInstaller {
  private readonly geminiConfigDir: string
  private readonly bitveinsAntigravityDir: string

  constructor(private readonly dependencies: {
    geminiHome?: string
    home: string
    sourceDirectory: string
  }) {
    this.geminiConfigDir = dependencies.geminiHome
      ? join(dependencies.geminiHome, 'config')
      : join(dependencies.home, '.gemini', 'config')
    this.bitveinsAntigravityDir = join(
      dependencies.home,
      '.config',
      'bitveins',
      'antigravity',
    )
  }

  async install(): Promise<{ hooksPath: string, scriptPath: string }> {
    const lock = new FileOperationLock(
      join(this.bitveinsAntigravityDir, '.install.lock'),
    )

    await ensureOwnedPrivateDirectory(this.bitveinsAntigravityDir)
    return await lock.run(async () => {
      const sourceScriptPath = join(this.dependencies.sourceDirectory, scriptFileName)
      const scriptContent = await readValidatedSourceFile(sourceScriptPath)
      const targetScriptPath = join(this.bitveinsAntigravityDir, scriptFileName)
      const stagingScriptPath = `${targetScriptPath}.${randomUUID()}.tmp`

      await writeFile(stagingScriptPath, scriptContent, { mode: 0o700 })
      await rename(stagingScriptPath, targetScriptPath)

      await ensureOwnedPrivateDirectory(this.geminiConfigDir)
      const hooksPath = join(this.geminiConfigDir, 'hooks.json')

      let existingHooks: Record<string, unknown> = {}
      try {
        const raw = await readFile(hooksPath, 'utf8')
        existingHooks = JSON.parse(raw) as Record<string, unknown>
        if (typeof existingHooks !== 'object' || existingHooks === null || Array.isArray(existingHooks)) {
          existingHooks = {}
        }
      }
      catch (error) {
        if (!isMissing(error)) {
          // If malformed, preserve and start fresh
        }
      }

      existingHooks['bitveins-notifications'] = {
        PreInvocation: [
          {
            command: `python3 "${targetScriptPath}"`,
            timeout: 2,
            type: 'command',
          },
        ],
        PreToolUse: [
          {
            hooks: [
              {
                command: `python3 "${targetScriptPath}"`,
                timeout: 2,
                type: 'command',
              },
            ],
            matcher: '*',
          },
        ],
        PostToolUse: [
          {
            hooks: [
              {
                command: `python3 "${targetScriptPath}"`,
                timeout: 2,
                type: 'command',
              },
            ],
            matcher: '*',
          },
        ],
        Stop: [
          {
            command: `python3 "${targetScriptPath}"`,
            timeout: 2,
            type: 'command',
          },
        ],
      }

      const stagingHooksPath = `${hooksPath}.${randomUUID()}.tmp`
      await writeFile(stagingHooksPath, `${JSON.stringify(existingHooks, null, 2)}\n`, { mode: 0o600 })
      await rename(stagingHooksPath, hooksPath)

      return {
        hooksPath,
        scriptPath: targetScriptPath,
      }
    })
  }
}
