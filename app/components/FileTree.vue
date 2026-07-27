<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { FileNode } from './FileTreeItem.vue'
import { apiErrorMessage } from '~/utils/api-error'

const props = defineProps<{
  sessionName: string
  expandedPaths?: string[]
}>()

const emit = defineEmits<{
  'fileDblClick': [node: FileNode]
  'fileDeleted': [path: string]
  'update:expandedPaths': [paths: string[]]
  'item-context-menu': [payload: { event: MouseEvent, node: FileNode }]
}>()

const rootNode = ref<FileNode>({
  name: 'Workspace',
  path: '',
  isDir: true,
  isOpen: true,
  children: [],
})

const loading = ref(false)
const localExpandedPaths = ref<Set<string>>(new Set(props.expandedPaths || []))

// Synchronize local set when props are updated (e.g. on session change)
watch(() => props.expandedPaths, (newPaths) => {
  localExpandedPaths.value = new Set(newPaths || [])
}, { deep: true })

function findNodeByPath(node: FileNode, path: string): FileNode | null {
  if (node.path === path) return node
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByPath(child, path)
      if (found) return found
    }
  }
  return null
}

interface RawFileEntry {
  name: string
  path: string
  isDir: boolean
  size?: number
}

async function fetchFolderChildren(node: FileNode) {
  node.isLoading = true
  try {
    const data = await $fetch<{ files: RawFileEntry[] }>(`/api/sessions/${encodeURIComponent(props.sessionName)}/files`, {
      query: { path: node.path },
    })

    // 1. Map and assign first to ensure children become reactive
    node.children = data.files.map((f) => {
      const isOpen = f.isDir && localExpandedPaths.value.has(f.path)
      return {
        ...f,
        children: f.isDir ? [] : undefined,
        isOpen,
        isLoading: false,
      }
    })

    // 2. Iterate and trigger async recursion on reactive nodes
    for (const childNode of node.children) {
      if (childNode.isOpen) {
        fetchFolderChildren(childNode)
      }
    }
  }
  catch (err) {
    console.error(`Failed to load folder children for ${node.path}:`, err)
  }
  finally {
    node.isLoading = false
  }
}

async function loadRoot() {
  loading.value = true
  rootNode.value.isLoading = true
  try {
    const data = await $fetch<{ files: RawFileEntry[] }>(`/api/sessions/${encodeURIComponent(props.sessionName)}/files`)

    // 1. Map and assign to root node
    rootNode.value.children = data.files.map((f) => {
      const isOpen = f.isDir && localExpandedPaths.value.has(f.path)
      return {
        ...f,
        children: f.isDir ? [] : undefined,
        isOpen,
        isLoading: false,
      }
    })

    // 2. Trigger async recursion on reactive root children
    for (const childNode of rootNode.value.children) {
      if (childNode.isOpen) {
        fetchFolderChildren(childNode)
      }
    }
  }
  catch (err) {
    console.error('Failed to load workspace root:', err)
  }
  finally {
    loading.value = false
    rootNode.value.isLoading = false
  }
}

async function handleToggleFolder(node: FileNode) {
  node.isOpen = !node.isOpen
  if (node.isOpen) {
    localExpandedPaths.value.add(node.path)
    emit('update:expandedPaths', Array.from(localExpandedPaths.value))
    if ((!node.children || node.children.length === 0) && !node.isLoading) {
      await fetchFolderChildren(node)
    }
  }
  else {
    localExpandedPaths.value.delete(node.path)
    emit('update:expandedPaths', Array.from(localExpandedPaths.value))
  }
}

async function handleCreateChild(parentPath: string, name: string, isDir: boolean) {
  const childPath = parentPath ? `${parentPath}/${name}` : name
  try {
    await $fetch(`/api/sessions/${encodeURIComponent(props.sessionName)}/files/create`, {
      method: 'POST',
      body: { path: childPath, isDir },
    })
    // Reload parent folder children
    const parentNode = parentPath ? findNodeByPath(rootNode.value, parentPath) : rootNode.value
    if (parentNode) {
      parentNode.isOpen = true
      await fetchFolderChildren(parentNode)
    }
  }
  catch (err: unknown) {
    alert(`Error creating file/directory: ${apiErrorMessage(err, 'Create error')}`)
  }
}

async function handleDeleteItem(path: string) {
  try {
    await $fetch(`/api/sessions/${encodeURIComponent(props.sessionName)}/files/delete`, {
      method: 'POST',
      body: { path },
    })

    // Emit event so the editor can close this file if it is open
    emit('fileDeleted', path)

    // Reload parent folder children
    const idx = path.lastIndexOf('/')
    const parentPath = idx === -1 ? '' : path.substring(0, idx)
    const parentNode = parentPath ? findNodeByPath(rootNode.value, parentPath) : rootNode.value
    if (parentNode) {
      await fetchFolderChildren(parentNode)
    }
  }
  catch (err: unknown) {
    alert(`Error deleting file/directory: ${apiErrorMessage(err, 'Delete error')}`)
  }
}

// Reload when session name changes
watch(() => props.sessionName, () => {
  rootNode.value.children = []
  loadRoot()
})

onMounted(() => {
  loadRoot()
})

defineExpose({
  reload: loadRoot,
})
</script>

<template>
  <div
    class="flex h-full w-full flex-col overflow-hidden border-r border-[var(--bitveins-shell-border)] bg-[var(--bitveins-shell-panel)]"
    data-explorer-tree
  >
    <!-- Header -->
    <div
      class="flex h-[var(--bitveins-topbar-height)] shrink-0 select-none items-center justify-between border-b border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-chrome)] px-2 text-[length:var(--bitveins-ui-caption-size)] font-medium text-[var(--bitveins-shell-text-muted)]"
      data-explorer-tree-header
    >
      <span>Explorer</span>
      <div class="flex items-center gap-1.5">
        <!-- Manual reload button -->
        <button
          class="grid size-5 place-items-center rounded text-[var(--bitveins-shell-text-subtle)] transition-colors hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-accent)]"
          title="Refresh explorer"
          @click="loadRoot"
        >
          <UIcon
            name="i-lucide-refresh-cw"
            class="size-3.5"
            :class="{ 'animate-spin': loading }"
          />
        </button>
      </div>
    </div>

    <!-- Tree list scrollable container -->
    <div class="flex-1 overflow-auto p-1">
      <!-- We render the root children directly to simulate a top-level workspace tree -->
      <template v-if="rootNode.children && rootNode.children.length > 0">
        <FileTreeItem
          v-for="child in rootNode.children"
          :key="child.path"
          :node="child"
          @create-child="handleCreateChild"
          @delete-item="handleDeleteItem"
          @file-dbl-click="emit('fileDblClick', $event)"
          @toggle-folder="handleToggleFolder"
          @item-context-menu="emit('item-context-menu', $event)"
        />
      </template>
      <div
        v-else-if="loading"
        class="flex flex-col items-center justify-center h-32 text-slate-500 gap-2"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin text-[var(--bitveins-shell-accent)]"
        />
        <span class="text-xs">Loading...</span>
      </div>
      <div
        v-else
        class="text-xs text-slate-500 italic p-2 select-none"
      >
        No files found in this workspace.
      </div>
    </div>
  </div>
</template>
