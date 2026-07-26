import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeWorkspaceCandidateLocator } from '../../../../../server/modules/explorer/adapters/node-workspace-candidate-locator'
import { NodeWorkspaceDocumentRepository } from '../../../../../server/modules/explorer/adapters/node-workspace-document-repository'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bitveins-candidates-'))
  roots.push(root)
  return root
}

function createLocator(): NodeWorkspaceCandidateLocator {
  return new NodeWorkspaceCandidateLocator(new NodeWorkspaceDocumentRepository())
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('NodeWorkspaceCandidateLocator', () => {
  it('finds ambiguity across bounded project roots', async () => {
    const root = await workspace()
    for (const project of ['one', 'two']) {
      await mkdir(join(root, project, 'src'), { recursive: true })
      await writeFile(join(root, project, 'package.json'), '{}')
      await writeFile(join(root, project, 'src/file.ts'), project)
    }
    const locator = createLocator()

    const candidates = await locator.locateAll(root, root, 'src/file.ts')
    expect(candidates.map(candidate => candidate.root).sort()).toEqual(['one', 'two'])
    await expect(locator.listProjectRoots(root)).resolves.toEqual(expect.arrayContaining(['.', 'one', 'two']))
  })

  it('honors safe remembered and absolute paths while rejecting escapes', async () => {
    const root = await workspace()
    await mkdir(join(root, 'project'), { recursive: true })
    await writeFile(join(root, 'project/file.ts'), 'content')
    const outside = await workspace()
    await writeFile(join(outside, 'outside.ts'), 'content')
    const locator = createLocator()

    await expect(locator.locateRemembered(root, 'project', 'file.ts')).resolves.toMatchObject({
      root: 'project',
      path: 'project/file.ts',
    })
    await expect(locator.locateRemembered(root, '../outside', 'outside.ts')).resolves.toBeNull()
    await expect(locator.locateAll(root, root, join(outside, 'outside.ts'))).resolves.toEqual([])
    await expect(locator.locateAll(root, root, join(root, 'project/file.ts'))).resolves.toHaveLength(1)
  })

  it('uses a bounded suffix fallback even without project markers', async () => {
    const root = await workspace()
    await mkdir(join(root, 'unmarked', 'src'), { recursive: true })
    await writeFile(join(root, 'unmarked/src/only.ts'), 'content')
    const locator = createLocator()

    await expect(locator.locateAll(root, root, 'src/only.ts')).resolves.toMatchObject([
      { root: 'unmarked', path: 'unmarked/src/only.ts' },
    ])
  })

  it('caps project roots and resolved candidates', async () => {
    const root = await workspace()
    await Promise.all(Array.from({ length: 40 }, async (_, index) => {
      const project = join(root, `project-${String(index).padStart(2, '0')}`)
      await mkdir(join(project, 'src'), { recursive: true })
      await Promise.all([
        writeFile(join(project, 'package.json'), '{}'),
        writeFile(join(project, 'src/file.ts'), String(index)),
      ])
    }))
    const locator = createLocator()

    await expect(locator.listProjectRoots(root)).resolves.toHaveLength(32)
    expect(await locator.locateAll(root, root, 'src/file.ts')).toHaveLength(32)
  })
})
