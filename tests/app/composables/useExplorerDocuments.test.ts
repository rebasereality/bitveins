// @vitest-environment happy-dom

import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExplorerDocuments } from '../../../app/composables/useExplorerDocuments'

const fetchStub = vi.fn()

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useExplorerDocuments', () => {
  beforeEach(() => {
    fetchStub.mockReset()
    vi.stubGlobal('$fetch', fetchStub)
    vi.stubGlobal('alert', vi.fn())
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('opens source previews and media documents through metadata classification', async () => {
    fetchStub
      .mockResolvedValueOnce({
        kind: 'text',
        path: 'README.md',
        name: 'README.md',
        size: 7,
        previewKind: 'markdown',
      })
      .mockResolvedValueOnce({ content: 'content' })
      .mockResolvedValueOnce({
        kind: 'image',
        path: 'design/preview.png',
        name: 'preview.png',
        mediaType: 'image/png',
        previewMediaType: 'image/png',
        size: 10,
      })
      .mockResolvedValueOnce({
        kind: 'video',
        path: 'demo.mp4',
        name: 'demo.mp4',
        mediaType: 'video/mp4',
        size: 100,
      })
      .mockResolvedValueOnce({
        kind: 'binary',
        path: 'archive.bin',
        name: 'archive.bin',
        size: 20,
      })
    const explorer = useExplorerDocuments(ref('demo'))

    await explorer.openPath('README.md')
    await explorer.openFile({ name: 'preview.png', path: 'design/preview.png', isDir: false })
    await explorer.openPath('demo.mp4')
    await explorer.openPath('archive.bin')

    expect(explorer.openFiles.value).toMatchObject([
      {
        kind: 'text',
        path: 'README.md',
        previewEnabled: true,
        previewKind: 'markdown',
      },
      {
        kind: 'image',
        path: 'design/preview.png',
        previewUrl: '/api/sessions/demo/files/image?path=design%2Fpreview.png',
      },
      {
        kind: 'video',
        path: 'demo.mp4',
        streamUrl: '/api/sessions/demo/files/video?path=demo.mp4',
      },
      { kind: 'binary', path: 'archive.bin' },
    ])
    expect(explorer.activeFilePath.value).toBe('archive.bin')
  })

  it('updates positions on an existing text tab and never fetches directories', async () => {
    fetchStub
      .mockResolvedValueOnce({ kind: 'text', path: 'file.ts', name: 'file.ts', size: 1 })
      .mockResolvedValueOnce({ content: 'x' })
    const explorer = useExplorerDocuments(ref('demo'))
    await explorer.openPath('file.ts')
    await explorer.openPath('file.ts', undefined, 9, 3)
    await explorer.openFile({ name: 'folder', path: 'folder', isDir: true })

    expect(explorer.activeOpenFile.value).toMatchObject({ line: 9, column: 3 })
    expect(fetchStub).toHaveBeenCalledTimes(2)
  })

  it('saves only dirty text documents and honors close confirmation', async () => {
    fetchStub
      .mockResolvedValueOnce({ kind: 'text', path: 'file.ts', name: 'file.ts', size: 1 })
      .mockResolvedValueOnce({ content: 'before' })
      .mockResolvedValueOnce(undefined)
    const explorer = useExplorerDocuments(ref('demo'))
    await explorer.openPath('file.ts')
    const file = explorer.activeOpenFile.value
    if (!file || file.kind !== 'text') throw new Error('Expected a text document.')

    explorer.handleFileContentChange(file, 'after')
    await explorer.saveActiveFile()
    expect(file.isDirty).toBe(false)
    expect(fetchStub).toHaveBeenLastCalledWith('/api/sessions/demo/files/content', {
      method: 'PUT',
      body: { path: 'file.ts', content: 'after' },
    })

    explorer.handleFileContentChange(file, 'dirty')
    vi.mocked(confirm).mockReturnValue(false)
    explorer.closeFile('file.ts')
    expect(explorer.openFiles.value).toHaveLength(1)
    vi.mocked(confirm).mockReturnValue(true)
    explorer.closeAllFiles()
    expect(explorer.openFiles.value).toHaveLength(0)
  })

  it('toggles Preview per source tab and opens line links in source mode', async () => {
    fetchStub
      .mockResolvedValueOnce({
        kind: 'text',
        path: 'README.md',
        name: 'README.md',
        previewKind: 'markdown',
        size: 10,
      })
      .mockResolvedValueOnce({ content: '# Readme' })
    const explorer = useExplorerDocuments(ref('demo'))

    await explorer.openPath('README.md')
    expect(explorer.activeOpenFile.value).toMatchObject({ previewEnabled: true })
    explorer.toggleActiveFilePreview()
    expect(explorer.activeOpenFile.value).toMatchObject({ previewEnabled: false })
    explorer.toggleActiveFilePreview()
    await explorer.openPath('README.md', undefined, 3, 1)
    expect(explorer.activeOpenFile.value).toMatchObject({
      line: 3,
      previewEnabled: false,
    })
  })

  it('does not mutate documents when a pending openPath becomes stale', async () => {
    const metadata = deferred<{
      kind: 'image'
      mediaType: 'image/png'
      name: string
      path: string
      size: number
    }>()
    fetchStub.mockReturnValueOnce(metadata.promise)
    const explorer = useExplorerDocuments(ref('demo'))
    let current = true

    const opening = explorer.openPath('preview.png', undefined, undefined, undefined, false, () => current)
    current = false
    metadata.resolve({
      kind: 'image',
      mediaType: 'image/png',
      name: 'preview.png',
      path: 'preview.png',
      size: 10,
    })

    await expect(opening).resolves.toBe(false)
    expect(explorer.openFiles.value).toEqual([])
    expect(explorer.activeFilePath.value).toBeNull()
  })
})
