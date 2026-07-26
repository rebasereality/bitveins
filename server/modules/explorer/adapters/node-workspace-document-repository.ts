import { createReadStream } from 'node:fs'
import { open, readFile, stat } from 'node:fs/promises'
import { basename, extname, relative } from 'node:path'
import type { WorkspaceDocumentMetadata } from '../model/workspace-document'
import {
  isProbablyBinary,
  MAX_IMAGE_BYTES,
  MAX_TEXT_BYTES,
  sniffRasterMediaType,
  WorkspaceDocumentError,
} from '../model/workspace-document'
import type {
  OpenWorkspaceImage,
  WorkspaceDocumentRepository,
} from '../ports/workspace-document-repository'
import { resolveWorkspacePath } from '../../../utils/workspace-path'

const HEADER_BYTES = 16
const MEDIA_TYPE_BY_EXTENSION = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
} as const

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
      const mediaType = sniffRasterMediaType(header)
      const expectedMediaType = MEDIA_TYPE_BY_EXTENSION[
        extname(targetPath).toLowerCase() as keyof typeof MEDIA_TYPE_BY_EXTENSION
      ]
      const path = normalizedRelativePath(await resolveWorkspacePath(rootPath, '', { allowRoot: true }), targetPath)
      const common = { path, name: basename(targetPath), size: fileStat.size }

      if (mediaType) {
        if (mediaType !== expectedMediaType) {
          throw new WorkspaceDocumentError('unsupported-image', 'Image extension does not match its raster content.')
        }
        if (fileStat.size > MAX_IMAGE_BYTES) {
          throw new WorkspaceDocumentError('too-large', 'Image exceeds the 50 MiB preview limit.')
        }
        return { ...common, kind: 'image', mediaType }
      }
      if (expectedMediaType) {
        throw new WorkspaceDocumentError('unsupported-image', 'Image content does not match its file extension.')
      }

      if (fileStat.size > MAX_TEXT_BYTES) {
        throw new WorkspaceDocumentError('too-large', 'Text file exceeds the 5 MiB editor limit.')
      }
      if (isProbablyBinary(header)) {
        throw new WorkspaceDocumentError('binary', 'Binary file type is not supported by Explorer.')
      }
      return { ...common, kind: 'text' }
    }
    catch (error: unknown) {
      mapPathError(error)
    }
  }

  async openImage(rootPath: string, requestedPath: string): Promise<OpenWorkspaceImage> {
    const metadata = await this.describe(rootPath, requestedPath)
    if (metadata.kind !== 'image') {
      throw new WorkspaceDocumentError('unsupported-image', 'Only supported raster images can be previewed.')
    }
    const targetPath = await resolveWorkspacePath(rootPath, metadata.path)
    return {
      metadata,
      stream: createReadStream(targetPath),
    }
  }

  async readText(rootPath: string, requestedPath: string): Promise<string> {
    const metadata = await this.describe(rootPath, requestedPath)
    if (metadata.kind !== 'text') {
      throw new WorkspaceDocumentError('binary', 'Images must be opened in the image viewer.')
    }
    const targetPath = await resolveWorkspacePath(rootPath, metadata.path)
    return readFile(targetPath, 'utf8')
  }
}
