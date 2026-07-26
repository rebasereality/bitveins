import type {
  ResolvedExplorerDocument,
  TerminalFileReference,
  TerminalFileResolution,
} from '#shared/contracts/explorer'

export interface FileReferenceContext {
  currentPath: string
  rememberedRoot?: string
  sessionRoot: string
}

export type LocatedExplorerDocument = ResolvedExplorerDocument & {
  canonicalPath: string
}

function withoutCanonicalPath(candidate: LocatedExplorerDocument): ResolvedExplorerDocument {
  const { canonicalPath: _canonicalPath, ...document } = candidate
  return document
}

export function resolutionFor(
  reference: TerminalFileReference,
  candidates: LocatedExplorerDocument[],
): TerminalFileResolution {
  const uniqueCandidates = [...new Map(
    candidates.map(candidate => [candidate.canonicalPath, candidate]),
  ).values()].map(withoutCanonicalPath)

  if (uniqueCandidates.length === 0) {
    return { status: 'missing', reference }
  }
  if (uniqueCandidates.length === 1) {
    return { status: 'unique', reference, document: uniqueCandidates[0]! }
  }
  return { status: 'ambiguous', reference, candidates: uniqueCandidates }
}
