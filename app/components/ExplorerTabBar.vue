<script setup lang="ts">
import { computed } from 'vue'
import type { ExplorerDocument } from '~/types/explorer'
import { isPreviewableTextDocument } from '~/types/explorer'

const props = defineProps<{
  activeFilePath: string | null
  activeOpenFile: ExplorerDocument | null
  openFiles: ExplorerDocument[]
}>()

const emit = defineEmits<{
  closeFile: [path: string]
  downloadActiveFile: []
  openMobileTree: []
  returnToTerminal: []
  saveActiveFile: []
  selectFile: [path: string]
  tabContextMenu: [payload: { event: MouseEvent, file: ExplorerDocument }]
  togglePreview: []
}>()

const previewableFile = computed(() => (
  isPreviewableTextDocument(props.activeOpenFile) ? props.activeOpenFile : null
))
</script>

<template>
  <div
    class="relative z-10 flex h-[var(--bitveins-topbar-height)] shrink-0 items-end gap-1 border-b border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-chrome)] px-1 pt-1"
    data-explorer-tab-bar
  >
    <div class="flex h-8 min-w-0 flex-1 items-end gap-0 overflow-x-auto select-none">
      <UButton
        class="mb-1 size-6 shrink-0 lg:hidden"
        color="neutral"
        icon="i-lucide-menu"
        size="xs"
        title="Open file explorer"
        variant="ghost"
        @click="emit('openMobileTree')"
      />

      <div
        v-for="file in openFiles"
        :key="file.path"
        class="inline-flex h-8 max-w-44 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border px-2 text-[length:var(--bitveins-ui-label-size)] transition-colors"
        :class="activeFilePath === file.path
          ? 'border-[var(--bitveins-shell-border)] border-b-[var(--bitveins-terminal-bg)] bg-[var(--bitveins-terminal-bg)] text-[var(--bitveins-shell-text)]'
          : 'border-transparent text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)]'"
        data-explorer-tab
        @click="emit('selectFile', file.path)"
        @auxclick.middle.prevent.stop="emit('closeFile', file.path)"
        @contextmenu.prevent.stop="emit('tabContextMenu', { event: $event, file })"
      >
        <span class="max-w-36 truncate">{{ file.name }}</span>
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
      v-if="previewableFile"
      :aria-pressed="previewableFile.previewEnabled"
      class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
      :color="previewableFile.previewEnabled ? 'primary' : 'neutral'"
      icon="i-lucide-eye"
      label="Preview"
      size="xs"
      :title="previewableFile.previewEnabled ? 'Show source' : 'Show preview'"
      :variant="previewableFile.previewEnabled ? 'solid' : 'ghost'"
      @click="emit('togglePreview')"
    />

    <UButton
      v-if="activeOpenFile"
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
      v-if="activeOpenFile?.isDirty"
      class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
      color="success"
      icon="i-lucide-save"
      label="Save"
      size="xs"
      title="Save changes (Ctrl+S)"
      variant="solid"
      @click="emit('saveActiveFile')"
    />

    <UButton
      class="mb-1 h-6 shrink-0 px-1.5 text-[length:var(--bitveins-ui-caption-size)]"
      color="neutral"
      icon="i-lucide-terminal"
      label="Terminal"
      size="xs"
      title="Return to Terminal"
      variant="ghost"
      @click="emit('returnToTerminal')"
    />
  </div>
</template>
