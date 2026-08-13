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
  notificationMuteAvailable: boolean
  notificationMuteBusy: boolean
  notificationMuteError: boolean
  notificationMuted: boolean
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
  openGitGraph: []
  toggleNotificationMute: []
  selectTmuxWindow: [value: string]
  startTmuxWindowRename: [index: number]
  splitTmuxWindow: [direction: 'horizontal' | 'vertical']
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
      v-if="notificationMuteAvailable"
      :aria-label="notificationMuted ? 'Unmute notifications for this session' : 'Mute notifications for this session'"
      :aria-pressed="notificationMuted"
      class="mb-1 size-6 shrink-0 justify-center p-0"
      :color="notificationMuteError ? 'error' : 'neutral'"
      :disabled="notificationMuteBusy"
      :icon="notificationMuted ? 'i-lucide-bell-off' : 'i-lucide-bell'"
      size="xs"
      :title="notificationMuteError
        ? 'Unable to update notification mute'
        : notificationMuted
          ? 'Notifications are muted for this session on this device'
          : 'Mute notifications for this session on this device'"
      variant="ghost"
      @click="emit('toggleNotificationMute')"
    />

    <UButton
      aria-label="Split Horizontal"
      class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
      color="neutral"
      icon="i-lucide-columns-2"
      size="xs"
      title="Split Pane Horizontally (Side-by-Side)"
      variant="ghost"
      @click="emit('splitTmuxWindow', 'horizontal')"
    />

    <UButton
      aria-label="Split Vertical"
      class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
      color="neutral"
      icon="i-lucide-rows-2"
      size="xs"
      title="Split Pane Vertically (Top / Bottom)"
      variant="ghost"
      @click="emit('splitTmuxWindow', 'vertical')"
    />

    <UButton
      aria-label="Git Graph"
      class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
      color="neutral"
      icon="i-lucide-git-graph"
      label="Git"
      size="xs"
      title="Open Git Graph"
      variant="ghost"
      @click="emit('openGitGraph')"
    />

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
