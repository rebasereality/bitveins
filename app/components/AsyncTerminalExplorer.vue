<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import FileTree from '~/components/FileTree.vue'
import type {
  ExplorerDocument,
  ExplorerFileNode,
  ExplorerTextDocument,
} from '~/types/explorer'
import { isTextDocument } from '~/types/explorer'
import ExplorerImageViewer from '~/components/ExplorerImageViewer.vue'

const CodeEditor = defineAsyncComponent(() => import('~/components/CodeEditor.vue'))

defineProps<{
  activeOpenFile: ExplorerDocument | null
  activeSession: string | null
  expandedPaths: string[]
}>()

const emit = defineEmits<{
  fileDblClick: [fileNode: ExplorerFileNode]
  fileDeleted: [path: string]
  fileContentChange: [payload: { file: ExplorerTextDocument, content: string }]
  itemContextMenu: [payload: { event: MouseEvent, node: ExplorerFileNode }]
  saveActiveFile: []
  updateExpandedPaths: [paths: string[]]
}>()

const isMobileTreeOpen = defineModel<boolean>('isMobileTreeOpen', { default: false })
const fileTreeRef = ref<{ reload: () => void } | null>(null)

defineExpose({
  reloadFileTree: () => fileTreeRef.value?.reload(),
})
</script>

<template>
  <div class="relative flex h-full w-full overflow-hidden bg-[var(--bitveins-terminal-bg)]">
    <div
      v-if="isMobileTreeOpen"
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
      @click="isMobileTreeOpen = false"
    />

    <div
      class="h-full flex flex-col transition-transform duration-300 ease-out"
      :class="[
        'max-lg:fixed max-lg:left-0 max-lg:top-0 max-lg:bottom-0 max-lg:z-50 max-lg:w-72 max-lg:max-w-[85vw] max-lg:shadow-2xl max-lg:bg-[var(--bitveins-shell-panel)]',
        isMobileTreeOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full lg:translate-x-0 w-64 shrink-0',
      ]"
    >
      <FileTree
        v-if="activeSession"
        ref="fileTreeRef"
        :session-name="activeSession"
        :expanded-paths="expandedPaths"
        @update:expanded-paths="emit('updateExpandedPaths', $event)"
        @file-dbl-click="emit('fileDblClick', $event)"
        @file-deleted="emit('fileDeleted', $event)"
        @item-context-menu="emit('itemContextMenu', $event)"
      />
    </div>

    <div class="flex-1 h-full overflow-hidden flex flex-col">
      <CodeEditor
        v-if="activeOpenFile && isTextDocument(activeOpenFile)"
        :model-value="activeOpenFile.content"
        :file-path="activeOpenFile.path"
        :line="activeOpenFile.line"
        :column="activeOpenFile.column"
        :navigation-token="activeOpenFile.navigationToken"
        @update:model-value="emit('fileContentChange', { file: activeOpenFile, content: $event })"
        @save="emit('saveActiveFile')"
      />
      <ExplorerImageViewer
        v-else-if="activeOpenFile?.kind === 'image'"
        :document="activeOpenFile"
      />
      <div
        v-else
        class="flex-1 flex flex-col items-center justify-center text-slate-500 gap-3 select-none bg-[var(--bitveins-terminal-bg)]"
      >
        <UIcon
          name="i-lucide-code"
          class="size-12 text-slate-600/80 animate-pulse"
        />
        <div class="text-center">
          <p class="text-sm font-semibold text-slate-400">
            No open files
          </p>
          <p class="text-xs text-slate-500 mt-1">
            Double-click a file in the explorer to edit it.
          </p>
          <div class="mt-4 inline-flex items-center gap-1.5 text-[10px] text-slate-600 bg-black/20 border border-[var(--bitveins-shell-border)] px-2 py-1 rounded">
            <kbd class="px-1 bg-black/30 rounded border border-slate-700">Ctrl</kbd>
            <span>+</span>
            <kbd class="px-1 bg-black/30 rounded border border-slate-700">S</kbd>
            <span>to save</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
