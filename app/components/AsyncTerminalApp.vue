<script setup lang="ts">
import type { HistoryMessage, InputMode } from '~/types/session'
import type {
  ResolvedExplorerDocument,
  TerminalFileResolution,
} from '#shared/contracts/explorer'
import type { AttentionEvent } from '#shared/contracts/attention'
import { createAttentionDeepLink } from '#shared/contracts/attention'
import { saveSubmittedAsyncPrompt } from '~/utils/async-prompt-recovery'
import { asyncTerminalSubmissionChunks } from '~/utils/async-terminal-submission'
import { apiErrorMessage, isUnauthorizedError } from '~/utils/api-error'
import { parseStoredExplorerViewMode, type ExplorerViewMode } from '~/utils/explorer-view-mode'
import { useTmuxWindows } from '~/composables/useTmuxWindows'
import { useFileTreeModal } from '~/composables/useFileTreeModal'
import { useExplorerDocuments } from '~/composables/useExplorerDocuments'
import { useExplorerDownloads } from '~/composables/useExplorerDownloads'
import { useTerminalContextMenu } from '~/composables/useTerminalContextMenu'
import { useAppTransfers } from '~/composables/useAppTransfers'
import AsyncTerminalExplorer from '~/components/AsyncTerminalExplorer.vue'
import AsyncTerminalWorkspace from '~/components/AsyncTerminalWorkspace.vue'
import CommandInput from '~/components/CommandInput.vue'
import SessionWelcome from '~/components/SessionWelcome.vue'

import { useBitveinsAppSessions } from '~/composables/useBitveinsAppSessions'

defineProps<{
  linuxUsername: string | null
}>()

const emit = defineEmits<{ authExpired: [], logout: [] }>()

const activeSession = ref<string | null>(null)
const inputMode = ref<InputMode>('async')
const viewMode = ref<ExplorerViewMode>('terminal')
const terminal = ref<InstanceType<typeof AsyncTerminalWorkspace> | null>(null)
const sessionSidebar = ref<{ openCreateSession: () => void } | null>(null)
const terminalConnected = ref(false)
const activePaneId = ref<string | null>(null)
const input = ref<InstanceType<typeof CommandInput> | null>(null)
const historyMessages = ref<HistoryMessage[]>([])
const expandedPathsBySession = ref<Record<string, string[]>>({})
const explorerRef = ref<{ reloadFileTree: () => void } | null>(null)
type AmbiguousResolution = Extract<TerminalFileResolution, { status: 'ambiguous' }>
const pendingFileResolution = ref<AmbiguousResolution | null>(null)
const settingsOpen = ref(false)
const inboxOpen = ref(false)
const attentionNavigationError = ref<string | null>(null)
let shouldSuppressAttentionEvent = (_event: AttentionEvent): boolean => false

const {
  dismiss: dismissAttentionEvent,
  dismissAll: dismissAllAttentionEvents,
  dismissingAll: dismissingAllAttentionEvents,
  error: attentionError,
  events: attentionEvents,
  lookupEvents: attentionLookupEvents,
  loading: attentionLoading,
  markRead: markAttentionEventRead,
  refresh: refreshAttentionEvents,
  unreadCount: unreadAttentionCount,
} = useAttentionInbox({
  shouldSuppress: event => shouldSuppressAttentionEvent(event),
})

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
  error: windowError,
  windowTabItems,
  activeWindowValue,
  activeWindow,
  fetchWindows,
  resetWindows,
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
  toggleActiveFilePreview,
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
  permalinks.clearEventMetadata()
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
  error: sessionError,
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
  onSessionRenamed: () => permalinks.replaceNext(),
  openFiles,
  resetHistory,
  resetWindows,
  startWindowRefresh,
  stopWindowRefresh,
  terminal,
})

const {
  agents,
  error: agentsError,
  refresh: refreshAgents,
  rename: renameAgent,
} = useTmuxAgents(handleAuthError)

const activeSessionId = computed(() => (
  sessions.value.find(session => session.name === activeSession.value)?.id ?? null
))
const {
  available: notificationMuteAvailable,
  busy: notificationMuteBusy,
  error: notificationMuteError,
  muted: notificationMuted,
  suppresses: suppressesAttentionEvent,
  toggle: toggleNotificationMute,
} = useSessionNotificationMute({
  sessionId: activeSessionId,
})
shouldSuppressAttentionEvent = suppressesAttentionEvent

const applyPermalinkTarget = usePermalinkTargetApplier({
  activeFilePath,
  activeSession,
  attachSession,
  attentionEvents: attentionLookupEvents,
  detachSession,
  error: attentionNavigationError,
  fetchWindows,
  handleAuthError,
  inboxOpen,
  isCurrent: token => permalinks.isCurrent(token),
  markAttentionEventRead,
  openPath,
  refreshAttentionEvents,
  refreshSessions,
  selectTmuxWindow: (index, isCurrent) => selectTmuxWindow(index, isCurrent),
  sessions,
  settingsOpen,
  viewMode,
})

const permalinks = useSessionPermalinkNavigation({
  activeFilePath,
  activeSession,
  activeWindow,
  applyTarget: applyPermalinkTarget,
  onInvalid(message) {
    attentionNavigationError.value = message
  },
  sessions,
  viewMode,
})

function attachSessionFromUi(name: string): void {
  permalinks.clearEventMetadata()
  void attachSession(name)
}

const openAgentFromUi = useTmuxAgentNavigation({
  attachSession,
  clearNavigationMetadata: () => permalinks.clearEventMetadata(),
  error: attentionNavigationError,
  fetchWindows,
  refreshAgents,
  refreshSessions,
  selectWindow: index => selectTmuxWindow(index),
  sessions,
  terminal,
  windows,
})

function renameAgentFromUi(payload: { label: string | null, paneId: string }): void {
  void renameAgent(payload.paneId, payload.label)
}

function createSessionFromUi(payload: { name: string, path: string }): void {
  permalinks.clearEventMetadata()
  void createSession(payload)
}

function destroySessionFromUi(name: string): void {
  permalinks.clearEventMetadata()
  void destroySession(name)
}

function detachSessionFromUi(name: string): void {
  permalinks.clearEventMetadata()
  detachSession(name)
}

function openFileFromUi(file: Parameters<typeof openFile>[0]): void {
  permalinks.clearEventMetadata()
  void openFile(file)
}

function closeFileFromUi(path: string): void {
  permalinks.clearEventMetadata()
  closeFile(path)
}

function closeOtherFilesFromUi(path: string): void {
  permalinks.clearEventMetadata()
  closeOtherFiles(path)
}

function closeAllFilesFromUi(): void {
  permalinks.clearEventMetadata()
  closeAllFiles()
}

function deleteFileOrFolderFromUi(
  node: Parameters<typeof deleteFileOrFolder>[0],
  refresh?: () => void,
): void {
  permalinks.clearEventMetadata()
  void deleteFileOrFolder(node, refresh)
}

async function openTransferFromUi(payload: { name: string, path: string }): Promise<boolean> {
  permalinks.clearEventMetadata()
  return openTransfer(payload)
}

function renameSessionFromUi(payload: { currentName: string, nextName: string }): void {
  permalinks.replaceNext()
  void renameSession(payload)
}

function selectExplorerFileFromUi(path: string): void {
  permalinks.clearEventMetadata()
  activeFilePath.value = path
}

function openPathFromUi(path: string): void {
  permalinks.clearEventMetadata()
  void openPath(path)
}

function openExplorerFromUi(): void {
  permalinks.clearEventMetadata()
  viewMode.value = 'explorer'
}

function returnToTerminalFromUi(): void {
  permalinks.clearEventMetadata()
  viewMode.value = 'terminal'
}

const appError = computed(() => attentionNavigationError.value ?? windowError.value ?? sessionError.value)

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
  deleteFileOrFolderFromUi,
  path => void downloadPath(path),
  openFileFromUi,
  closeFileFromUi,
  closeOtherFilesFromUi,
  closeAllFilesFromUi,
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
  openTransfer: openTransferFromUi,
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

async function selectTmuxWindow(value: string | number, isCurrent?: () => boolean): Promise<void> {
  const windowIndex = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(windowIndex) || !terminal.value) return
  await handleWindowSelect(windowIndex, (name, idx) => terminal.value!.attachWindow(name, idx), isCurrent)
}

async function selectTmuxWindowFromUi(value: string | number): Promise<void> {
  permalinks.clearEventMetadata()
  await selectTmuxWindow(value)
}

function openAttentionEvent(event: AttentionEvent): void {
  void permalinks.applyUrl(createAttentionDeepLink(event), true)
}

async function createTmuxWindow(): Promise<void> {
  if (!terminal.value) {
    windowError.value = 'Terminal is not ready.'
    return
  }
  await handleCreateWindow((name, idx) => terminal.value!.attachWindow(name, idx))
}

function createTmuxWindowFromUi(): void {
  permalinks.clearEventMetadata()
  void createTmuxWindow()
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
  windowError.value = null
  try {
    const data = await $fetch<{ activeWindowIndex: number }>(`/api/sessions/${encodeURIComponent(activeSession.value)}/windows/${windowIndex}`, {
      method: 'DELETE',
    })
    if (terminal.value) {
      await terminal.value.attachWindow(activeSession.value, data.activeWindowIndex)
    }
  }
  catch (err) {
    windowError.value = apiErrorMessage(err, 'Unable to close tmux window.')
    handleAuthError(err)
  }
}

function closeTmuxWindowFromUi(windowIndex: number): void {
  permalinks.clearEventMetadata()
  permalinks.replaceNext()
  void closeTmuxWindow(windowIndex)
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
  closeFileFromUi(deletedPath)
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

  void permalinks.start()
})

onBeforeUnmount(() => {
  permalinks.stop()
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
        :active-agent-pane-id="activePaneId"
        :active-session="activeSession"
        :active-window-id="activeWindow?.id ?? null"
        :agents="agents"
        :agents-error="agentsError"
        :error="appError"
        :linux-username="linuxUsername"
        :loading="loading"
        :sessions="sessions"
        :unread-attention-count="unreadAttentionCount"
        class="row-span-2 max-lg:row-span-1"
        @attach="attachSessionFromUi"
        @create="createSessionFromUi"
        @destroy="destroySessionFromUi"
        @detach="detachSessionFromUi"
        @inbox="inboxOpen = true"
        @logout="emit('logout')"
        @open-agent="void openAgentFromUi($event)"
        @open-dropzone="openDropzone"
        @refresh="refreshSessions"
        @rename="renameSessionFromUi"
        @rename-agent="renameAgentFromUi"
        @settings="settingsOpen = true"
      />

      <section
        class="flex min-h-0 flex-col overflow-hidden bg-[var(--bitveins-terminal-bg)]"
        :class="{ 'pb-[var(--bitveins-command-baseline,96px)]': activeSession && viewMode === 'terminal' && !settingsOpen }"
      >
        <div
          v-show="!settingsOpen"
          class="relative min-h-0 flex-1 overflow-hidden"
        >
          <AsyncTerminalWorkspace
            ref="terminal"
            v-model:editing-window-name="editingWindowName"
            :active="terminalInteractionEnabled"
            :active-session="activeSession"
            :active-window="activeWindow"
            :active-window-value="activeWindowValue"
            class="absolute inset-0 flex min-h-0 flex-col"
            :class="viewMode === 'terminal' && activeSession
              ? 'visible z-10'
              : 'invisible pointer-events-none z-0'"
            :editing-window-index="editingWindowIndex"
            :has-path-link-roots="hasPathLinkRoots"
            :input-mode="inputMode"
            :notification-mute-available="notificationMuteAvailable"
            :notification-mute-busy="notificationMuteBusy"
            :notification-mute-error="notificationMuteError"
            :notification-muted="notificationMuted"
            :path-link-root="pathLinkRoot"
            :window-tab-items="windowTabItems"
            :windows="windows"
            @auth-expired="emit('authExpired')"
            @change-path-link-root="changePathLinkRoot"
            @cancel-tmux-window-rename="cancelTmuxWindowRename"
            @close-tmux-window="closeTmuxWindowFromUi"
            @commit-tmux-window-rename="commitTmuxWindowRename"
            @connection-change="terminalConnected = $event"
            @create-tmux-window="createTmuxWindowFromUi"
            @file-link-activate="handleFileLinkActivate"
            @focused-pane-change="activePaneId = $event"
            @forget-all-path-link-roots="forgetAllPathLinkRoots"
            @forget-path-link-root="forgetPathLinkRoot"
            @open-explorer="openExplorerFromUi"
            @panes-change="void fetchWindows()"
            @ready="onTerminalReady"
            @select-tmux-window="selectTmuxWindowFromUi"
            @start-tmux-window-rename="startTmuxWindowRename"
            @toggle-notification-mute="toggleNotificationMute"
          />

          <AsyncTerminalExplorer
            v-show="Boolean(activeSession) && viewMode === 'explorer'"
            ref="explorerRef"
            v-model:is-mobile-tree-open="isMobileTreeOpen"
            :active-file-path="activeFilePath"
            :active-open-file="activeOpenFile"
            :active-session="activeSession"
            :expanded-paths="activeSession ? expandedPathsBySession[activeSession] || [] : []"
            :open-files="openFiles"
            class="absolute inset-0 z-10"
            @close-file="closeFileFromUi"
            @download-active-file="activeOpenFile && downloadExplorerItem(activeOpenFile.path)"
            @file-content-change="handleFileContentChange($event.file, $event.content)"
            @file-dbl-click="openFileFromUi"
            @file-deleted="handleFileDeleted"
            @item-context-menu="handleItemContextMenu($event, () => explorerRef?.reloadFileTree())"
            @open-path="openPathFromUi"
            @return-to-terminal="returnToTerminalFromUi"
            @save-active-file="saveActiveFile"
            @select-file="selectExplorerFileFromUi"
            @tab-context-menu="handleTabContextMenu($event)"
            @toggle-preview="toggleActiveFilePreview"
            @update-expanded-paths="activeSession && updateExpandedPaths(activeSession, $event)"
          />

          <SessionWelcome
            v-if="!activeSession"
            :loading="loading"
            :sessions="sessions"
            @attach="attachSessionFromUi"
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
        v-show="viewMode === 'terminal' && !settingsOpen && Boolean(activeSession)"
        ref="input"
        :disabled="!activeSession || settingsOpen || viewMode !== 'terminal'"
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

    <UAlert
      v-if="attentionNavigationError"
      aria-live="assertive"
      class="fixed inset-x-2 top-[calc(48px+env(safe-area-inset-top))] z-[70] text-[length:var(--bitveins-ui-caption-size)] lg:hidden"
      color="error"
      icon="i-lucide-triangle-alert"
      :title="attentionNavigationError"
      variant="subtle"
    />

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

    <AgentInbox
      v-model:open="inboxOpen"
      :dismissing-all="dismissingAllAttentionEvents"
      :error="attentionError"
      :events="attentionEvents"
      :loading="attentionLoading"
      @dismiss="dismissAttentionEvent($event.id)"
      @dismiss-all="dismissAllAttentionEvents"
      @select="openAttentionEvent"
    />
  </main>
</template>
