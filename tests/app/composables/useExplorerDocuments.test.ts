// @vitest-environment happy-dom

import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExplorerDocuments } from '../../../app/composables/useExplorerDocuments'

const fetchStub = vi.fn()

describe('useExplorerDocuments', () => {
  beforeEach(() => {
    fetchStub.mockReset()
    vi.stubGlobal('$fetch', fetchStub)
    vi.stubGlobal('alert', vi.fn())
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('opens text and image documents through metadata classification', async () => {
    fetchStub
      .mockResolvedValueOnce({
        kind: 'text',
        path: 'src/file.ts',
        name: 'file.ts',
        size: 7,
      })
      .mockResolvedValueOnce({ content: 'content' })
      .mockResolvedValueOnce({
        kind: 'image',
        path: 'design/preview.png',
        name: 'preview.png',
        mediaType: 'image/png',
        size: 10,
      })
    const explorer = useExplorerDocuments(ref('demo'))

    await explorer.openPath('src/file.ts', undefined, 4, 2)
    await explorer.openFile({ name: 'preview.png', path: 'design/preview.png', isDir: false })

    expect(explorer.openFiles.value).toMatchObject([
      { kind: 'text', path: 'src/file.ts', line: 4, column: 2 },
      {
        kind: 'image',
        path: 'design/preview.png',
        previewUrl: '/api/sessions/demo/files/image?path=design%2Fpreview.png',
      },
    ])
    expect(explorer.activeFilePath.value).toBe('design/preview.png')
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
})
