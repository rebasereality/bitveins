<script setup lang="ts">
import type { TmuxWindow } from '~/types/session'
import type { ExplorerDocument } from '~/types/explorer'
import type { ExplorerViewMode } from '~/utils/explorer-view-mode'
import type { TmuxWindowTabItem } from '~/types/tmux-tabs'

defineProps<{
  activeOpenFile: ExplorerDocument | null
  activeWindowValue?: string
  editingWindowIndex: number | null
  openFiles: ExplorerDocument[]
  activeFilePath: string | null
  windowTabItems: TmuxWindowTabItem[]
  windows: TmuxWindow[]
  pathLinkRoot: string | null
  hasPathLinkRoots: boolean
}>()

const emit = defineEmits<{
  closeFile: [path: string]
  closeTmuxWindow: [index: number]
  commitTmuxWindowRename: []
  cancelTmuxWindowRename: []
  createTmuxWindow: []
  downloadActiveFile: []
  openMobileTree: []
  saveActiveFile: []
  selectFile: [path: string]
  changePathLinkRoot: []
  forgetAllPathLinkRoots: []
  forgetPathLinkRoot: []
  selectTmuxWindow: [value: string]
  startTmuxWindowRename: [index: number]
  switchViewMode: [mode: ExplorerViewMode]
  tabContextMenu: [payload: { event: MouseEvent, file: ExplorerDocument }]
}>()

const viewMode = defineModel<ExplorerViewMode>('viewMode', { default: 'terminal' })
const editingWindowName = defineModel<string>('editingWindowName', { default: '' })
</script>

<template>
  <div
    class="relative z-10 flex h-[var(--bitveins-topbar-height)] shrink-0 items-end gap-1 border-b border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-chrome)] px-1 pt-1"
    data-terminal-header
  >
    <template v-if="viewMode === 'terminal'">
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
        size="xs"
        color="neutral"
        icon="i-lucide-files"
        label="Files"
        title="Open Files"
        variant="ghost"
        @click="viewMode = 'explorer'"
      />
    </template>

    <template v-else>
      <div class="flex h-8 min-w-0 flex-1 items-end gap-0 overflow-x-auto select-none">
        <UButton
          icon="i-lucide-menu"
          size="xs"
          color="neutral"
          variant="ghost"
          class="mb-1 size-6 shrink-0 lg:hidden"
          title="Open file explorer"
          @click="emit('openMobileTree')"
        />

        <div
          v-for="file in openFiles"
          :key="file.path"
          data-explorer-tab
          class="inline-flex h-8 max-w-44 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border px-2 text-[length:var(--bitveins-ui-label-size)] transition-colors"
          :class="activeFilePath === file.path
            ? 'border-[var(--bitveins-shell-border)] border-b-[var(--bitveins-terminal-bg)] bg-[var(--bitveins-terminal-bg)] text-[var(--bitveins-shell-text)]'
            : 'border-transparent text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)]'"
          @click="emit('selectFile', file.path)"
          @contextmenu.prevent.stop="emit('tabContextMenu', { event: $event, file })"
        >
          <span class="truncate max-w-36">{{ file.name }}</span>
          <span
            v-if="file.isDirty"
            class="size-1.5 shrink-0 rounded-full bg-[var(--bitveins-shell-accent)]"
            title="Modified"
          />
          <button
            class="grid size-4 place-items-center rounded text-[var(--bitveins-shell-text-subtle)] transition-colors hover:bg-black/10 hover:text-rose-500 dark:hover:bg-white/10"
            title="Close file"
            type="button"
            @click.stop="emit('closeFile', file.path)"
          >
            <UIcon
              class="size-3"
              name="i-lucide-x"
            />
          </button>
        </div>
        <div
          v-if="openFiles.length === 0"
          class="flex h-8 items-center px-2 text-[length:var(--bitveins-ui-caption-size)] italic text-[var(--bitveins-shell-text-subtle)]"
        >
          No open files
        </div>
      </div>

      <UButton
        v-if="activeOpenFile?.kind === 'text'"
        aria-label="Download active file"
        class="mb-1 size-6 shrink-0"
        color="neutral"
        icon="i-lucide-download"
        size="xs"
        square
        title="Download active file"
        variant="ghost"
        @click="emit('downloadActiveFile')"
      />

      <UButton
        v-if="activeOpenFile && activeOpenFile.isDirty"
        icon="i-lucide-save"
        size="xs"
        color="success"
        variant="solid"
        title="Save changes (Ctrl+S)"
        class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
        label="Save"
        @click="emit('saveActiveFile')"
      />

      <UButton
        icon="i-lucide-terminal"
        size="xs"
        color="neutral"
        variant="ghost"
        title="Return to Terminal"
        class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
        label="Terminal"
        @click="viewMode = 'terminal'"
      />
    </template>

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
