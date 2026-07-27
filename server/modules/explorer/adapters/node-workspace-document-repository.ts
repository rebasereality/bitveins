import { createReadStream } from 'node:fs'
import { open, readFile, stat } from 'node:fs/promises'
import { basename, extname, relative } from 'node:path'
import sharp from 'sharp'
import type {
  BrowserImageMediaType,
  ImageMediaType,
  VideoContainer,
  VideoMediaType,
  WorkspaceDocumentMetadata,
} from '../model/workspace-document'
import {
  isProbablyBinary,
  MAX_IMAGE_BYTES,
  MAX_TEXT_BYTES,
  sniffImageMediaType,
  sniffVideoContainer,
  sourcePreviewKind,
  WorkspaceDocumentError,
} from '../model/workspace-document'
import type { MediaByteRange } from '../model/media-byte-range'
import type {
  OpenWorkspaceImage,
  OpenWorkspaceVideo,
  WorkspaceDocumentRepository,
} from '../ports/workspace-document-repository'
import { resolveWorkspacePath } from '../../../utils/workspace-path'

const HEADER_BYTES = 32

interface ImageFormat {
  mediaType: ImageMediaType
  previewMediaType: BrowserImageMediaType
  signatureMediaType: ImageMediaType
}

const IMAGE_FORMAT_BY_EXTENSION: Record<string, ImageFormat | undefined> = {
  '.apng': { mediaType: 'image/png', previewMediaType: 'image/png', signatureMediaType: 'image/png' },
  '.avif': { mediaType: 'image/avif', previewMediaType: 'image/avif', signatureMediaType: 'image/avif' },
  '.bmp': { mediaType: 'image/bmp', previewMediaType: 'image/bmp', signatureMediaType: 'image/bmp' },
  '.cur': { mediaType: 'image/x-icon', previewMediaType: 'image/x-icon', signatureMediaType: 'image/x-icon' },
  '.gif': { mediaType: 'image/gif', previewMediaType: 'image/gif', signatureMediaType: 'image/gif' },
  '.ico': { mediaType: 'image/x-icon', previewMediaType: 'image/x-icon', signatureMediaType: 'image/x-icon' },
  '.jfif': { mediaType: 'image/jpeg', previewMediaType: 'image/jpeg', signatureMediaType: 'image/jpeg' },
  '.jpe': { mediaType: 'image/jpeg', previewMediaType: 'image/jpeg', signatureMediaType: 'image/jpeg' },
  '.jpeg': { mediaType: 'image/jpeg', previewMediaType: 'image/jpeg', signatureMediaType: 'image/jpeg' },
  '.jpg': { mediaType: 'image/jpeg', previewMediaType: 'image/jpeg', signatureMediaType: 'image/jpeg' },
  '.pjp': { mediaType: 'image/jpeg', previewMediaType: 'image/jpeg', signatureMediaType: 'image/jpeg' },
  '.pjpeg': { mediaType: 'image/jpeg', previewMediaType: 'image/jpeg', signatureMediaType: 'image/jpeg' },
  '.png': { mediaType: 'image/png', previewMediaType: 'image/png', signatureMediaType: 'image/png' },
  '.tif': { mediaType: 'image/tiff', previewMediaType: 'image/png', signatureMediaType: 'image/tiff' },
  '.tiff': { mediaType: 'image/tiff', previewMediaType: 'image/png', signatureMediaType: 'image/tiff' },
  '.webp': { mediaType: 'image/webp', previewMediaType: 'image/webp', signatureMediaType: 'image/webp' },
}

interface VideoFormat {
  container: VideoContainer
  mediaType: VideoMediaType
}

const VIDEO_FORMAT_BY_EXTENSION: Record<string, VideoFormat | undefined> = {
  '.3g2': { container: 'iso-bmff', mediaType: 'video/3gpp' },
  '.3gp': { container: 'iso-bmff', mediaType: 'video/3gpp' },
  '.avi': { container: 'avi', mediaType: 'video/x-msvideo' },
  '.m4v': { container: 'iso-bmff', mediaType: 'video/mp4' },
  '.mkv': { container: 'matroska', mediaType: 'video/x-matroska' },
  '.mov': { container: 'iso-bmff', mediaType: 'video/quicktime' },
  '.mp4': { container: 'iso-bmff', mediaType: 'video/mp4' },
  '.mpeg': { container: 'mpeg', mediaType: 'video/mpeg' },
  '.mpg': { container: 'mpeg', mediaType: 'video/mpeg' },
  '.ogv': { container: 'ogg', mediaType: 'video/ogg' },
  '.webm': { container: 'matroska', mediaType: 'video/webm' },
}

function normalizedRelativePath(rootPath: string, targetPath: string): string {
  return relative(rootPath, targetPath).replaceAll('\\', '/')
}

function mapPathError(error: unknown): never {
  if (error instanceof WorkspaceDocumentError) throw error

  const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number(error.statusCode)
    : 0
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''

  if (statusCode === 403) {
    throw new WorkspaceDocumentError('outside-workspace', 'Path is outside of the session workspace.')
  }
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    throw new WorkspaceDocumentError('not-found', 'File does not exist.')
  }
  throw error
}

async function readHeader(targetPath: string): Promise<Uint8Array> {
  const handle = await open(targetPath, 'r')
  try {
    const buffer = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead)
  }
  finally {
    await handle.close()
  }
}

export class NodeWorkspaceDocumentRepository implements WorkspaceDocumentRepository {
  async describe(rootPath: string, requestedPath: string): Promise<WorkspaceDocumentMetadata> {
    try {
      const targetPath = await resolveWorkspacePath(rootPath, requestedPath)
      const fileStat = await stat(targetPath)
      if (!fileStat.isFile()) {
        throw new WorkspaceDocumentError('not-file', 'Path does not reference a regular file.')
      }

      const header = await readHeader(targetPath)
      const extension = extname(targetPath).toLowerCase()
      const imageMediaType = sniffImageMediaType(header)
      const imageFormat = IMAGE_FORMAT_BY_EXTENSION[extension]
      const videoContainer = sniffVideoContainer(header)
      const videoFormat = VIDEO_FORMAT_BY_EXTENSION[extension]
      const path = normalizedRelativePath(await resolveWorkspacePath(rootPath, '', { allowRoot: true }), targetPath)
      const common = { path, name: basename(targetPath), size: fileStat.size }

      if (imageFormat) {
        if (imageMediaType !== imageFormat.signatureMediaType) {
          throw new WorkspaceDocumentError('unsupported-image', 'Image content does not match its file extension.')
        }
        if (fileStat.size > MAX_IMAGE_BYTES) {
          throw new WorkspaceDocumentError('too-large', 'Image exceeds the 50 MiB preview limit.')
        }
        return {
          ...common,
          kind: 'image',
          mediaType: imageFormat.mediaType,
          previewMediaType: imageFormat.previewMediaType,
        }
      }
      if (imageMediaType) {
        throw new WorkspaceDocumentError('unsupported-image', 'Image extension does not match its raster content.')
      }

      if (videoFormat) {
        if (videoContainer !== videoFormat.container) {
          throw new WorkspaceDocumentError('unsupported-video', 'Video content does not match its file extension.')
        }
        return {
          ...common,
          kind: 'video',
          mediaType: videoFormat.mediaType,
        }
      }
      if (videoContainer) {
        if (videoContainer === 'iso-bmff') {
          return { ...common, kind: 'binary' }
        }
        throw new WorkspaceDocumentError('unsupported-video', 'Video extension does not match its container.')
      }

      if (isProbablyBinary(header)) {
        return { ...common, kind: 'binary' }
      }
      if (fileStat.size > MAX_TEXT_BYTES) {
        throw new WorkspaceDocumentError('too-large', 'Text file exceeds the 5 MiB editor limit.')
      }
      return {
        ...common,
        kind: 'text',
        previewKind: sourcePreviewKind(targetPath),
      }
    }
    catch (error: unknown) {
      mapPathError(error)
    }
  }

  async openImage(rootPath: string, requestedPath: string): Promise<OpenWorkspaceImage> {
    const metadata = await this.describe(rootPath, requestedPath)
    const targetPath = await resolveWorkspacePath(rootPath, metadata.path)

    if (metadata.kind === 'text' && metadata.previewKind === 'svg') {
      return {
        contentLength: metadata.size,
        mediaType: 'image/svg+xml',
        name: metadata.name,
        size: metadata.size,
        stream: createReadStream(targetPath),
      }
    }
    if (metadata.kind !== 'image') {
      throw new WorkspaceDocumentError('unsupported-image', 'Only supported images can be previewed.')
    }
    if (metadata.mediaType === 'image/tiff') {
      return {
        mediaType: metadata.previewMediaType,
        name: metadata.name,
        size: metadata.size,
        stream: sharp(targetPath).rotate().png(),
      }
    }
    return {
      contentLength: metadata.size,
      mediaType: metadata.previewMediaType,
      name: metadata.name,
      size: metadata.size,
      stream: createReadStream(targetPath),
    }
  }

  async openVideo(
    rootPath: string,
    requestedPath: string,
    range: MediaByteRange | null,
  ): Promise<OpenWorkspaceVideo> {
    const metadata = await this.describe(rootPath, requestedPath)
    if (metadata.kind !== 'video') {
      throw new WorkspaceDocumentError('unsupported-video', 'Only supported video containers can be streamed.')
    }
    const targetPath = await resolveWorkspacePath(rootPath, metadata.path)
    return {
      metadata,
      stream: createReadStream(targetPath, range || undefined),
    }
  }

  async readText(rootPath: string, requestedPath: string): Promise<string> {
    const metadata = await this.describe(rootPath, requestedPath)
    if (metadata.kind !== 'text') {
      throw new WorkspaceDocumentError('binary', 'Binary media cannot be opened in the source editor.')
    }
    const targetPath = await resolveWorkspacePath(rootPath, metadata.path)
    return readFile(targetPath, 'utf8')
  }
}
