import type { LocatedExplorerDocument } from '../model/file-reference-resolution'

export interface WorkspaceCandidateLocator {
  locateRemembered(sessionRoot: string, rememberedRoot: string, path: string): Promise<LocatedExplorerDocument | null>
  locateAll(sessionRoot: string, currentPath: string, path: string): Promise<LocatedExplorerDocument[]>
  listProjectRoots(sessionRoot: string): Promise<string[]>
}
