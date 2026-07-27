import type { Readable } from 'node:stream'
import type {
  BrowserImageMediaType,
  VideoDocumentMetadata,
  WorkspaceDocumentMetadata,
} from '../model/workspace-document'
import type { MediaByteRange } from '../model/media-byte-range'

export interface OpenWorkspaceImage {
  contentLength?: number
  mediaType: BrowserImageMediaType | 'image/svg+xml'
  name: string
  size: number
  stream: Readable
}

export interface OpenWorkspaceVideo {
  metadata: VideoDocumentMetadata
  stream: Readable
}

export interface WorkspaceDocumentRepository {
  describe(rootPath: string, requestedPath: string): Promise<WorkspaceDocumentMetadata>
  openImage(rootPath: string, requestedPath: string): Promise<OpenWorkspaceImage>
  openVideo(
    rootPath: string,
    requestedPath: string,
    range: MediaByteRange | null,
  ): Promise<OpenWorkspaceVideo>
  readText(rootPath: string, requestedPath: string): Promise<string>
}
