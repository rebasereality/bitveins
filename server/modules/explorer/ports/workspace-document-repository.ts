import type { Readable } from 'node:stream'
import type {
  ImageDocumentMetadata,
  WorkspaceDocumentMetadata,
} from '../model/workspace-document'

export interface OpenWorkspaceImage {
  metadata: ImageDocumentMetadata
  stream: Readable
}

export interface WorkspaceDocumentRepository {
  describe(rootPath: string, requestedPath: string): Promise<WorkspaceDocumentMetadata>
  openImage(rootPath: string, requestedPath: string): Promise<OpenWorkspaceImage>
  readText(rootPath: string, requestedPath: string): Promise<string>
}
