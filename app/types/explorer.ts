import type {
  BrowserImageMediaType,
  ImageMediaType,
  SourcePreviewKind,
  VideoMediaType,
} from '#shared/contracts/explorer'
import type { GitFileChange } from '#shared/contracts/git'

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
  previewEnabled: boolean
  previewKind?: SourcePreviewKind
  size: number
  line?: number
  column?: number
}

export interface ExplorerImageDocument extends ExplorerDocumentBase {
  kind: 'image'
  mediaType: ImageMediaType
  previewMediaType: BrowserImageMediaType
  size: number
  previewUrl: string
  isDirty: false
}

export interface ExplorerVideoDocument extends ExplorerDocumentBase {
  kind: 'video'
  mediaType: VideoMediaType
  size: number
  streamUrl: string
  isDirty: false
}

export interface ExplorerBinaryDocument extends ExplorerDocumentBase {
  kind: 'binary'
  size: number
  isDirty: false
}

export interface ExplorerGitDiffDocument extends ExplorerDocumentBase {
  kind: 'git-diff'
  commit: string
  filePath: string
  previousPath?: string
  status: GitFileChange['status']
  binary: boolean
  before: string | null
  after: string | null
  isDirty: false
}

export type ExplorerDocument
  = | ExplorerBinaryDocument
    | ExplorerImageDocument
    | ExplorerGitDiffDocument
    | ExplorerTextDocument
    | ExplorerVideoDocument

export interface ExplorerFileNode {
  name: string
  path: string
  isDir: boolean
}

export function isTextDocument(document: ExplorerDocument): document is ExplorerTextDocument {
  return document.kind === 'text'
}

export function isGitDiffDocument(document: ExplorerDocument | null): document is ExplorerGitDiffDocument {
  return document?.kind === 'git-diff'
}

export function isPreviewableTextDocument(
  document: ExplorerDocument | null,
): document is ExplorerTextDocument & { previewKind: SourcePreviewKind } {
  return document?.kind === 'text' && document.previewKind !== undefined
}
