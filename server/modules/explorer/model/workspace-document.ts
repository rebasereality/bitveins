import type { RasterMediaType } from '#shared/contracts/explorer'

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024
export const MAX_TEXT_BYTES = 5 * 1024 * 1024

export type { RasterMediaType } from '#shared/contracts/explorer'

export interface TextDocumentMetadata {
  kind: 'text'
  path: string
  name: string
  size: number
}

export interface ImageDocumentMetadata {
  kind: 'image'
  path: string
  name: string
  size: number
  mediaType: RasterMediaType
}

export type WorkspaceDocumentMetadata = TextDocumentMetadata | ImageDocumentMetadata

export class WorkspaceDocumentError extends Error {
  constructor(
    readonly code: 'not-found' | 'not-file' | 'outside-workspace' | 'unsupported-image' | 'too-large' | 'binary',
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceDocumentError'
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

export function sniffRasterMediaType(bytes: Uint8Array): RasterMediaType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    return 'image/png'
  }
  if (startsWith(bytes, [0xFF, 0xD8, 0xFF])) {
    return 'image/jpeg'
  }
  if (
    startsWith(bytes, [0x47, 0x49, 0x46, 0x38])
    && (bytes[4] === 0x37 || bytes[4] === 0x39)
    && bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp'
  }
  if (
    startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)
    && ['avif', 'avis'].includes(String.fromCharCode(...bytes.slice(8, 12)))
  ) {
    return 'image/avif'
  }
  return null
}

export function isProbablyBinary(bytes: Uint8Array): boolean {
  return bytes.includes(0)
}
