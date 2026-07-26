import { describe, expect, it, vi } from 'vitest'
import { FileReferenceResolver } from '../../../../../server/modules/explorer/application/file-reference-resolver'
import type { WorkspaceCandidateLocator } from '../../../../../server/modules/explorer/ports/workspace-candidate-locator'

const document = {
  canonicalPath: '/workspace/project/src/file.ts',
  absolutePath: '/workspace/project/src/file.ts',
  root: 'project',
  kind: 'text' as const,
  path: 'project/src/file.ts',
  name: 'file.ts',
  size: 20,
}

function createLocator(): WorkspaceCandidateLocator {
  return {
    locateRemembered: vi.fn().mockResolvedValue(null),
    locateAll: vi.fn().mockResolvedValue([document]),
    listProjectRoots: vi.fn().mockResolvedValue(['.', 'project']),
  }
}

describe('FileReferenceResolver', () => {
  it('lets an explicit remembered root win when it resolves', async () => {
    const locator = createLocator()
    vi.mocked(locator.locateRemembered).mockResolvedValue(document)
    const resolver = new FileReferenceResolver(locator)

    await expect(resolver.resolve({
      sessionRoot: '/workspace',
      currentPath: '/workspace',
      rememberedRoot: 'project',
    }, [{ path: 'src/file.ts' }])).resolves.toMatchObject([
      { status: 'unique', document: { root: 'project' } },
    ])
    expect(locator.locateAll).not.toHaveBeenCalled()
  })

  it('falls back to all roots when a preference is absent or stale', async () => {
    const locator = createLocator()
    const resolver = new FileReferenceResolver(locator)

    await resolver.resolve({
      sessionRoot: '/workspace',
      currentPath: '/workspace',
      rememberedRoot: 'stale',
    }, [{ path: 'src/file.ts' }, { path: '/workspace/project/src/file.ts' }])

    expect(locator.locateAll).toHaveBeenCalledTimes(2)
    expect(locator.locateRemembered).toHaveBeenCalledTimes(1)
  })

  it('exposes discovered roots', async () => {
    const locator = createLocator()
    const resolver = new FileReferenceResolver(locator)
    await expect(resolver.listProjectRoots('/workspace')).resolves.toEqual(['.', 'project'])
  })
})
