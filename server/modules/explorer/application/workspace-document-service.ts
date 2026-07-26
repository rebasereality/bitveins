import type { WorkspaceDocumentRepository } from '../ports/workspace-document-repository'

export class WorkspaceDocumentService {
  constructor(private readonly documents: WorkspaceDocumentRepository) {}

  describe(rootPath: string, requestedPath: string) {
    return this.documents.describe(rootPath, requestedPath)
  }

  openImage(rootPath: string, requestedPath: string) {
    return this.documents.openImage(rootPath, requestedPath)
  }

  readText(rootPath: string, requestedPath: string) {
    return this.documents.readText(rootPath, requestedPath)
  }
}
