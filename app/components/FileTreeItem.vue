<script setup lang="ts">
import { ref, nextTick } from 'vue'

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  size?: number
  children?: FileNode[]
  isOpen?: boolean
  isLoading?: boolean
}

const props = withDefaults(defineProps<{
  node: FileNode
  depth?: number
}>(), {
  depth: 0,
})

const emit = defineEmits<{
  'toggleFolder': [node: FileNode]
  'fileDblClick': [node: FileNode]
  'createChild': [parentPath: string, name: string, isDir: boolean]
  'deleteItem': [path: string]
  'item-context-menu': [payload: { event: MouseEvent, node: FileNode }]
}>()

const creatingType = ref<'file' | 'dir' | null>(null)
const creatingName = ref('')
const createInputRef = ref<HTMLInputElement | null>(null)

function handleNodeClick() {
  if (props.node.isDir) {
    emit('toggleFolder', props.node)
  }
}

function handleNodeDblClick() {
  if (!props.node.isDir) {
    emit('fileDblClick', props.node)
  }
}

function onContextMenu(event: MouseEvent) {
  emit('item-context-menu', { event, node: props.node })
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'vue':
      return 'i-lucide-file-code'
    case 'json':
    case 'yaml':
    case 'yml':
      return 'i-lucide-braces'
    case 'md':
      return 'i-lucide-book-open'
    case 'css':
    case 'scss':
      return 'i-lucide-palette'
    case 'html':
      return 'i-lucide-code-2'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'avif':
    case 'apng':
    case 'bmp':
    case 'ico':
    case 'cur':
    case 'jfif':
    case 'tif':
    case 'tiff':
    case 'heic':
    case 'heif':
    case 'jxl':
    case 'psd':
    case 'svg':
      return 'i-lucide-image'
    case 'mp4':
    case 'm4v':
    case 'webm':
    case 'ogv':
    case 'mov':
    case 'mkv':
    case 'avi':
    case 'mpeg':
    case 'mpg':
    case '3gp':
    case '3g2':
      return 'i-lucide-file-video'
    default:
      return 'i-lucide-file'
  }
}

function getFileIconColor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'vue':
      return 'text-[var(--bitveins-shell-accent)]'
    case 'ts':
    case 'tsx':
      return 'text-sky-400'
    case 'js':
    case 'jsx':
      return 'text-yellow-400'
    case 'json':
      return 'text-amber-500'
    case 'md':
      return 'text-slate-400'
    case 'css':
    case 'scss':
      return 'text-pink-400'
    case 'html':
      return 'text-orange-400'
    default:
      return 'text-slate-300'
  }
}

function startCreate(type: 'file' | 'dir') {
  creatingType.value = type
  creatingName.value = ''
  nextTick(() => {
    createInputRef.value?.focus()
  })
}

function cancelCreate() {
  creatingType.value = null
  creatingName.value = ''
}

function commitCreate() {
  const name = creatingName.value.trim()
  if (!name || !creatingType.value) {
    cancelCreate()
    return
  }

  emit('createChild', props.node.path, name, creatingType.value === 'dir')
  cancelCreate()
}

function handleDelete() {
  const confirmMsg = props.node.isDir
    ? `Do you want to delete the empty directory "${props.node.name}"?`
    : `Do you want to delete the file "${props.node.name}"?`

  if (confirm(confirmMsg)) {
    emit('deleteItem', props.node.path)
  }
}
</script>

<template>
  <div class="select-none text-[length:var(--bitveins-ui-label-size)]">
    <!-- Node item row -->
    <div
      class="group flex h-6 cursor-pointer items-center justify-between rounded px-1 hover:bg-[var(--bitveins-shell-panel-muted)]"
      :style="{ paddingLeft: `${depth * 12 + 4}px` }"
      @click="handleNodeClick"
      @dblclick="handleNodeDblClick"
      @contextmenu.prevent.stop="onContextMenu"
    >
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <!-- Chevron for directory -->
        <span class="inline-flex size-4 items-center justify-center text-slate-500">
          <UIcon
            v-if="node.isDir"
            :name="node.isOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-3"
          />
        </span>

        <!-- Node Icon -->
        <UIcon
          v-if="node.isDir"
          :name="node.isOpen ? 'i-lucide-folder-open' : 'i-lucide-folder'"
          class="size-4 shrink-0 text-amber-400/90"
        />
        <UIcon
          v-else
          :name="getFileIcon(node.name)"
          class="size-4 shrink-0"
          :class="getFileIconColor(node.name)"
        />

        <!-- Loading spinner -->
        <UIcon
          v-if="node.isLoading"
          name="i-lucide-loader-circle"
          class="size-3 shrink-0 animate-spin text-[var(--bitveins-shell-accent)]"
        />

        <!-- Node Name -->
        <span
          class="truncate text-[var(--bitveins-shell-text)]"
          :class="{ 'font-semibold': node.isDir }"
        >
          {{ node.name }}
        </span>
      </div>

      <!-- Action buttons on hover -->
      <div class="hidden items-center gap-1 pr-1 group-hover:flex">
        <!-- Create new file/folder under directory -->
        <template v-if="node.isDir">
          <button
            class="inline-flex size-4 items-center justify-center rounded text-slate-400 hover:bg-[var(--bitveins-shell-border)] hover:text-[var(--bitveins-shell-accent)]"
            title="Nouveau fichier"
            @click.stop="startCreate('file')"
          >
            <UIcon
              name="i-lucide-file-plus"
              class="size-3"
            />
          </button>
          <button
            class="inline-flex size-4 items-center justify-center rounded text-slate-400 hover:bg-[var(--bitveins-shell-border)] hover:text-[var(--bitveins-shell-accent)]"
            title="Nouveau dossier"
            @click.stop="startCreate('dir')"
          >
            <UIcon
              name="i-lucide-folder-plus"
              class="size-3"
            />
          </button>
        </template>

        <!-- Delete item -->
        <button
          class="inline-flex size-4 items-center justify-center rounded text-slate-400 hover:bg-[var(--bitveins-shell-border)] hover:text-rose-400"
          title="Supprimer"
          @click.stop="handleDelete"
        >
          <UIcon
            name="i-lucide-trash-2"
            class="size-3"
          />
        </button>
      </div>
    </div>

    <!-- Recursive children -->
    <div v-if="node.isDir && node.isOpen">
      <!-- Virtual input for new node creation -->
      <div
        v-if="creatingType"
        class="flex items-center gap-1.5 py-1"
        :style="{ paddingLeft: `${(depth + 1) * 12 + 20}px` }"
      >
        <UIcon
          :name="creatingType === 'dir' ? 'i-lucide-folder' : 'i-lucide-file'"
          class="size-4 shrink-0 text-slate-400"
        />
        <input
          ref="createInputRef"
          v-model="creatingName"
          class="h-5 w-36 rounded border border-[var(--bitveins-shell-accent)] bg-[var(--bitveins-terminal-bg)] px-1 font-mono text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text)] outline-none ring-1 ring-[var(--bitveins-shell-accent-soft)]"
          placeholder="Nom..."
          @blur="commitCreate"
          @keydown.enter="commitCreate"
          @keydown.esc="cancelCreate"
        >
      </div>

      <FileTreeItem
        v-for="child in node.children"
        :key="child.path"
        :depth="depth + 1"
        :node="child"
        @create-child="(parentPath, name, isDir) => emit('createChild', parentPath, name, isDir)"
        @delete-item="emit('deleteItem', $event)"
        @file-dbl-click="emit('fileDblClick', $event)"
        @toggle-folder="emit('toggleFolder', $event)"
        @item-context-menu="emit('item-context-menu', $event)"
      />

      <!-- Show empty message if folder expanded but empty -->
      <div
        v-if="node.children && node.children.length === 0 && !creatingType"
        class="py-1 text-[length:var(--bitveins-ui-caption-size)] italic text-slate-500"
        :style="{ paddingLeft: `${(depth + 1) * 12 + 20}px` }"
      >
        (empty folder)
      </div>
    </div>
  </div>
</template>
