import { join } from 'node:path'
import {
  releaseArchiveName,
  releaseArchiveRootName,
} from '../../cli/core/release-metadata.ts'

interface PackageJson {
  version: string
}

export interface ReleaseArtifactPaths {
  archiveName: string
  archivePath: string
  archiveRootName: string
  checksumPath: string
  manifestPath: string
  outputDirectory: string
}

export function parsePackageVersion(value: unknown): string {
  if (
    !value
    || typeof value !== 'object'
    || typeof (value as Partial<PackageJson>).version !== 'string'
  ) {
    throw new Error('package.json must contain a string version.')
  }

  return (value as PackageJson).version
}

export function releaseArtifactPaths(
  projectRoot: string,
  version: string,
): ReleaseArtifactPaths {
  const archiveName = releaseArchiveName(version)
  const archiveRootName = releaseArchiveRootName(version)
  const outputDirectory = join(projectRoot, 'dist', 'native')
  const archivePath = join(outputDirectory, archiveName)

  return {
    archiveName,
    archivePath,
    archiveRootName,
    checksumPath: `${archivePath}.sha256`,
    manifestPath: join(outputDirectory, `${archiveRootName}.manifest.json`),
    outputDirectory,
  }
}
