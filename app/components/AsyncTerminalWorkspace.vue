<script setup lang="ts">
import type { TerminalFileResolution } from '#shared/contracts/explorer'
import type { InputMode, TmuxWindow } from '~/types/session'
import type { TmuxWindowTabItem } from '~/types/tmux-tabs'
import AsyncTerminalHeader from '~/components/AsyncTerminalHeader.vue'
import TerminalView from '~/components/TerminalView.vue'

defineProps<{
  active: boolean
  activeSession: string | null
  activeWindow: TmuxWindow | null
  activeWindowValue?: string
  editingWindowIndex: number | null
  hasPathLinkRoots: boolean
  inputMode: InputMode
  pathLinkRoot: string | null
  windowTabItems: TmuxWindowTabItem[]
  windows: TmuxWindow[]
}>()

const emit = defineEmits<{
  authExpired: []
  cancelTmuxWindowRename: []
  changePathLinkRoot: []
  closeTmuxWindow: [index: number]
  commitTmuxWindowRename: []
  connectionChange: [connected: boolean]
  createTmuxWindow: []
  fileLinkActivate: [resolution: Exclude<TerminalFileResolution, { status: 'missing' }>]
  forgetAllPathLinkRoots: []
  forgetPathLinkRoot: []
  openExplorer: []
  ready: []
  selectTmuxWindow: [value: string]
  startTmuxWindowRename: [index: number]
}>()

const editingWindowName = defineModel<string>('editingWindowName', { default: '' })
const terminal = ref<InstanceType<typeof TerminalView> | null>(null)

async function attach(): Promise<void> {
  await terminal.value?.attach()
}

async function attachWindow(sessionName: string, windowIndex: number): Promise<void> {
  await terminal.value?.attachWindow(sessionName, windowIndex)
}

defineExpose({
  attach,
  attachWindow,
  detach: (sessionName?: string) => terminal.value?.detach(sessionName),
  focus: () => terminal.value?.focus(),
  sendInput: (data: string) => terminal.value?.sendInput(data),
  sendReliableInput: (data: string) => terminal.value?.sendReliableInput(data) ?? false,
  sendReliableInputs: (data: readonly string[]) =>
    terminal.value?.sendReliableInputs(data) ?? false,
})
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <AsyncTerminalHeader
      v-if="activeSession"
      v-model:editing-window-name="editingWindowName"
      :active-window-value="activeWindowValue"
      :editing-window-index="editingWindowIndex"
      :window-tab-items="windowTabItems"
      :windows="windows"
      :path-link-root="pathLinkRoot"
      :has-path-link-roots="hasPathLinkRoots"
      @change-path-link-root="emit('changePathLinkRoot')"
      @cancel-tmux-window-rename="emit('cancelTmuxWindowRename')"
      @close-tmux-window="emit('closeTmuxWindow', $event)"
      @commit-tmux-window-rename="emit('commitTmuxWindowRename')"
      @create-tmux-window="emit('createTmuxWindow')"
      @forget-all-path-link-roots="emit('forgetAllPathLinkRoots')"
      @forget-path-link-root="emit('forgetPathLinkRoot')"
      @open-explorer="emit('openExplorer')"
      @select-tmux-window="emit('selectTmuxWindow', $event)"
      @start-tmux-window-rename="emit('startTmuxWindowRename', $event)"
    />

    <TerminalView
      ref="terminal"
      :active="active"
      :active-session="activeSession"
      :active-window="activeWindow"
      :input-mode="inputMode"
      :remembered-root="pathLinkRoot || undefined"
      :windows="windows"
      class="min-h-0 flex-1"
      :style="{ transform: 'translateY(calc(-1 * var(--bitveins-command-offset, 0px)))' }"
      @auth-expired="emit('authExpired')"
      @connection-change="emit('connectionChange', $event)"
      @file-link-activate="emit('fileLinkActivate', $event)"
      @ready="emit('ready')"
    />
  </div>
</template>
