<script setup lang="ts">
import type { HistoryMessage, InputMode } from '~/types/session'
import type {
  ResolvedExplorerDocument,
  TerminalFileResolution,
} from '#shared/contracts/explorer'
import { saveSubmittedAsyncPrompt } from '~/utils/async-prompt-recovery'
import { asyncTerminalSubmissionChunks } from '~/utils/async-terminal-submission'
import { isUnauthorizedError } from '~/utils/api-error'
import { parseStoredExplorerViewMode, type ExplorerViewMode } from '~/utils/explorer-view-mode'
import { useTmuxWindows } from '~/composables/useTmuxWindows'
import { useFileTreeModal } from '~/composables/useFileTreeModal'
import { useExplorerDocuments } from '~/composables/useExplorerDocuments'
import { useExplorerDownloads } from '~/composables/useExplorerDownloads'
import { useTerminalContextMenu } from '~/composables/useTerminalContextMenu'
import { useAppTransfers } from '~/composables/useAppTransfers'
import AsyncTerminalHeader from '~/components/AsyncTerminalHeader.vue'
import AsyncTerminalExplorer from '~/components/AsyncTerminalExplorer.vue'
import CommandInput from '~/components/CommandInput.vue'
import SessionWelcome from '~/components/SessionWelcome.vue'
import TerminalView from '~/components/TerminalView.vue'

import { useBitveinsAppSessions } from '~/composables/useBitveinsAppSessions'

defineProps<{
  linuxUsername: string | null
}>()

const emit = defineEmits<{ authExpired: [], logout: [] }>()

const activeSession = ref<string | null>(null)
const inputMode = ref<InputMode>('async')
const viewMode = ref<ExplorerViewMode>('terminal')
const terminal = ref<InstanceType<typeof TerminalView> | null>(null)
const sessionSidebar = ref<{ openCreateSession: () => void } | null>(null)
const terminalConnected = ref(false)
const input = ref<InstanceType<typeof CommandInput> | null>(null)
const historyMessages = ref<HistoryMessage[]>([])
const expandedPathsBySession = ref<Record<string, string[]>>({})
const explorerRef = ref<{ reloadFileTree: () => void } | null>(null)
type AmbiguousResolution = Extract<TerminalFileResolution, { status: 'ambiguous' }>
const pendingFileResolution = ref<AmbiguousResolution | null>(null)
const settingsOpen = ref(false)

function resetHistory(): void {
  historyMessages.value = []
}

const historyMessageTexts = computed(() => historyMessages.value.map(message => message.message))
const browserTitle = computed(() => activeSession.value ? `${activeSession.value} - Bitveins` : 'Bitveins')

useHead(() => ({
  title: browserTitle.value,
}))

function isAuthError(fetchError: unknown): boolean {
  return isUnauthorizedError(fetchError)
}

function handleAuthError(fetchError: unknown): void {
  if (isAuthError(fetchError)) {
    terminal.value?.detach()
    activeSession.value = null
    resetHistory()
    stopWindowRefresh()
    emit('authExpired')
  }
}

const {
  windows,
  editingWindowIndex,
  editingWindowName,
  windowTabItems,
  activeWindowValue,
  activeWindow,
  stopWindowRefresh,
  startWindowRefresh,
  handleWindowSelect,
  handleCreateWindow,
  startWindowRename,
  cancelWindowRename,
  saveWindowRename,
} = useTmuxWindows(activeSession, handleAuthError)

const activeHistoryScopeKey = computed(() => (activeSession.value && activeWindow.value ? `${activeSession.value}:${activeWindow.value.id}:${activeWindow.value.index}` : null))

const { deleteFileOrFolder } = useFileTreeModal(activeSession)

const {
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
} = useExplorerDocuments(activeSession)

const {
  changeRoot: changePathLinkRoot,
  currentRoot: pathLinkRoot,
  forgetAllRoots: forgetAllPathLinkRoots,
  forgetCurrentRoot: forgetPathLinkRoot,
  hasAnyRoots: hasPathLinkRoots,
  rememberRoot,
  rootChoices,
  selectRoot: selectPathLinkRoot,
} = usePathLinkRoots(activeSession, activeWindow)

const terminalInteractionEnabled = computed(() => (
  viewMode.value === 'terminal'
  && !settingsOpen.value
  && !pendingFileResolution.value
  && !rootChoices.value
))
const liveTerminalShortcutsEnabled = computed(() => (
  terminalInteractionEnabled.value
  && inputMode.value === 'live'
  && Boolean(activeSession.value)
))

useTerminalBrowserShortcuts({
  enabled: liveTerminalShortcutsEnabled,
  sendInput: data => terminal.value?.sendInput(data),
})

async function openResolvedDocument(
  document: ResolvedExplorerDocument,
  reference: { line?: number, column?: number },
): Promise<void> {
  await openPath(document.path, document.name, reference.line, reference.column)
  viewMode.value = 'explorer'
}

function handleFileLinkActivate(
  resolution: Exclude<TerminalFileResolution, { status: 'missing' }>,
): void {
  if (resolution.status === 'ambiguous') {
    pendingFileResolution.value = resolution
    return
  }
  void openResolvedDocument(resolution.document, resolution.reference)
}

function selectAmbiguousFile(payload: {
  document: ResolvedExplorerDocument
  remember: boolean
}): void {
  const resolution = pendingFileResolution.value
  if (!resolution) return

  if (payload.remember) rememberRoot(payload.document.root)
  pendingFileResolution.value = null
  void openResolvedDocument(payload.document, resolution.reference)
}

function isMobileViewport(): boolean {
  return import.meta.client && window.matchMedia('(max-width: 1023px)').matches
}

function focusInputTarget(): void {
  nextTick(() => {
    if (inputMode.value === 'live') {
      if (!isMobileViewport()) {
        terminal.value?.focus()
      }
      return
    }
    input.value?.focus()
  })
}

function openCreateSession(): void {
  sessionSidebar.value?.openCreateSession()
}

const {
  sessions,
  loading,
  error,
  refreshSessions,
  attachSession,
  createSession,
  openTransfer,
  renameSession,
  destroySession,
  detachSession,
} = useBitveinsAppSessions({
  activeFilePath,
  activeSession,
  focusInputTarget,
  handleAuthError,
  openFiles,
  resetHistory,
  startWindowRefresh,
  stopWindowRefresh,
  terminal,
})

const { downloadExplorerItem, downloadPath } = useExplorerDownloads(
  sessions,
  activeSession,
)

const {
  contextMenu,
  handleItemContextMenu,
  handleTabContextMenu,
} = useTerminalContextMenu(
  sessions,
  activeSession,
  (node, cb) => deleteFileOrFolder(node, cb),
  path => void downloadPath(path),
  node => void openFile(node),
  path => closeFile(path),
  path => closeOtherFiles(path),
  () => closeAllFiles(),
  file => void saveFileDirectly(file),
)

const {
  currentPromptDropAvailable,
  currentPromptDropLabel,
  dropzones,
  handleCurrentPromptFileDrop,
  handleTransferFileDrop,
  openDropzone,
} = useAppTransfers({
  activeSession,
  activeWindow,
  explorer: explorerRef,
  focusInputTarget,
  input,
  openTransfer,
  viewMode,
})

async function loadActiveWindowHistory(): Promise<void> {
  const scopeKey = activeHistoryScopeKey.value
  if (!activeSession.value || !activeWindow.value || !scopeKey) return

  try {
    const data = await $fetch<{ history?: HistoryMessage[], messages?: HistoryMessage[] }>(`/api/sessions/${encodeURIComponent(activeSession.value)}/history`, {
      query: { windowId: activeWindow.value.id, windowIndex: activeWindow.value.index },
    })
    historyMessages.value = data.messages || data.history || []
  }
  catch (err) {
    handleAuthError(err)
  }
}

async function selectTmuxWindow(value: string | number): Promise<void> {
  const windowIndex = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(windowIndex) || !terminal.value) return
  await handleWindowSelect(windowIndex, (name, idx) => terminal.value!.attachWindow(name, idx))
}

async function createTmuxWindow(): Promise<void> {
  if (!terminal.value) return
  await handleCreateWindow((name, idx) => terminal.value!.attachWindow(name, idx))
}

function startTmuxWindowRename(windowIndex: number): void {
  const win = windows.value.find(w => w.index === windowIndex)
  if (win) startWindowRename(win)
}

function commitTmuxWindowRename(): void {
  if (editingWindowIndex.value !== null) {
    void saveWindowRename(editingWindowIndex.value)
  }
}

function cancelTmuxWindowRename(): void {
  cancelWindowRename()
}

async function closeTmuxWindow(windowIndex: number): Promise<void> {
  if (!activeSession.value || windows.value.length <= 1) return
  try {
    const data = await $fetch<{ activeWindowIndex: number }>(`/api/sessions/${encodeURIComponent(activeSession.value)}/windows/${windowIndex}`, {
      method: 'DELETE',
    })
    if (terminal.value) {
      await terminal.value.attachWindow(activeSession.value, data.activeWindowIndex)
    }
  }
  catch (err) {
    handleAuthError(err)
  }
}

async function handleCommandSubmit(payload: { command: string, terminator: '\r' | '\t' }): Promise<void> {
  if (!activeSession.value || !activeWindow.value) return

  if (activeHistoryScopeKey.value) {
    saveSubmittedAsyncPrompt(localStorage, activeHistoryScopeKey.value, payload.command)
  }

  terminal.value?.sendReliableInputs(
    asyncTerminalSubmissionChunks(payload.command, payload.terminator),
  )
  focusInputTarget()

  $fetch(`/api/sessions/${encodeURIComponent(activeSession.value)}/history`, {
    method: 'POST',
    body: {
      message: payload.command,
      windowId: activeWindow.value.id,
      windowIndex: activeWindow.value.index,
    },
  }).then(() => {
    void loadActiveWindowHistory()
  }).catch((err) => {
    handleAuthError(err)
  })
}

function handleControlInput(data: string): void {
  terminal.value?.sendInput(data)
}

function setInputMode(mode: InputMode): void {
  inputMode.value = mode
  focusInputTarget()
}

function onTerminalReady(): void {
  focusInputTarget()
}

function updateExpandedPaths(sessionName: string, paths: string[]): void {
  expandedPathsBySession.value[sessionName] = paths
  window.localStorage.setItem('bitveins.expandedPaths', JSON.stringify(expandedPathsBySession.value))
}

function handleFileDeleted(deletedPath: string): void {
  closeFile(deletedPath)
}

onMounted(() => {
  const savedInputMode = window.localStorage.getItem('bitveins.inputMode')
  if (savedInputMode === 'async' || savedInputMode === 'live') {
    inputMode.value = savedInputMode
  }

  viewMode.value = parseStoredExplorerViewMode(window.localStorage.getItem('bitveins.viewMode'))

  const savedExpandedPaths = window.localStorage.getItem('bitveins.expandedPaths')
  if (savedExpandedPaths) {
    try {
      expandedPathsBySession.value = JSON.parse(savedExpandedPaths)
    }
    catch (e) {
      console.error('Failed to parse expanded paths:', e)
    }
  }

  void refreshSessions()
})

onBeforeUnmount(() => {
  stopWindowRefresh()
})

watch(inputMode, (mode) => {
  window.localStorage.setItem('bitveins.inputMode', mode)
})

watch(viewMode, (mode) => {
  window.localStorage.setItem('bitveins.viewMode', mode)
})

watch(activeHistoryScopeKey, () => {
  void loadActiveWindowHistory()
})

watch(activeSession, () => {
  pendingFileResolution.value = null
})
</script>

<template>
  <main
    class="h-screen w-screen overflow-hidden bg-[var(--bitveins-shell-bg)] text-[var(--bitveins-shell-text)] max-lg:h-dvh"
    data-bitveins-app
  >
    <div class="grid h-full w-full grid-cols-[var(--bitveins-sidebar-width)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-lg:grid-cols-1 max-lg:grid-rows-[calc(40px+env(safe-area-inset-top))_minmax(0,1fr)]">
      <SessionSidebar
        ref="sessionSidebar"
        :active-session="activeSession"
        :error="error"
        :linux-username="linuxUsername"
        :loading="loading"
        :sessions="sessions"
        class="row-span-2 max-lg:row-span-1"
        @attach="attachSession"
        @create="createSession"
        @destroy="destroySession"
        @detach="detachSession"
        @logout="emit('logout')"
        @open-dropzone="openDropzone"
        @refresh="refreshSessions"
        @rename="renameSession"
        @settings="settingsOpen = true"
      />

      <section
        class="flex min-h-0 flex-col overflow-hidden bg-[var(--bitveins-terminal-bg)]"
        :class="{ 'pb-[var(--bitveins-command-baseline,96px)] max-lg:pb-[calc(72px+env(safe-area-inset-bottom))]': activeSession && viewMode === 'terminal' && !settingsOpen }"
      >
        <AsyncTerminalHeader
          v-show="!settingsOpen"
          v-if="activeSession"
          v-model:editing-window-name="editingWindowName"
          v-model:view-mode="viewMode"
          :active-open-file="activeOpenFile"
          :active-file-path="activeFilePath"
          :active-window-value="activeWindowValue"
          :editing-window-index="editingWindowIndex"
          :open-files="openFiles"
          :window-tab-items="windowTabItems"
          :windows="windows"
          :path-link-root="pathLinkRoot"
          :has-path-link-roots="hasPathLinkRoots"
          @change-path-link-root="changePathLinkRoot"
          @cancel-tmux-window-rename="cancelTmuxWindowRename"
          @close-file="closeFile"
          @close-tmux-window="closeTmuxWindow"
          @commit-tmux-window-rename="commitTmuxWindowRename"
          @create-tmux-window="createTmuxWindow"
          @download-active-file="activeOpenFile && downloadExplorerItem(activeOpenFile.path)"
          @forget-all-path-link-roots="forgetAllPathLinkRoots"
          @forget-path-link-root="forgetPathLinkRoot"
          @open-mobile-tree="isMobileTreeOpen = true"
          @save-active-file="saveActiveFile"
          @select-file="activeFilePath = $event"
          @select-tmux-window="selectTmuxWindow"
          @start-tmux-window-rename="startTmuxWindowRename"
          @tab-context-menu="handleTabContextMenu($event)"
        />

        <div
          v-show="!settingsOpen"
          class="relative min-h-0 flex-1 overflow-hidden"
        >
          <TerminalView
            v-show="Boolean(activeSession) && viewMode === 'terminal'"
            ref="terminal"
            :active="terminalInteractionEnabled"
            :active-session="activeSession"
            :active-window="activeWindow"
            :input-mode="inputMode"
            :remembered-root="pathLinkRoot || undefined"
            :windows="windows"
            class="h-full min-h-0"
            :style="{ transform: 'translateY(calc(-1 * var(--bitveins-command-offset, 0px)))' }"
            @auth-expired="emit('authExpired')"
            @connection-change="terminalConnected = $event"
            @file-link-activate="handleFileLinkActivate"
            @ready="onTerminalReady"
          />

          <AsyncTerminalExplorer
            v-show="Boolean(activeSession) && viewMode === 'explorer'"
            ref="explorerRef"
            v-model:is-mobile-tree-open="isMobileTreeOpen"
            :active-open-file="activeOpenFile"
            :active-session="activeSession"
            :expanded-paths="activeSession ? expandedPathsBySession[activeSession] || [] : []"
            @file-content-change="handleFileContentChange($event.file, $event.content)"
            @file-dbl-click="openFile"
            @file-deleted="handleFileDeleted"
            @item-context-menu="handleItemContextMenu($event, () => explorerRef?.reloadFileTree())"
            @save-active-file="saveActiveFile"
            @update-expanded-paths="activeSession && updateExpandedPaths(activeSession, $event)"
          />

          <SessionWelcome
            v-if="!activeSession"
            :loading="loading"
            :sessions="sessions"
            @attach="attachSession"
            @create="openCreateSession"
          />
        </div>

        <AppearanceSettingsView
          v-if="settingsOpen"
          :username="linuxUsername"
          @close="settingsOpen = false; focusInputTarget()"
        />
      </section>

      <CommandInput
        v-if="viewMode === 'terminal'"
        v-show="!settingsOpen && Boolean(activeSession)"
        ref="input"
        :disabled="!activeSession || settingsOpen"
        :history-messages="historyMessageTexts"
        :input-mode="inputMode"
        :live-available="terminalConnected"
        :prompt-recovery-key="activeHistoryScopeKey"
        :session-name="activeSession"
        :window-name="activeWindow?.name"
        @control="handleControlInput"
        @mode-change="setInputMode"
        @submit="handleCommandSubmit"
      />
    </div>

    <FileUploadOverlay />

    <GlobalTransferDropOverlay
      :current-prompt-available="!settingsOpen && currentPromptDropAvailable"
      :current-prompt-label="currentPromptDropLabel"
      :dropzones="dropzones"
      @drop-current-prompt="handleCurrentPromptFileDrop"
      @drop-transfer="handleTransferFileDrop"
    />

    <ContextMenu
      v-model:show="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenu.items"
    />

    <TerminalFileRootChooser
      :resolution="pendingFileResolution"
      @close="pendingFileResolution = null"
      @select="selectAmbiguousFile"
    />

    <PathLinkRootDialog
      :roots="rootChoices"
      @close="rootChoices = null"
      @select="selectPathLinkRoot"
    />
  </main>
</template>
