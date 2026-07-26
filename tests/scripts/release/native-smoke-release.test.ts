import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  expectMissing,
  setReleaseVersion,
} from '../../../scripts/release/native-smoke-release'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

describe('native smoke release fixtures', () => {
  it('rewrites only the validated release version', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-smoke-release-'))
    temporaryDirectories.push(root)
    const metadataPath = join(root, 'share', 'bitveins', 'release.json')
    await mkdir(join(root, 'share', 'bitveins'), { recursive: true })
    await writeFile(metadataPath, JSON.stringify({
      architecture: 'x64',
      commit: 'a'.repeat(40),
      nodeVersion: process.version,
      platform: 'linux',
      version: '0.1.0',
    }))

    await setReleaseVersion(root, '0.2.0')

    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toMatchObject({
      commit: 'a'.repeat(40),
      version: '0.2.0',
    })
  })

  it('distinguishes missing paths from present targets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-smoke-missing-'))
    temporaryDirectories.push(root)

    await expect(expectMissing(join(root, 'missing'))).resolves.toBeUndefined()
    await expect(expectMissing(root)).rejects.toThrow(/Expected native smoke/)
  })
})
