import { mkdtemp, mkdir, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeWorkspaceDocumentRepository } from '../../../../../server/modules/explorer/adapters/node-workspace-document-repository'
import { WorkspaceDocumentError } from '../../../../../server/modules/explorer/model/workspace-document'

const roots: string[] = []

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bitveins-documents-'))
  roots.push(root)
  return root
}

async function streamBytes(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
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
    await writeFile(join(root, 'README.md'), '# Preview\n')
    await writeFile(join(root, 'diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const repository = new NodeWorkspaceDocumentRepository()

    await expect(repository.describe(root, 'src/file.ts')).resolves.toMatchObject({
      kind: 'text',
      path: 'src/file.ts',
      name: 'file.ts',
    })
    await expect(repository.describe(root, 'README.md')).resolves.toMatchObject({
      kind: 'text',
      previewKind: 'markdown',
    })
    await expect(repository.describe(root, 'diagram.svg')).resolves.toMatchObject({
      kind: 'text',
      previewKind: 'svg',
    })
    await expect(repository.readText(root, 'src/file.ts')).resolves.toContain('value = 1')
  })

  it('sniffs and streams browser images when extension and content agree', async () => {
    const root = await workspace()
    const bytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2])
    await writeFile(join(root, 'preview.png'), bytes)
    const repository = new NodeWorkspaceDocumentRepository()

    const opened = await repository.openImage(root, 'preview.png')
    expect(opened).toMatchObject({
      contentLength: bytes.length,
      mediaType: 'image/png',
      name: 'preview.png',
    })
    expect(opened.stream).toHaveProperty('pipe')
    opened.stream.destroy()
    await expect(repository.readText(root, 'preview.png')).rejects.toMatchObject({ code: 'binary' })
  })

  it('describes unsupported binaries and rejects oversized or non-regular files', async () => {
    const root = await workspace()
    await writeFile(join(root, 'binary.bin'), Buffer.from([1, 0, 2]))
    await writeFile(join(root, 'large.txt'), 'x'.repeat(5 * 1024 * 1024 + 1))
    await writeFile(
      join(root, 'large.png'),
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    )
    await truncate(join(root, 'large.png'), 50 * 1024 * 1024 + 1)
    await mkdir(join(root, 'folder'))
    const repository = new NodeWorkspaceDocumentRepository()

    await expect(repository.describe(root, 'binary.bin')).resolves.toMatchObject({ kind: 'binary' })
    await expect(repository.describe(root, 'large.txt')).rejects.toMatchObject({ code: 'too-large' })
    await expect(repository.describe(root, 'large.png')).rejects.toMatchObject({ code: 'too-large' })
    await expect(repository.describe(root, 'folder')).rejects.toMatchObject({ code: 'not-file' })
    await expect(repository.openImage(root, 'binary.bin')).rejects.toMatchObject({ code: 'unsupported-image' })
  })

  it('transcodes TIFF previews to PNG', async () => {
    const root = await workspace()
    await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#ff0000',
      },
    }).tiff().toFile(join(root, 'preview.tiff'))
    const repository = new NodeWorkspaceDocumentRepository()

    await expect(repository.describe(root, 'preview.tiff')).resolves.toMatchObject({
      kind: 'image',
      mediaType: 'image/tiff',
      previewMediaType: 'image/png',
    })
    const opened = await repository.openImage(root, 'preview.tiff')
    expect(opened.contentLength).toBeUndefined()
    expect(opened.mediaType).toBe('image/png')
    expect((await streamBytes(opened.stream)).subarray(0, 4))
      .toEqual(Buffer.from([0x89, 0x50, 0x4E, 0x47]))
  })

  it('streams byte ranges from supported video containers', async () => {
    const root = await workspace()
    const bytes = Buffer.from([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6F, 0x6D,
      0x00, 0x00, 0x00, 0x00,
      0x69, 0x73, 0x6F, 0x6D,
      0x6D, 0x70, 0x34, 0x32,
    ])
    await writeFile(join(root, 'demo.mp4'), bytes)
    const repository = new NodeWorkspaceDocumentRepository()

    await expect(repository.describe(root, 'demo.mp4')).resolves.toMatchObject({
      kind: 'video',
      mediaType: 'video/mp4',
      size: bytes.length,
    })
    const opened = await repository.openVideo(root, 'demo.mp4', { start: 4, end: 7 })
    expect(await streamBytes(opened.stream)).toEqual(Buffer.from('ftyp'))
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
