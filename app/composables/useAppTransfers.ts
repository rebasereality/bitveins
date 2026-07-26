import { computed, nextTick, type Ref } from 'vue'
import type { TmuxWindow } from '~/types/session'
import type { ExplorerViewMode } from '~/utils/explorer-view-mode'
import { useSessionDropzones, type Dropzone } from '~/composables/useSessionDropzones'

interface CurrentPromptController {
  uploadFilesToCurrentPrompt(files: File[]): Promise<void>
}

interface ExplorerController {
  reloadFileTree(): void
}

interface AppTransferOptions {
  activeSession: Readonly<Ref<string | null>>
  activeWindow: Readonly<Ref<TmuxWindow | null>>
  explorer: Readonly<Ref<ExplorerController | null>>
  focusInputTarget: () => void
  input: Readonly<Ref<CurrentPromptController | null>>
  openTransfer: (dropzone: Dropzone) => Promise<boolean>
  viewMode: Ref<ExplorerViewMode>
}

export function useAppTransfers(options: AppTransferOptions) {
  const {
    dropzones,
    uploadFiles: uploadFilesToTransfer,
  } = useSessionDropzones()

  const currentPromptDropAvailable = computed(() => (
    options.viewMode.value === 'terminal'
    && Boolean(options.activeSession.value)
    && Boolean(options.activeWindow.value)
  ))
  const currentPromptDropLabel = computed(() => (
    options.activeSession.value && options.activeWindow.value
      ? `${options.activeSession.value} / ${options.activeWindow.value.name}`
      : null
  ))

  async function openDropzone(dropzone: Dropzone): Promise<void> {
    if (!await options.openTransfer(dropzone)) return
    options.viewMode.value = 'explorer'
    await nextTick()
    options.explorer.value?.reloadFileTree()
  }

  function handleTransferFileDrop(payload: {
    dropzone: Dropzone
    files: File[]
  }): void {
    void uploadFilesToTransfer(payload.files, payload.dropzone)
  }

  async function handleCurrentPromptFileDrop(files: File[]): Promise<void> {
    await options.input.value?.uploadFilesToCurrentPrompt(files)
    options.focusInputTarget()
  }

  return {
    currentPromptDropAvailable,
    currentPromptDropLabel,
    dropzones,
    handleCurrentPromptFileDrop,
    handleTransferFileDrop,
    openDropzone,
  }
}
