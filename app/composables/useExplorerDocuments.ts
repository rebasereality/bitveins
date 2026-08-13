import { computed, ref, type Ref } from 'vue'
import type {
  ExplorerDocument,
  ExplorerFileNode,
  ExplorerTextDocument,
} from '~/types/explorer'
import { isTextDocument } from '~/types/explorer'
import type { ExplorerDocumentMetadata } from '#shared/contracts/explorer'
import type { GitFileDiff } from '#shared/contracts/git'
import { apiErrorMessage } from '~/utils/api-error'

export function useExplorerDocuments(activeSession: Ref<string | null>) {
  const openFiles = ref<ExplorerDocument[]>([])
  const activeFilePath = ref<string | null>(null)
  const isMobileTreeOpen = ref(false)

  const activeOpenFile = computed(() => openFiles.value.find(f => f.path === activeFilePath.value) || null)

  function explorerMediaUrl(sessionName: string, path: string, media: 'image' | 'video'): string {
    const query = new URLSearchParams({ path })
    return `/api/sessions/${encodeURIComponent(sessionName)}/files/${media}?${query.toString()}`
  }

  async function openPath(
    path: string,
    name?: string,
    line?: number,
    column?: number,
    reportError = true,
    isCurrent: () => boolean = () => true,
  ): Promise<boolean> {
    if (!activeSession.value || !isCurrent()) return false

    const existing = openFiles.value.find(file => file.path === path)
    if (existing) {
      if (!isCurrent()) return false
      if (isTextDocument(existing)) {
        existing.line = line
        existing.column = column
        existing.navigationToken += 1
        if (line !== undefined || column !== undefined) {
          existing.previewEnabled = false
        }
      }
      activeFilePath.value = existing.path
      isMobileTreeOpen.value = false
      return true
    }

    try {
      const sessionName = activeSession.value
      const metadata = await $fetch<ExplorerDocumentMetadata>(
        `/api/sessions/${encodeURIComponent(sessionName)}/files/metadata`,
        { query: { path } },
      )
      if (!isCurrent() || activeSession.value !== sessionName) return false

      if (metadata.kind === 'image') {
        openFiles.value.push({
          kind: 'image',
          path: metadata.path,
          name: metadata.name,
          mediaType: metadata.mediaType,
          previewMediaType: metadata.previewMediaType,
          size: metadata.size,
          previewUrl: explorerMediaUrl(sessionName, metadata.path, 'image'),
          isDirty: false,
        })
      }
      else if (metadata.kind === 'video') {
        openFiles.value.push({
          kind: 'video',
          path: metadata.path,
          name: metadata.name,
          mediaType: metadata.mediaType,
          size: metadata.size,
          streamUrl: explorerMediaUrl(sessionName, metadata.path, 'video'),
          isDirty: false,
        })
      }
      else if (metadata.kind === 'binary') {
        openFiles.value.push({
          kind: 'binary',
          path: metadata.path,
          name: metadata.name,
          size: metadata.size,
          isDirty: false,
        })
      }
      else {
        const data = await $fetch<{ content: string }>(
          `/api/sessions/${encodeURIComponent(sessionName)}/files/content`,
          { query: { path: metadata.path } },
        )
        if (!isCurrent() || activeSession.value !== sessionName) return false
        openFiles.value.push({
          kind: 'text',
          path: metadata.path,
          name: metadata.name || name || metadata.path,
          content: data.content,
          originalContent: data.content,
          isDirty: false,
          navigationToken: 1,
          previewEnabled: metadata.previewKind !== undefined && line === undefined && column === undefined,
          previewKind: metadata.previewKind,
          size: metadata.size,
          line,
          column,
        })
      }
      activeFilePath.value = metadata.path
      isMobileTreeOpen.value = false
      return true
    }
    catch (err: unknown) {
      if (!isCurrent()) return false
      if (reportError) alert(`Error opening file: ${apiErrorMessage(err, 'File read error')}`)
      return false
    }
  }

  async function openFile(fileNode: ExplorerFileNode): Promise<void> {
    if (fileNode.isDir || !activeSession.value) return
    await openPath(fileNode.path, fileNode.name)
  }

  function openGitDiff(diff: GitFileDiff): void {
    const documentPath = `git-diff://${diff.commit}/${encodeURIComponent(diff.path)}`
    const existing = openFiles.value.find(file => file.path === documentPath)
    if (existing) {
      activeFilePath.value = existing.path
      return
    }
    openFiles.value.push({
      kind: 'git-diff',
      path: documentPath,
      name: `${diff.path.split('/').at(-1) || diff.path} · ${diff.commit.slice(0, 8)}`,
      commit: diff.commit,
      filePath: diff.path,
      previousPath: diff.previousPath,
      status: diff.status,
      binary: diff.binary,
      before: diff.before,
      after: diff.after,
      isDirty: false,
    })
    activeFilePath.value = documentPath
    isMobileTreeOpen.value = false
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

  function toggleActiveFilePreview(): void {
    const file = activeOpenFile.value
    if (!file || !isTextDocument(file) || !file.previewKind) return
    file.previewEnabled = !file.previewEnabled
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
    openGitDiff,
    closeFile,
    closeOtherFiles,
    closeAllFiles,
    handleFileContentChange,
    toggleActiveFilePreview,
    saveActiveFile,
    saveFileDirectly,
  }
}
