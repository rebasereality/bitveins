import { describe, expect, it } from 'vitest'
import {
  isProbablyBinary,
  sniffRasterMediaType,
} from '../../../../../server/modules/explorer/model/workspace-document'

describe('workspace document media detection', () => {
  it.each([
    [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 'image/png'],
    [[0xFF, 0xD8, 0xFF], 'image/jpeg'],
    [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/gif'],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 'image/webp'],
    [[0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 'image/avif'],
  ] as const)('detects a supported raster signature', (bytes, expected) => {
    expect(sniffRasterMediaType(Uint8Array.from(bytes))).toBe(expected)
  })

  it('rejects malformed signatures and detects null bytes', () => {
    expect(sniffRasterMediaType(Uint8Array.from([1, 2, 3]))).toBeNull()
    expect(isProbablyBinary(Uint8Array.from([1, 0, 2]))).toBe(true)
    expect(isProbablyBinary(Uint8Array.from([1, 2, 3]))).toBe(false)
  })
})
