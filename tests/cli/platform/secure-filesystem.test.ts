import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
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
import {
  assertSafeChild,
  copyReleaseAtomic,
  currentSymlinkTarget,
  ensureDirectory,
  ensurePrivateDirectory,
  readPrivateFile,
  removeFile,
  removeSafeChild,
  replaceSymlink,
  writePrivateFileAtomic,
} from '../../../cli/platform/secure-filesystem'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

describe('secure filesystem utilities', () => {
  it('writes private files atomically with restrictive permissions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-fs-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'private', 'env')

    await writePrivateFileAtomic(path, 'secret')

    expect(await readFile(path, 'utf8')).toBe('secret')
    expect((await lstat(path)).mode & 0o777).toBe(0o600)
    expect((await lstat(join(directory, 'private'))).mode & 0o777).toBe(0o700)
  })

  it('replaces symlinks without following their target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-link-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'current')

    await replaceSymlink(path, '/release/one')
    await replaceSymlink(path, '/release/two')

    expect(await readlink(path)).toBe('/release/two')
  })

  it('rejects parent and root deletion targets', () => {
    expect(() => assertSafeChild('/home/alice/.config/bitveins', '/home/alice/.config', 'config'))
      .not.toThrow()
    expect(() => assertSafeChild('/home/alice', '/home/alice', 'home'))
      .toThrow(/unsafe/)
    expect(() => assertSafeChild('/home', '/home/alice', 'parent'))
      .toThrow(/unsafe/)
    expect(() => assertSafeChild('relative', '/home/alice', 'relative'))
      .toThrow(/requires absolute paths/)
  })

  it('rejects symlinked private paths and non-private files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-fs-reject-'))
    temporaryDirectories.push(directory)
    const target = join(directory, 'target')
    const link = join(directory, 'link')
    await mkdir(target)
    await symlink(target, link)

    await expect(ensurePrivateDirectory(link)).rejects.toThrow(/not a symbolic link/)

    const privateFile = join(directory, 'secret')
    await writeFile(privateFile, 'secret', { mode: 0o600 })
    await expect(readPrivateFile(privateFile)).resolves.toBe('secret')
    await chmod(privateFile, 0o640)
    await expect(readPrivateFile(privateFile)).rejects.toThrow(/group or other/)
    await expect(readPrivateFile(link)).rejects.toThrow(/regular file/)
  })

  it('copies and removes releases only within explicit parent boundaries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-copy-release-'))
    temporaryDirectories.push(directory)
    const source = join(directory, 'source')
    const destination = join(directory, 'releases', '1.2.3')
    await mkdir(source)
    await writeFile(join(source, 'release.json'), '{}')

    await copyReleaseAtomic(source, destination)
    await expect(access(join(destination, 'release.json')))
      .resolves.toBeUndefined()
    await expect(copyReleaseAtomic(source, destination)).rejects.toThrow()

    await removeSafeChild(destination, join(directory, 'releases'), 'release')
    await expect(access(destination)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reads optional symlinks and removes files idempotently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-optional-files-'))
    temporaryDirectories.push(directory)
    const link = join(directory, 'current')
    const file = join(directory, 'file')

    await expect(currentSymlinkTarget(link)).resolves.toBeNull()
    await symlink('/release/one', link)
    await expect(currentSymlinkTarget(link)).resolves.toBe('/release/one')
    await writeFile(file, 'content')
    await expect(currentSymlinkTarget(file)).rejects.toMatchObject({
      code: 'EINVAL',
    })

    await removeFile(file)
    await removeFile(file)
    await mkdir(file)
    await expect(removeFile(file)).rejects.toThrow()
    await rm(file, { recursive: true })
  })

  it('creates public directories without following a symlink', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-directory-'))
    temporaryDirectories.push(directory)
    const target = join(directory, 'target')
    const link = join(directory, 'link')
    await mkdir(target)
    await symlink(target, link)

    await expect(ensureDirectory(link)).rejects.toThrow(/not a symbolic link/)
  })

  it('cleans temporary writes and links when atomic replacement fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-atomic-failure-'))
    temporaryDirectories.push(directory)
    const fileTarget = join(directory, 'file-target')
    const linkTarget = join(directory, 'link-target')
    await Promise.all([mkdir(fileTarget), mkdir(linkTarget)])

    await expect(writePrivateFileAtomic(fileTarget, 'content')).rejects.toThrow()
    await expect(replaceSymlink(linkTarget, '/release/one')).rejects.toThrow()
  })

  it('rejects private files owned by another Unix user', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-file-owner-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'secret')
    await writeFile(path, 'secret', { mode: 0o600 })
    vi.spyOn(process, 'getuid').mockReturnValue(process.getuid() + 1)

    await expect(readPrivateFile(path)).rejects.toThrow(/current Unix user/)
  })
})
