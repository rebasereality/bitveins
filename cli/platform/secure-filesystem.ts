import {
  chmod,
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  unlink,
} from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

export async function ensurePrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { mode: 0o700, recursive: true })
  const stats = await lstat(path)
  if (!stats.isDirectory()) {
    throw new Error(`${path} must be a directory, not a symbolic link or special file.`)
  }
  await chmod(path, 0o700)
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { mode: 0o755, recursive: true })
  const stats = await lstat(path)
  if (!stats.isDirectory()) {
    throw new Error(`${path} must be a directory, not a symbolic link or special file.`)
  }
}

export async function writeFileAtomic(path: string, content: string, mode: number): Promise<void> {
  await ensurePrivateDirectory(dirname(path))
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  const handle = await open(temporaryPath, 'wx', mode)

  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  }
  finally {
    await handle.close()
  }

  try {
    await rename(temporaryPath, path)
    await chmod(path, mode)
  }
  catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export async function writePrivateFileAtomic(path: string, content: string): Promise<void> {
  await writeFileAtomic(path, content, 0o600)
}

export async function readPrivateFile(path: string): Promise<string> {
  const stats = await lstat(path)
  if (!stats.isFile()) {
    throw new Error(`${path} must be a regular file, not a symbolic link or special file.`)
  }
  if (process.getuid && stats.uid !== process.getuid()) {
    throw new Error(`${path} must be owned by the current Unix user.`)
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(`${path} must not be readable or writable by group or other users.`)
  }

  return await readFile(path, 'utf8')
}

export async function replaceSymlink(path: string, target: string): Promise<void> {
  await ensureDirectory(dirname(path))
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  await symlink(target, temporaryPath)

  try {
    await rename(temporaryPath, path)
  }
  catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

export async function copyRelease(source: string, destination: string): Promise<void> {
  await ensurePrivateDirectory(dirname(destination))
  await cp(source, destination, {
    errorOnExist: true,
    force: false,
    recursive: true,
    verbatimSymlinks: true,
  })
}

export async function copyReleaseAtomic(source: string, destination: string): Promise<void> {
  const temporaryPath = `${destination}.installing-${randomUUID()}`

  try {
    await copyRelease(source, temporaryPath)
    await rename(temporaryPath, destination)
  }
  catch (error) {
    await rm(temporaryPath, { force: true, recursive: true })
    throw error
  }
}

export function assertSafeChild(path: string, parent: string, label: string): void {
  if (!isAbsolute(path) || !isAbsolute(parent)) {
    throw new Error(`${label} path validation requires absolute paths.`)
  }

  const relation = relative(resolve(parent), resolve(path))
  if (!relation || relation === '..' || relation.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`Refusing to remove unsafe ${label} path: ${path}`)
  }
}

export async function removeSafeChild(path: string, parent: string, label: string): Promise<void> {
  assertSafeChild(path, parent, label)
  await rm(path, { force: true, recursive: true })
}

export async function currentSymlinkTarget(path: string): Promise<string | null> {
  try {
    return await readlink(path)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}
