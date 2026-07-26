import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
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
} from 'vitest'
import {
  assertContainedSymlinks,
  assertLinuxX64Elf,
  assertMaximumGlibcVersion,
  assertNoForbiddenContent,
  maximumRequiredGlibcVersion,
  normalizeTreeTimes,
} from '../../../scripts/release/release-filesystem'

const temporaryDirectories: string[] = []

async function fixture(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'bitveins-release-filesystem-'))
  temporaryDirectories.push(path)
  return path
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

describe('release filesystem checks', () => {
  it('accepts x64 ELF files and rejects other file headers', async () => {
    const directory = await fixture()
    const elf = Buffer.alloc(20)
    elf.set([0x7f, 0x45, 0x4c, 0x46])
    elf.writeUInt16LE(62, 18)
    const validPath = join(directory, 'valid.node')
    const invalidPath = join(directory, 'invalid.node')
    await writeFile(validPath, elf)
    await writeFile(invalidPath, 'not an ELF file')

    await expect(assertLinuxX64Elf(validPath)).resolves.toBeUndefined()
    await expect(assertLinuxX64Elf(invalidPath)).rejects.toThrow(/Linux x86_64/)
  })

  it('enforces the glibc ABI ceiling numerically', async () => {
    const directory = await fixture()
    const compatible = Buffer.from('\0GLIBC_2.9\0GLIBC_2.34\0')
    const incompatible = Buffer.from('\0GLIBC_2.28\0GLIBC_2.35\0')
    const compatiblePath = join(directory, 'compatible.node')
    const incompatiblePath = join(directory, 'incompatible.node')
    const agnosticPath = join(directory, 'agnostic.node')
    await writeFile(compatiblePath, compatible)
    await writeFile(incompatiblePath, incompatible)
    await writeFile(agnosticPath, 'no version marker')

    expect(maximumRequiredGlibcVersion(compatible)).toBe('2.34')
    expect(maximumRequiredGlibcVersion(Buffer.from('no version marker'))).toBeNull()
    expect(maximumRequiredGlibcVersion(
      Buffer.from('\0GLIBC_2.99\0GLIBC_3.0\0'),
    )).toBe('3.0')
    await expect(
      assertMaximumGlibcVersion(compatiblePath),
    ).resolves.toBeUndefined()
    await expect(
      assertMaximumGlibcVersion(agnosticPath),
    ).resolves.toBeUndefined()
    await expect(
      assertMaximumGlibcVersion(incompatiblePath, '3.0'),
    ).resolves.toBeUndefined()
    await expect(
      assertMaximumGlibcVersion(compatiblePath, 'invalid'),
    ).rejects.toThrow(/Invalid glibc version policy/)
    await expect(
      assertMaximumGlibcVersion(incompatiblePath),
    ).rejects.toThrow(/glibc 2.35, above the release limit 2.34/)
  })

  it('normalizes all timestamps and detects forbidden content', async () => {
    const directory = await fixture()
    const nested = join(directory, 'nested')
    const file = join(nested, 'file')
    await mkdir(nested)
    await writeFile(file, 'safe value')
    const timestamp = new Date('2024-01-02T03:04:05.000Z')

    await normalizeTreeTimes(directory, timestamp)

    expect((await lstat(directory)).mtimeMs).toBe(timestamp.getTime())
    expect((await lstat(file)).mtimeMs).toBe(timestamp.getTime())
    await expect(
      assertNoForbiddenContent(directory, ['private machine path']),
    ).resolves.toBeUndefined()
    await writeFile(file, 'contains private machine path')
    expect(await readFile(file, 'utf8')).toContain('private machine path')
    await expect(
      assertNoForbiddenContent(directory, ['private machine path']),
    ).rejects.toThrow(/forbidden build-specific content/)
  })

  it('rejects symlinks escaping the build output boundary', async () => {
    const directory = await fixture()
    const outside = await fixture()
    const child = join(directory, 'child')
    await mkdir(child)
    await symlink(outside, join(child, 'escape'))

    await expect(
      assertContainedSymlinks(directory, directory),
    ).rejects.toThrow(/symlink escapes/)

    await rm(join(child, 'escape'))
    await writeFile(join(directory, 'target'), 'inside')
    await symlink(join(directory, 'target'), join(child, 'contained'))
    await expect(
      assertContainedSymlinks(directory, directory),
    ).resolves.toBeUndefined()
  })
})
