import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parsePackageVersion,
  releaseArtifactPaths,
} from '../../../scripts/release/release-artifact'

describe('release artifact layout', () => {
  it('derives every artifact path from a validated version', () => {
    const artifact = releaseArtifactPaths('/project', '1.2.3')

    expect(artifact).toEqual({
      archiveName: 'bitveins-v1.2.3-linux-x64.tar.gz',
      archivePath: join(
        '/project',
        'dist/native/bitveins-v1.2.3-linux-x64.tar.gz',
      ),
      archiveRootName: 'bitveins-v1.2.3-linux-x64',
      checksumPath: join(
        '/project',
        'dist/native/bitveins-v1.2.3-linux-x64.tar.gz.sha256',
      ),
      manifestPath: join(
        '/project',
        'dist/native/bitveins-v1.2.3-linux-x64.manifest.json',
      ),
      outputDirectory: join('/project', 'dist/native'),
    })
  })

  it('validates package metadata and versions before creating paths', () => {
    expect(parsePackageVersion({ version: '1.2.3' })).toBe('1.2.3')
    expect(() => parsePackageVersion({ version: 1 })).toThrow(
      /package\.json/,
    )
    expect(() => releaseArtifactPaths('/project', '../latest')).toThrow(
      /Invalid Bitveins version/,
    )
  })
})
