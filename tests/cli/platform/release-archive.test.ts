import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import * as tar from 'tar'
import { ReleaseArchive } from '../../../cli/platform/release-archive'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

async function archiveFixture(files: Record<string, string>) {
  const directory = await mkdtemp(join(tmpdir(), 'bitveins-archive-'))
  temporaryDirectories.push(directory)
  const rootName = 'bitveins-v1.2.3-linux-x64'
  const root = join(directory, rootName)
  await mkdir(root, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, name), content)
  }
  const archivePath = join(directory, 'bitveins-v1.2.3-linux-x64.tar.gz')
  await tar.c(
    { cwd: directory, file: archivePath, gzip: true },
    [rootName],
  )
  return { archivePath, directory, rootName }
}

describe('ReleaseArchive', () => {
  it('verifies a checksum and extracts a bounded regular archive', async () => {
    const fixture = await archiveFixture({ file: 'safe content' })
    const checksumPath = `${fixture.archivePath}.sha256`
    const digest = createHash('sha256')
      .update(await readFile(fixture.archivePath))
      .digest('hex')
    await writeFile(
      checksumPath,
      `${digest}  bitveins-v1.2.3-linux-x64.tar.gz\n`,
    )
    const archive = new ReleaseArchive()

    await expect(archive.verifyChecksum(
      fixture.archivePath,
      checksumPath,
    )).resolves.toBe(digest)
    const root = await archive.extract(
      fixture.archivePath,
      join(fixture.directory, 'extracted'),
      fixture.rootName,
    )
    expect(await readFile(join(root, 'file'), 'utf8')).toBe('safe content')
  })

  it('rejects malformed checksum files and empty archives', async () => {
    const fixture = await archiveFixture({ file: 'safe content' })
    const checksumPath = `${fixture.archivePath}.sha256`
    await writeFile(checksumPath, 'not-a-checksum\n')
    await expect(new ReleaseArchive().verifyChecksum(
      fixture.archivePath,
      checksumPath,
    )).rejects.toThrow(/invalid format/)

    const emptyPath = join(fixture.directory, 'empty.tar.gz')
    await writeFile(emptyPath, gzipSync(Buffer.alloc(1024)))
    await expect(new ReleaseArchive().extract(
      emptyPath,
      join(fixture.directory, 'empty-output'),
      fixture.rootName,
    )).rejects.toThrow(/archive is empty/)
  })

  it('enforces entry-count and extracted-size limits before extraction', async () => {
    const fixture = await archiveFixture({
      first: '12345678',
      second: '12345678',
    })

    await expect(new ReleaseArchive({
      entries: 1,
      extractedBytes: 1024,
    }).extract(
      fixture.archivePath,
      join(fixture.directory, 'entry-output'),
      fixture.rootName,
    )).rejects.toThrow(/extraction safety limits/)

    await expect(new ReleaseArchive({
      entries: 100,
      extractedBytes: 4,
    }).extract(
      fixture.archivePath,
      join(fixture.directory, 'size-output'),
      fixture.rootName,
    )).rejects.toThrow(/extraction safety limits/)
  })

  it('rejects traversal paths and entries outside the expected root', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-archive-paths-'))
    temporaryDirectories.push(directory)
    await writeFile(join(directory, 'file'), 'content')
    const traversal = join(directory, 'traversal.tar.gz')
    const otherRoot = join(directory, 'other-root.tar.gz')
    await tar.c({
      cwd: directory,
      file: traversal,
      gzip: true,
      prefix: '../escape',
    }, ['file'])
    await tar.c({
      cwd: directory,
      file: otherRoot,
      gzip: true,
      prefix: 'another-release',
    }, ['file'])
    const archive = new ReleaseArchive()

    await expect(archive.extract(
      traversal,
      join(directory, 'traversal-output'),
      'bitveins-v1.2.3-linux-x64',
    )).rejects.toThrow(/unsafe path/)
    await expect(archive.extract(
      otherRoot,
      join(directory, 'other-output'),
      'bitveins-v1.2.3-linux-x64',
    )).rejects.toThrow(/outside bitveins-v1.2.3-linux-x64/)
  })
})
