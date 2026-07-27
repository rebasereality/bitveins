import type { WorkspaceDocumentRepository } from '../ports/workspace-document-repository'
import type { MediaByteRange } from '../model/media-byte-range'

export class WorkspaceDocumentService {
  constructor(private readonly documents: WorkspaceDocumentRepository) {}

  describe(rootPath: string, requestedPath: string) {
    return this.documents.describe(rootPath, requestedPath)
  }

  openImage(rootPath: string, requestedPath: string) {
    return this.documents.openImage(rootPath, requestedPath)
  }

  openVideo(rootPath: string, requestedPath: string, range: MediaByteRange | null) {
    return this.documents.openVideo(rootPath, requestedPath, range)
  }

  readText(rootPath: string, requestedPath: string) {
    return this.documents.readText(rootPath, requestedPath)
  }
}
