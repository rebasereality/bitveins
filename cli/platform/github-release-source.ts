import {
  mkdtemp,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CliIntegrityError, CliServiceError } from '../core/cli-error'
import {
  releaseArchiveName,
  releaseArchiveRootName,
} from '../core/release-metadata'
import type { ReleaseProvenanceVerifier } from '../ports/release-provenance-verifier'
import type {
  DownloadedRelease,
  ReleaseSource,
} from '../ports/release-source'
import { HttpsDownloader } from './https-downloader'
import { ReleaseArchive } from './release-archive'
import { loadReleaseBundle } from './release-bundle'
import { SigstoreReleaseProvenanceVerifier } from './sigstore-release-provenance-verifier'

interface LatestReleaseResponse {
  tag_name?: unknown
}

const metadataBytes = 1024 * 1024
const checksumBytes = 4 * 1024
const attestationBytes = 2 * 1024 * 1024
const archiveBytes = 512 * 1024 * 1024
const userAgent = 'bitveins-cli'

export class GitHubReleaseSource implements ReleaseSource {
  private readonly archive = new ReleaseArchive()
  private readonly downloader: HttpsDownloader

  constructor(
    fetcher: typeof fetch = fetch,
    private readonly repository = 'rebasereality/bitveins',
    private readonly provenance: ReleaseProvenanceVerifier
      = new SigstoreReleaseProvenanceVerifier(),
  ) {
    this.downloader = new HttpsDownloader(fetcher)
  }

  async download(requestedVersion?: string): Promise<DownloadedRelease> {
    const version = requestedVersion ?? await this.latestVersion()
    const archiveName = releaseArchiveName(version)
    const baseUrl = [
      `https://github.com/${this.repository}/releases/download`,
      `v${version}`,
    ].join('/')
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'bitveins-release-'),
    )
    const archivePath = join(temporaryDirectory, archiveName)
    const checksumPath = `${archivePath}.sha256`
    const attestationPath = `${archivePath}.sigstore.json`
    const extractionDirectory = join(temporaryDirectory, 'extracted')

    try {
      await this.downloader.download(
        `${baseUrl}/${archiveName}.sha256`,
        checksumPath,
        checksumBytes,
        { accept: 'text/plain', userAgent },
      )
      await this.downloader.download(
        `${baseUrl}/${archiveName}.sigstore.json`,
        attestationPath,
        attestationBytes,
        { accept: 'application/json', userAgent },
      )
      await this.downloader.download(
        `${baseUrl}/${archiveName}`,
        archivePath,
        archiveBytes,
        { accept: 'application/octet-stream', userAgent },
      )
      const digest = await this.archive.verifyChecksum(
        archivePath,
        checksumPath,
      )
      const provenance = await this.provenance.verify({
        archiveName,
        bundlePath: attestationPath,
        digest,
        version,
      })
      const root = await this.archive.extract(
        archivePath,
        extractionDirectory,
        releaseArchiveRootName(version),
      )
      const release = await loadReleaseBundle(root)
      if (release.metadata.version !== version) {
        throw new CliIntegrityError(
          'Downloaded release metadata does not match the requested version.',
        )
      }
      if (release.metadata.commit !== provenance.commit) {
        throw new CliIntegrityError(
          'Downloaded release commit does not match its provenance.',
        )
      }

      return {
        cleanup: async () => await rm(
          temporaryDirectory,
          { force: true, recursive: true },
        ),
        root,
      }
    }
    catch (error) {
      await rm(temporaryDirectory, { force: true, recursive: true })
      throw error
    }
  }

  private async latestVersion(): Promise<string> {
    const content = await this.downloader.readText(
      `https://api.github.com/repos/${this.repository}/releases/latest`,
      metadataBytes,
      { accept: 'application/vnd.github+json', userAgent },
    )
    let body: LatestReleaseResponse
    try {
      body = JSON.parse(content) as LatestReleaseResponse
    }
    catch (error) {
      throw new CliServiceError(
        'GitHub returned invalid release metadata.',
        { cause: error },
      )
    }
    if (
      typeof body.tag_name !== 'string'
      || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(body.tag_name)
    ) {
      throw new CliServiceError(
        'GitHub returned an invalid Bitveins release tag.',
      )
    }
    return body.tag_name.slice(1)
  }
}
