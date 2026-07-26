import type { RasterMediaType } from '#shared/contracts/explorer'

export interface ExplorerDocumentBase {
  path: string
  name: string
  isDirty: boolean
}

export interface ExplorerTextDocument extends ExplorerDocumentBase {
  kind: 'text'
  content: string
  originalContent: string
  navigationToken: number
  line?: number
  column?: number
}

export interface ExplorerImageDocument extends ExplorerDocumentBase {
  kind: 'image'
  mediaType: RasterMediaType
  size: number
  previewUrl: string
  isDirty: false
}

export type ExplorerDocument = ExplorerTextDocument | ExplorerImageDocument

export interface ExplorerFileNode {
  name: string
  path: string
  isDir: boolean
}

export function isTextDocument(document: ExplorerDocument): document is ExplorerTextDocument {
  return document.kind === 'text'
}
