import { createHash } from 'node:crypto'
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as tar from 'tar'
import { GitHubReleaseSource } from '../../../cli/platform/github-release-source'
import type {
  ReleaseProvenance,
  ReleaseProvenanceRequest,
  ReleaseProvenanceVerifier,
} from '../../../cli/ports/release-provenance-verifier'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

function releaseFetcher(
  archive: Buffer,
  checksum: string,
  latestTag = 'v1.2.3',
): typeof fetch {
  return (async (input) => {
    const url = String(input)
    if (url.endsWith('/releases/latest')) {
      return new Response(JSON.stringify({ tag_name: latestTag }), {
        status: 200,
      })
    }
    if (url.endsWith('.sha256')) {
      return new Response(checksum, { status: 200 })
    }
    if (url.endsWith('.sigstore.json')) {
      return new Response('{}', { status: 200 })
    }
    return new Response(archive, { status: 200 })
  }) as typeof fetch
}

async function releaseArchiveFixture(options: {
  commit?: string
  metadataVersion?: string
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'bitveins-valid-release-'))
  temporaryDirectories.push(directory)
  const rootName = 'bitveins-v1.2.3-linux-x64'
  const root = join(directory, rootName)
  await Promise.all([
    mkdir(join(root, 'app', '.output', 'server'), { recursive: true }),
    mkdir(join(root, 'bin'), { recursive: true }),
    mkdir(join(root, 'runtime', 'bin'), { recursive: true }),
    mkdir(join(root, 'share', 'bitveins'), { recursive: true }),
  ])
  await Promise.all([
    writeFile(join(root, 'app', '.output', 'server', 'index.mjs'), ''),
    writeFile(join(root, 'bin', 'bitveins'), '', { mode: 0o755 }),
    writeFile(join(root, 'runtime', 'bin', 'node'), '', { mode: 0o755 }),
    writeFile(
      join(root, 'share', 'bitveins', 'release.json'),
      JSON.stringify({
        architecture: 'x64',
        commit: options.commit ?? 'a'.repeat(40),
        nodeVersion: process.version,
        platform: 'linux',
        version: options.metadataVersion ?? '1.2.3',
      }),
    ),
  ])
  await Promise.all([
    chmod(join(root, 'bin', 'bitveins'), 0o755),
    chmod(join(root, 'runtime', 'bin', 'node'), 0o755),
  ])
  const archivePath = join(directory, `${rootName}.tar.gz`)
  await tar.c({ cwd: directory, file: archivePath, gzip: true }, [rootName])
  const archive = await readFile(archivePath)
  const digest = createHash('sha256').update(archive).digest('hex')
  return {
    archive,
    checksum: `${digest}  ${rootName}.tar.gz\n`,
    digest,
  }
}

class AcceptingProvenance implements ReleaseProvenanceVerifier {
  readonly requests: ReleaseProvenanceRequest[] = []

  constructor(private readonly commit = 'a'.repeat(40)) {}

  async verify(
    request: ReleaseProvenanceRequest,
  ): Promise<ReleaseProvenance> {
    this.requests.push(request)
    return { commit: this.commit }
  }
}

describe('GitHubReleaseSource', () => {
  it('downloads the latest release, verifies it and exposes explicit cleanup', async () => {
    const fixture = await releaseArchiveFixture()
    const provenance = new AcceptingProvenance()
    const source = new GitHubReleaseSource(
      releaseFetcher(fixture.archive, fixture.checksum),
      'rebasereality/bitveins',
      provenance,
    )

    const release = await source.download()

    expect(provenance.requests).toMatchObject([{
      archiveName: 'bitveins-v1.2.3-linux-x64.tar.gz',
      digest: fixture.digest,
      version: '1.2.3',
    }])
    await expect(access(release.root)).resolves.toBeUndefined()
    const temporaryRoot = join(release.root, '..', '..')
    await release.cleanup()
    await expect(access(temporaryRoot)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('fails cleanly when the release download is interrupted', async () => {
    const source = new GitHubReleaseSource((async () => {
      throw new TypeError('connection reset')
    }) as typeof fetch)

    await expect(source.download('1.2.3')).rejects.toThrow(/connection reset/)
  })

  it('rejects a downloaded release whose checksum does not match', async () => {
    const archive = Buffer.from('not a tar archive')
    const source = new GitHubReleaseSource(
      releaseFetcher(
        archive,
        `${'0'.repeat(64)}  bitveins-v1.2.3-linux-x64.tar.gz\n`,
      ),
    )

    await expect(source.download('1.2.3')).rejects.toThrow(/checksum verification failed/)
  })

  it('rejects symbolic links even when the archive checksum is valid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-malicious-release-'))
    temporaryDirectories.push(directory)
    const rootName = 'bitveins-v1.2.3-linux-x64'
    const contents = join(directory, rootName)
    const archivePath = join(directory, 'release.tar.gz')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(contents)
    await writeFile(join(contents, 'safe'), 'safe')
    await symlink('/etc/passwd', join(contents, 'unexpected-link'))
    await tar.c({
      cwd: directory,
      file: archivePath,
      gzip: true,
    }, [rootName])
    const archive = await readFile(archivePath)
    const checksum = createHash('sha256').update(archive).digest('hex')
    const source = new GitHubReleaseSource(
      releaseFetcher(
        archive,
        `${checksum}  bitveins-v1.2.3-linux-x64.tar.gz\n`,
      ),
      'rebasereality/bitveins',
      new AcceptingProvenance(),
    )

    await expect(source.download('1.2.3'))
      .rejects.toThrow(/unsupported entry type SymbolicLink/)
  })

  it('rejects release metadata and provenance commit mismatches', async () => {
    const wrongVersion = await releaseArchiveFixture({
      metadataVersion: '1.2.4',
    })
    await expect(new GitHubReleaseSource(
      releaseFetcher(wrongVersion.archive, wrongVersion.checksum),
      'rebasereality/bitveins',
      new AcceptingProvenance(),
    ).download('1.2.3')).rejects.toThrow(/metadata does not match/)

    const wrongCommit = await releaseArchiveFixture()
    await expect(new GitHubReleaseSource(
      releaseFetcher(wrongCommit.archive, wrongCommit.checksum),
      'rebasereality/bitveins',
      new AcceptingProvenance('b'.repeat(40)),
    ).download('1.2.3')).rejects.toThrow(/commit does not match/)
  })

  it('rejects malformed latest-release responses', async () => {
    await expect(new GitHubReleaseSource(
      (async () => new Response('{invalid')) as typeof fetch,
    ).download()).rejects.toThrow(/invalid release metadata/)
    await expect(new GitHubReleaseSource(
      (async () => new Response(JSON.stringify({
        tag_name: 'latest',
      }))) as typeof fetch,
    ).download()).rejects.toThrow(/invalid Bitveins release tag/)
  })
})
