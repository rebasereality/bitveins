export interface FileTreeNode {
  name: string
  path: string
  isDir: boolean
  size?: number
}

export function useFileTreeModal(activeSession: Ref<string | null>) {
  async function deleteFileOrFolder(node: FileTreeNode, refreshCallback?: () => void): Promise<void> {
    if (!activeSession.value) return
    const confirmed = confirm(`Are you sure you want to delete "${node.name}"?`)
    if (!confirmed) return

    try {
      await $fetch(`/api/sessions/${encodeURIComponent(activeSession.value)}/files/delete`, {
        method: 'POST',
        body: { path: node.path },
      })
      refreshCallback?.()
    }
    catch (err: unknown) {
      console.error('Failed to delete file/folder:', err)
    }
  }

  return {
    deleteFileOrFolder,
  }
}
