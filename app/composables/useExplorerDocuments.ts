import { computed, ref, type Ref } from 'vue'
import type {
  ExplorerDocument,
  ExplorerFileNode,
  ExplorerTextDocument,
} from '~/types/explorer'
import { isTextDocument } from '~/types/explorer'
import type { ExplorerDocumentMetadata } from '#shared/contracts/explorer'
import { apiErrorMessage } from '~/utils/api-error'

export function useExplorerDocuments(activeSession: Ref<string | null>) {
  const openFiles = ref<ExplorerDocument[]>([])
  const activeFilePath = ref<string | null>(null)
  const isMobileTreeOpen = ref(false)

  const activeOpenFile = computed(() => openFiles.value.find(f => f.path === activeFilePath.value) || null)

  function imagePreviewUrl(sessionName: string, path: string): string {
    const query = new URLSearchParams({ path })
    return `/api/sessions/${encodeURIComponent(sessionName)}/files/image?${query.toString()}`
  }

  async function openPath(path: string, name?: string, line?: number, column?: number): Promise<void> {
    if (!activeSession.value) return

    const existing = openFiles.value.find(file => file.path === path)
    if (existing) {
      if (isTextDocument(existing)) {
        existing.line = line
        existing.column = column
        existing.navigationToken += 1
      }
      activeFilePath.value = existing.path
      isMobileTreeOpen.value = false
      return
    }

    try {
      const sessionName = activeSession.value
      const metadata = await $fetch<ExplorerDocumentMetadata>(
        `/api/sessions/${encodeURIComponent(sessionName)}/files/metadata`,
        { query: { path } },
      )

      if (metadata.kind === 'image') {
        openFiles.value.push({
          kind: 'image',
          path: metadata.path,
          name: metadata.name,
          mediaType: metadata.mediaType,
          size: metadata.size,
          previewUrl: imagePreviewUrl(sessionName, metadata.path),
          isDirty: false,
        })
      }
      else {
        const data = await $fetch<{ content: string }>(
          `/api/sessions/${encodeURIComponent(sessionName)}/files/content`,
          { query: { path: metadata.path } },
        )
        openFiles.value.push({
          kind: 'text',
          path: metadata.path,
          name: metadata.name || name || metadata.path,
          content: data.content,
          originalContent: data.content,
          isDirty: false,
          navigationToken: 1,
          line,
          column,
        })
      }
      activeFilePath.value = metadata.path
      isMobileTreeOpen.value = false
    }
    catch (err: unknown) {
      alert(`Error opening file: ${apiErrorMessage(err, 'File read error')}`)
    }
  }

  async function openFile(fileNode: ExplorerFileNode): Promise<void> {
    if (fileNode.isDir || !activeSession.value) return
    await openPath(fileNode.path, fileNode.name)
  }

  function closeFile(filePath: string): void {
    const idx = openFiles.value.findIndex(f => f.path === filePath)
    if (idx === -1) return

    const file = openFiles.value[idx]!
    if (file.isDirty && !confirm(`Discard unsaved changes for ${file.name}?`)) {
      return
    }

    openFiles.value.splice(idx, 1)
    if (activeFilePath.value === filePath) {
      const nextFile = openFiles.value[Math.max(0, idx - 1)]
      activeFilePath.value = nextFile ? nextFile.path : null
    }
  }

  function closeOtherFiles(keepPath: string): void {
    const filesToClose = openFiles.value.filter(f => f.path !== keepPath)
    for (const file of filesToClose) closeFile(file.path)
  }

  function closeAllFiles(): void {
    const filesToClose = [...openFiles.value]
    for (const file of filesToClose) closeFile(file.path)
  }

  function handleFileContentChange(file: ExplorerTextDocument, newContent: string): void {
    file.content = newContent
    file.isDirty = file.content !== file.originalContent
  }

  async function saveActiveFile(): Promise<void> {
    if (!activeOpenFile.value || !activeSession.value) return
    const file = activeOpenFile.value
    if (!isTextDocument(file)) return

    try {
      await $fetch(`/api/sessions/${encodeURIComponent(activeSession.value)}/files/content`, {
        method: 'PUT',
        body: { path: file.path, content: file.content },
      })
      file.originalContent = file.content
      file.isDirty = false
    }
    catch (err: unknown) {
      alert(`Error saving file: ${apiErrorMessage(err, 'Error saving file')}`)
    }
  }

  async function saveFileDirectly(file: ExplorerDocument): Promise<void> {
    if (!activeSession.value || !isTextDocument(file)) return
    try {
      await $fetch(`/api/sessions/${encodeURIComponent(activeSession.value)}/files/content`, {
        method: 'PUT',
        body: { path: file.path, content: file.content },
      })
      file.originalContent = file.content
      file.isDirty = false
    }
    catch (err: unknown) {
      alert(`Error saving file: ${apiErrorMessage(err, 'Error saving file')}`)
    }
  }

  return {
    openFiles,
    activeFilePath,
    activeOpenFile,
    isMobileTreeOpen,
    openPath,
    openFile,
    closeFile,
    closeOtherFiles,
    closeAllFiles,
    handleFileContentChange,
    saveActiveFile,
    saveFileDirectly,
  }
}
