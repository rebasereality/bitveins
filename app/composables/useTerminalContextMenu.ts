import { reactive, type Ref } from 'vue'
import type { ExplorerDocument, ExplorerFileNode } from '~/types/explorer'
import { isTextDocument } from '~/types/explorer'

export function useTerminalContextMenu(
  sessions: Ref<Array<{ name: string, path: string }>>,
  activeSession: Ref<string | null>,
  deleteFileOrFolderFn: (node: ExplorerFileNode, cb?: () => void) => void,
  downloadPathFn: (path: string) => void,
  openFileFn: (node: ExplorerFileNode) => void,
  closeFileFn: (path: string) => void,
  closeOtherFilesFn: (path: string) => void,
  closeAllFilesFn: () => void,
  saveFileDirectlyFn: (file: ExplorerDocument) => void,
) {
  const contextMenu = reactive({
    show: false,
    x: 0,
    y: 0,
    items: [] as Array<{ label: string, icon?: string, click: () => void }>,
  })

  function copyToClipboard(text: string): void {
    try {
      navigator.clipboard.writeText(text)
    }
    catch (err) {
      console.error('Failed to copy to clipboard', err)
    }
  }

  function triggerContextMenu(event: MouseEvent, items: Array<{ label: string, icon?: string, click: () => void }>): void {
    contextMenu.x = event.clientX
    contextMenu.y = event.clientY
    contextMenu.items = items
    contextMenu.show = true
  }

  function handleItemContextMenu(payload: { event: MouseEvent, node: ExplorerFileNode }, reloadFileTreeFn?: () => void): void {
    const { event, node } = payload
    const session = sessions.value.find(s => s.name === activeSession.value)
    const sessionPath = session?.path || ''
    const relativePath = node.path
    const absolutePath = sessionPath ? (sessionPath.endsWith('/') ? `${sessionPath}${relativePath}` : `${sessionPath}/${relativePath}`) : relativePath

    const items = [
      { label: 'Download', icon: 'i-lucide-download', click: () => downloadPathFn(absolutePath) },
      { label: 'Copy relative path', icon: 'i-lucide-copy', click: () => copyToClipboard(relativePath) },
      { label: 'Copy absolute path', icon: 'i-lucide-file-text', click: () => copyToClipboard(absolutePath) },
      { label: 'Delete', icon: 'i-lucide-trash-2', click: () => deleteFileOrFolderFn(node, reloadFileTreeFn) },
    ]

    if (!node.isDir) {
      items.unshift({ label: 'Open file', icon: 'i-lucide-external-link', click: () => openFileFn(node) })
    }

    triggerContextMenu(event, items)
  }

  function handleTabContextMenu(payload: { event: MouseEvent, file: ExplorerDocument }): void {
    const { event, file } = payload
    const session = sessions.value.find(s => s.name === activeSession.value)
    const sessionPath = session?.path || ''
    const relativePath = file.path
    const absolutePath = sessionPath ? (sessionPath.endsWith('/') ? `${sessionPath}${relativePath}` : `${sessionPath}/${relativePath}`) : relativePath

    const items = [
      { label: 'Download', icon: 'i-lucide-download', click: () => downloadPathFn(absolutePath) },
      { label: 'Copy relative path', icon: 'i-lucide-copy', click: () => copyToClipboard(relativePath) },
      { label: 'Copy absolute path', icon: 'i-lucide-file-text', click: () => copyToClipboard(absolutePath) },
      { label: 'Close file', icon: 'i-lucide-x', click: () => closeFileFn(file.path) },
      { label: 'Close others', icon: 'i-lucide-copy-minus', click: () => closeOtherFilesFn(file.path) },
      { label: 'Close all', icon: 'i-lucide-minus-circle', click: () => closeAllFilesFn() },
    ]

    if (file.isDirty && isTextDocument(file)) {
      items.unshift({ label: 'Save', icon: 'i-lucide-save', click: () => saveFileDirectlyFn(file) })
    }

    triggerContextMenu(event, items)
  }

  return {
    contextMenu,
    handleItemContextMenu,
    handleTabContextMenu,
  }
}
