import { describe, expect, it } from 'vitest'
import {
  isProbablyBinary,
  sniffImageMediaType,
  sniffVideoContainer,
  sourcePreviewKind,
} from '../../../../../server/modules/explorer/model/workspace-document'

describe('workspace document media detection', () => {
  it.each([
    [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 'image/png'],
    [[0xFF, 0xD8, 0xFF], 'image/jpeg'],
    [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/gif'],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'image/webp'],
    [[0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 'image/avif'],
    [[0x42, 0x4D], 'image/bmp'],
    [[0x00, 0x00, 0x01, 0x00], 'image/x-icon'],
    [[0x49, 0x49, 0x2A, 0x00], 'image/tiff'],
  ] as const)('detects a supported raster signature', (bytes, expected) => {
    expect(sniffImageMediaType(Uint8Array.from(bytes))).toBe(expected)
  })

  it.each([
    [[0x1A, 0x45, 0xDF, 0xA3], 'matroska'],
    [[0x4F, 0x67, 0x67, 0x53], 'ogg'],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20], 'avi'],
    [[0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6F, 0x6D], 'iso-bmff'],
    [[0x00, 0x00, 0x01, 0xBA], 'mpeg'],
  ] as const)('detects a supported video container', (bytes, expected) => {
    expect(sniffVideoContainer(Uint8Array.from(bytes))).toBe(expected)
  })

  it('classifies previewable source extensions', () => {
    expect(sourcePreviewKind('README.md')).toBe('markdown')
    expect(sourcePreviewKind('diagram.svg')).toBe('svg')
    expect(sourcePreviewKind('component.vue')).toBeUndefined()
  })

  it('rejects malformed signatures and detects null bytes', () => {
    expect(sniffImageMediaType(Uint8Array.from([1, 2, 3]))).toBeNull()
    expect(sniffVideoContainer(Uint8Array.from([1, 2, 3]))).toBeNull()
    expect(isProbablyBinary(Uint8Array.from([1, 0, 2]))).toBe(true)
    expect(isProbablyBinary(Uint8Array.from([1, 2, 3]))).toBe(false)
  })
})
