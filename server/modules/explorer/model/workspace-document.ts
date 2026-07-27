import type {
  BrowserImageMediaType,
  ImageMediaType,
  SourcePreviewKind,
  VideoMediaType,
} from '#shared/contracts/explorer'

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024
export const MAX_TEXT_BYTES = 5 * 1024 * 1024

export type {
  BrowserImageMediaType,
  ImageMediaType,
  SourcePreviewKind,
  VideoMediaType,
} from '#shared/contracts/explorer'

export interface TextDocumentMetadata {
  kind: 'text'
  path: string
  name: string
  size: number
  previewKind?: SourcePreviewKind
}

export interface ImageDocumentMetadata {
  kind: 'image'
  path: string
  name: string
  size: number
  mediaType: ImageMediaType
  previewMediaType: BrowserImageMediaType
}

export interface VideoDocumentMetadata {
  kind: 'video'
  path: string
  name: string
  size: number
  mediaType: VideoMediaType
}

export interface BinaryDocumentMetadata {
  kind: 'binary'
  path: string
  name: string
  size: number
}

export type WorkspaceDocumentMetadata
  = | BinaryDocumentMetadata
    | ImageDocumentMetadata
    | TextDocumentMetadata
    | VideoDocumentMetadata

export class WorkspaceDocumentError extends Error {
  constructor(
    readonly code:
      | 'invalid-range'
      | 'not-found'
      | 'not-file'
      | 'outside-workspace'
      | 'unsupported-image'
      | 'unsupported-video'
      | 'too-large'
      | 'binary',
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceDocumentError'
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end))
}

export function sniffImageMediaType(bytes: Uint8Array): ImageMediaType | null {
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
    && ['avif', 'avis'].includes(ascii(bytes, 8, 12))
  ) {
    return 'image/avif'
  }
  if (startsWith(bytes, [0x42, 0x4D])) {
    return 'image/bmp'
  }
  if (
    startsWith(bytes, [0x00, 0x00, 0x01, 0x00])
    || startsWith(bytes, [0x00, 0x00, 0x02, 0x00])
  ) {
    return 'image/x-icon'
  }
  if (
    startsWith(bytes, [0x49, 0x49, 0x2A, 0x00])
    || startsWith(bytes, [0x4D, 0x4D, 0x00, 0x2A])
  ) {
    return 'image/tiff'
  }
  return null
}

export type VideoContainer = 'avi' | 'iso-bmff' | 'matroska' | 'mpeg' | 'ogg'

export function sniffVideoContainer(bytes: Uint8Array): VideoContainer | null {
  if (startsWith(bytes, [0x1A, 0x45, 0xDF, 0xA3])) {
    return 'matroska'
  }
  if (startsWith(bytes, [0x4F, 0x67, 0x67, 0x53])) {
    return 'ogg'
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWith(bytes, [0x41, 0x56, 0x49, 0x20], 8)
  ) {
    return 'avi'
  }
  if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
    return 'iso-bmff'
  }
  if (
    startsWith(bytes, [0x00, 0x00, 0x01, 0xBA])
    || startsWith(bytes, [0x00, 0x00, 0x01, 0xB3])
  ) {
    return 'mpeg'
  }
  return null
}

export function sourcePreviewKind(filename: string): SourcePreviewKind | undefined {
  const extension = filename.toLowerCase().split('.').pop()
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'svg') return 'svg'
  return undefined
}

export const sniffRasterMediaType = sniffImageMediaType

export function isProbablyBinary(bytes: Uint8Array): boolean {
  return bytes.includes(0)
}
