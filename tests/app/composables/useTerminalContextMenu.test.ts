// @vitest-environment happy-dom

import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useTerminalContextMenu } from '../../../app/composables/useTerminalContextMenu'

function createContextMenu() {
  const download = vi.fn()
  const menu = useTerminalContextMenu(
    ref([{ name: 'demo', path: '/workspace/demo' }]),
    ref('demo'),
    vi.fn(),
    download,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
  )
  return { download, menu }
}

describe('useTerminalContextMenu downloads', () => {
  it('downloads a file or folder selected in the Explorer tree', () => {
    const { download, menu } = createContextMenu()
    menu.handleItemContextMenu({
      event: new MouseEvent('contextmenu', { clientX: 10, clientY: 20 }),
      node: { name: 'artifacts', path: 'build/artifacts', isDir: true },
    })

    menu.contextMenu.items.find(item => item.label === 'Download')?.click()

    expect(download).toHaveBeenCalledWith('/workspace/demo/build/artifacts')
  })

  it('downloads the document selected from an Explorer tab', () => {
    const { download, menu } = createContextMenu()
    menu.handleTabContextMenu({
      event: new MouseEvent('contextmenu'),
      file: {
        kind: 'text',
        path: 'notes.txt',
        name: 'notes.txt',
        content: '',
        originalContent: '',
        isDirty: false,
        navigationToken: 1,
      },
    })

    menu.contextMenu.items.find(item => item.label === 'Download')?.click()

    expect(download).toHaveBeenCalledWith('/workspace/demo/notes.txt')
  })
})
