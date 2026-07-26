import { describe, expect, it } from 'vitest'
import {
  parseReleaseMetadata,
  releaseArchiveName,
  releaseArchiveRootName,
  releaseMetadataEquals,
} from '../../../cli/core/release-metadata'

describe('release metadata', () => {
  it('accepts a supported Linux x64 release', () => {
    expect(parseReleaseMetadata({
      architecture: 'x64',
      commit: 'a'.repeat(40),
      nodeVersion: 'v24.13.0',
      platform: 'linux',
      version: '1.2.3',
    }).version).toBe('1.2.3')
    expect(releaseArchiveName('1.2.3')).toBe('bitveins-v1.2.3-linux-x64.tar.gz')
    expect(releaseArchiveRootName('1.2.3')).toBe(
      'bitveins-v1.2.3-linux-x64',
    )
  })

  it('rejects unsupported architectures and unsafe versions', () => {
    expect(() => parseReleaseMetadata({
      architecture: 'arm64',
      commit: 'unknown',
      nodeVersion: 'v24.13.0',
      platform: 'linux',
      version: '1.2.3',
    })).toThrow(/unsupported platform/)
    expect(() => releaseArchiveName('../latest')).toThrow(/Invalid Bitveins version/)
  })

  it('compares metadata by value instead of object property order', () => {
    const left = parseReleaseMetadata({
      architecture: 'x64',
      commit: 'a'.repeat(40),
      nodeVersion: 'v24.13.0',
      platform: 'linux',
      version: '1.2.3',
    })
    const right = parseReleaseMetadata({
      version: '1.2.3',
      platform: 'linux',
      nodeVersion: 'v24.13.0',
      commit: 'a'.repeat(40),
      architecture: 'x64',
    })

    expect(releaseMetadataEquals(left, right)).toBe(true)
    expect(releaseMetadataEquals(left, { ...right, version: '1.2.4' })).toBe(false)
  })
})
