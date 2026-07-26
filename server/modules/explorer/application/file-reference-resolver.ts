import type {
  TerminalFileReference,
  TerminalFileResolution,
} from '#shared/contracts/explorer'
import type { FileReferenceContext } from '../model/file-reference-resolution'
import { resolutionFor } from '../model/file-reference-resolution'
import type { WorkspaceCandidateLocator } from '../ports/workspace-candidate-locator'

export class FileReferenceResolver {
  constructor(private readonly locator: WorkspaceCandidateLocator) {}

  async resolve(
    context: FileReferenceContext,
    references: TerminalFileReference[],
  ): Promise<TerminalFileResolution[]> {
    return Promise.all(references.map(reference => this.resolveOne(context, reference)))
  }

  listProjectRoots(sessionRoot: string): Promise<string[]> {
    return this.locator.listProjectRoots(sessionRoot)
  }

  private async resolveOne(
    context: FileReferenceContext,
    reference: TerminalFileReference,
  ): Promise<TerminalFileResolution> {
    if (context.rememberedRoot && !reference.path.startsWith('/') && !reference.path.startsWith('~/')) {
      const remembered = await this.locator.locateRemembered(
        context.sessionRoot,
        context.rememberedRoot,
        reference.path,
      )
      if (remembered) {
        return resolutionFor(reference, [remembered])
      }
    }

    const candidates = await this.locator.locateAll(
      context.sessionRoot,
      context.currentPath,
      reference.path,
    )
    return resolutionFor(reference, candidates)
  }
}
