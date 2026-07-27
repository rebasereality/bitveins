<script setup lang="ts">
import type { TmuxWindow } from '~/types/session'
import type { TmuxWindowTabItem } from '~/types/tmux-tabs'

defineProps<{
  activeWindowValue?: string
  editingWindowIndex: number | null
  windowTabItems: TmuxWindowTabItem[]
  windows: TmuxWindow[]
  pathLinkRoot: string | null
  hasPathLinkRoots: boolean
}>()

const emit = defineEmits<{
  closeTmuxWindow: [index: number]
  commitTmuxWindowRename: []
  cancelTmuxWindowRename: []
  createTmuxWindow: []
  changePathLinkRoot: []
  forgetAllPathLinkRoots: []
  forgetPathLinkRoot: []
  openExplorer: []
  selectTmuxWindow: [value: string]
  startTmuxWindowRename: [index: number]
}>()

const editingWindowName = defineModel<string>('editingWindowName', { default: '' })
</script>

<template>
  <div
    class="relative z-10 flex h-[var(--bitveins-topbar-height)] shrink-0 items-end gap-1 border-b border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-chrome)] px-1 pt-1"
    data-terminal-header
  >
    <TmuxWindowTabStrip
      v-if="windowTabItems.length > 0"
      v-model:editing-window-name="editingWindowName"
      :active-value="activeWindowValue"
      :editing-window-index="editingWindowIndex"
      :items="windowTabItems"
      :window-count="windows.length"
      @cancel-rename="emit('cancelTmuxWindowRename')"
      @close="emit('closeTmuxWindow', $event)"
      @commit-rename="emit('commitTmuxWindowRename')"
      @create="emit('createTmuxWindow')"
      @select="emit('selectTmuxWindow', $event)"
      @start-rename="emit('startTmuxWindowRename', $event)"
    />
    <div
      v-else
      class="flex h-8 flex-1 items-center px-2 text-[length:var(--bitveins-ui-caption-size)] italic text-[var(--bitveins-shell-text-subtle)]"
    >
      No terminal windows
    </div>

    <UButton
      aria-label="Files"
      class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
      color="neutral"
      icon="i-lucide-files"
      label="Files"
      size="xs"
      title="Open Files"
      variant="ghost"
      @click="emit('openExplorer')"
    />

    <PathLinkRootMenu
      class="mb-1"
      :current-root="pathLinkRoot"
      :has-any="hasPathLinkRoots"
      @change="emit('changePathLinkRoot')"
      @forget-all="emit('forgetAllPathLinkRoots')"
      @forget-current="emit('forgetPathLinkRoot')"
    />
  </div>
</template>
