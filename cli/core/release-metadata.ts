export interface ReleaseMetadata {
  architecture: 'x64'
  commit: string
  nodeVersion: string
  platform: 'linux'
  version: string
}

const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const commitPattern = /^(?:[0-9a-f]{7,40}|unknown)$/

export function parseReleaseMetadata(value: unknown): ReleaseMetadata {
  if (!value || typeof value !== 'object') {
    throw new Error('Release metadata must be an object.')
  }

  const metadata = value as Partial<Record<keyof ReleaseMetadata, unknown>>

  if (
    metadata.platform !== 'linux'
    || metadata.architecture !== 'x64'
    || typeof metadata.version !== 'string'
    || !versionPattern.test(metadata.version)
    || typeof metadata.commit !== 'string'
    || !commitPattern.test(metadata.commit)
    || typeof metadata.nodeVersion !== 'string'
    || !/^v\d+\.\d+\.\d+/.test(metadata.nodeVersion)
  ) {
    throw new Error('Release metadata is invalid or targets an unsupported platform.')
  }

  return metadata as ReleaseMetadata
}

export function releaseMetadataEquals(
  left: ReleaseMetadata,
  right: ReleaseMetadata,
): boolean {
  return left.architecture === right.architecture
    && left.commit === right.commit
    && left.nodeVersion === right.nodeVersion
    && left.platform === right.platform
    && left.version === right.version
}

export function releaseArchiveName(version: string): string {
  if (!versionPattern.test(version)) {
    throw new Error(`Invalid Bitveins version: ${version}`)
  }

  return `bitveins-v${version}-linux-x64.tar.gz`
}

export function releaseArchiveRootName(version: string): string {
  return releaseArchiveName(version).replace(/\.tar\.gz$/u, '')
}
