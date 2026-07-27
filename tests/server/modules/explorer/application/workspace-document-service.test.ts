import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceDocumentService } from '../../../../../server/modules/explorer/application/workspace-document-service'
import type { WorkspaceDocumentRepository } from '../../../../../server/modules/explorer/ports/workspace-document-repository'

function createRepository(): WorkspaceDocumentRepository {
  return {
    describe: vi.fn().mockResolvedValue({
      kind: 'text',
      path: 'src/file.ts',
      name: 'file.ts',
      size: 12,
    }),
    openImage: vi.fn().mockResolvedValue({
      contentLength: 8,
      mediaType: 'image/png',
      name: 'preview.png',
      size: 8,
      stream: Readable.from([]),
    }),
    openVideo: vi.fn().mockResolvedValue({
      metadata: {
        kind: 'video',
        path: 'demo.mp4',
        name: 'demo.mp4',
        size: 24,
        mediaType: 'video/mp4',
      },
      stream: Readable.from([]),
    }),
    readText: vi.fn().mockResolvedValue('content'),
  }
}

describe('WorkspaceDocumentService', () => {
  it('delegates document operations to its repository port', async () => {
    const repository = createRepository()
    const service = new WorkspaceDocumentService(repository)

    await expect(service.describe('/workspace', 'src/file.ts')).resolves.toMatchObject({ kind: 'text' })
    await expect(service.openImage('/workspace', 'preview.png')).resolves.toMatchObject({
      mediaType: 'image/png',
    })
    await expect(service.openVideo('/workspace', 'demo.mp4', { start: 0, end: 7 }))
      .resolves.toMatchObject({ metadata: { kind: 'video' } })
    await expect(service.readText('/workspace', 'src/file.ts')).resolves.toBe('content')
    expect(repository.describe).toHaveBeenCalledWith('/workspace', 'src/file.ts')
  })
})
