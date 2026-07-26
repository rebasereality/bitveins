import { mkdtemp, mkdir, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeWorkspaceDocumentRepository } from '../../../../../server/modules/explorer/adapters/node-workspace-document-repository'
import { WorkspaceDocumentError } from '../../../../../server/modules/explorer/model/workspace-document'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bitveins-documents-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('NodeWorkspaceDocumentRepository', () => {
  it('describes and reads text files', async () => {
    const root = await workspace()
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'src/file.ts'), 'export const value = 1\n')
    const repository = new NodeWorkspaceDocumentRepository()

    await expect(repository.describe(root, 'src/file.ts')).resolves.toMatchObject({
      kind: 'text',
      path: 'src/file.ts',
      name: 'file.ts',
    })
    await expect(repository.readText(root, 'src/file.ts')).resolves.toContain('value = 1')
  })

  it('sniffs and streams raster images when extension and content agree', async () => {
    const root = await workspace()
    const bytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2])
    await writeFile(join(root, 'preview.png'), bytes)
    const repository = new NodeWorkspaceDocumentRepository()

    const opened = await repository.openImage(root, 'preview.png')
    expect(opened.metadata).toMatchObject({ kind: 'image', mediaType: 'image/png' })
    expect(opened.stream).toHaveProperty('pipe')
    opened.stream.destroy()
    await expect(repository.readText(root, 'preview.png')).rejects.toMatchObject({ code: 'binary' })
  })

  it('rejects binary, oversized and non-regular files', async () => {
    const root = await workspace()
    await writeFile(join(root, 'binary.bin'), Buffer.from([1, 0, 2]))
    await writeFile(join(root, 'large.txt'), '')
    await truncate(join(root, 'large.txt'), 5 * 1024 * 1024 + 1)
    await writeFile(
      join(root, 'large.png'),
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    )
    await truncate(join(root, 'large.png'), 50 * 1024 * 1024 + 1)
    await mkdir(join(root, 'folder'))
    const repository = new NodeWorkspaceDocumentRepository()

    await expect(repository.describe(root, 'binary.bin')).rejects.toMatchObject({ code: 'binary' })
    await expect(repository.describe(root, 'large.txt')).rejects.toMatchObject({ code: 'too-large' })
    await expect(repository.describe(root, 'large.png')).rejects.toMatchObject({ code: 'too-large' })
    await expect(repository.describe(root, 'folder')).rejects.toMatchObject({ code: 'not-file' })
    await expect(repository.openImage(root, 'binary.bin')).rejects.toMatchObject({ code: 'binary' })
  })

  it('rejects mismatches between raster extensions and magic bytes', async () => {
    const root = await workspace()
    await writeFile(join(root, 'fake.png'), 'not an image')
    await writeFile(
      join(root, 'wrong.jpg'),
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    )
    const repository = new NodeWorkspaceDocumentRepository()

    await expect(repository.describe(root, 'fake.png')).rejects.toMatchObject({ code: 'unsupported-image' })
    await expect(repository.describe(root, 'wrong.jpg')).rejects.toMatchObject({ code: 'unsupported-image' })
  })

  it('confines symlinks to the workspace and maps missing files', async () => {
    const root = await workspace()
    const outside = await workspace()
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(join(outside, 'secret.txt'), join(root, 'escape.txt'))
    const repository = new NodeWorkspaceDocumentRepository()

    await expect(repository.describe(root, 'escape.txt')).rejects.toBeInstanceOf(WorkspaceDocumentError)
    await expect(repository.describe(root, 'missing.txt')).rejects.toMatchObject({ code: 'not-found' })
  })
})
