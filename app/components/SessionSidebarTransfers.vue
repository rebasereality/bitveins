<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  Dropzone,
  DropzoneUpload,
} from '~/composables/useSessionDropzones'

const props = defineProps<{
  dropzones: Dropzone[]
  dropzoneUploads: Record<string, DropzoneUpload>
  isMobile?: boolean
}>()

const emit = defineEmits<{
  create: []
  delete: [index: number]
  open: [dropzone: Dropzone]
  pick: [dropzone: Dropzone]
}>()

const open = ref(false)
const actionsOpenIndex = ref<number | null>(null)
const menuRoot = ref<HTMLElement | null>(null)
const activeUploadCount = computed(() => Object.values(props.dropzoneUploads)
  .filter(upload => upload.status === 'uploading')
  .length)

function close(): void {
  open.value = false
  actionsOpenIndex.value = null
}

function deleteDestination(index: number): void {
  actionsOpenIndex.value = null
  emit('delete', index)
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

function onDocumentPointerdown(event: PointerEvent): void {
  if (event.target instanceof Node && !menuRoot.value?.contains(event.target)) {
    close()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown)
  document.addEventListener('pointerdown', onDocumentPointerdown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  document.removeEventListener('pointerdown', onDocumentPointerdown)
})
</script>

<template>
  <div
    ref="menuRoot"
    class="relative"
    data-sidebar-transfers
  >
    <button
      aria-haspopup="menu"
      :aria-expanded="open"
      class="flex w-full items-center gap-1.5 rounded px-1.5 text-left text-[length:var(--bitveins-ui-label-size)] text-[var(--bitveins-shell-text-muted)] outline-none transition-colors hover:bg-[var(--bitveins-shell-panel-muted)] hover:text-[var(--bitveins-shell-text)] focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--bitveins-shell-accent)]"
      :class="isMobile ? 'h-9' : 'h-7'"
      type="button"
      @click="open = !open"
    >
      <UIcon
        class="size-3.5 shrink-0"
        name="i-lucide-folder-input"
      />
      <span class="min-w-0 flex-1 truncate">Transfers</span>
      <span
        v-if="activeUploadCount"
        class="size-1.5 rounded-full bg-[var(--bitveins-shell-accent)]"
        :title="`${activeUploadCount} active uploads`"
      />
      <UIcon
        class="size-3 shrink-0"
        :name="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
      />
    </button>

    <div
      v-if="open"
      class="absolute bottom-full left-0 z-50 mb-1 w-[min(280px,calc(100vw-16px))] rounded-md border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)] p-1 shadow-xl shadow-black/20"
      role="menu"
    >
      <div class="flex h-7 items-center justify-between px-1.5">
        <span class="text-[length:var(--bitveins-ui-caption-size)] font-semibold text-[var(--bitveins-shell-text)]">Transfer destinations</span>
        <UButton
          aria-label="Create transfer destination"
          class="size-5 justify-center"
          color="neutral"
          icon="i-lucide-plus"
          size="xs"
          square
          title="Create transfer destination"
          variant="ghost"
          @click="emit('create')"
        />
      </div>

      <p
        v-if="dropzones.length === 0"
        class="px-1.5 py-3 text-[length:var(--bitveins-ui-caption-size)] text-[var(--bitveins-shell-text-subtle)]"
      >
        No transfer destinations.
      </p>

      <div
        v-else
        class="max-h-64 overflow-y-auto"
      >
        <div
          v-for="(dropzone, index) in dropzones"
          :key="`${dropzone.name}:${dropzone.path}`"
          class="group relative rounded border border-transparent p-1 transition-colors hover:bg-[var(--bitveins-shell-panel-muted)]"
        >
          <div class="flex min-w-0 items-center gap-1">
            <button
              class="min-w-0 flex-1 px-1 text-left"
              role="menuitem"
              type="button"
              @click="close(); emit('open', dropzone)"
            >
              <span class="block truncate text-[length:var(--bitveins-ui-label-size)] font-medium text-[var(--bitveins-shell-text)]">{{ dropzone.name }}</span>
              <span class="block truncate font-mono text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-subtle)]">{{ dropzone.path }}</span>
            </button>
            <UButton
              :aria-label="`Upload to ${dropzone.name}`"
              class="size-5 justify-center"
              color="neutral"
              icon="i-lucide-upload"
              size="xs"
              square
              :title="`Upload to ${dropzone.name}`"
              variant="ghost"
              @click="emit('pick', dropzone)"
            />
            <button
              :aria-expanded="actionsOpenIndex === index"
              :aria-label="`Actions for ${dropzone.name}`"
              aria-haspopup="menu"
              class="grid size-5 shrink-0 place-items-center rounded text-[var(--bitveins-shell-text-subtle)] opacity-0 hover:bg-[var(--bitveins-shell-border)] hover:text-[var(--bitveins-shell-text)] group-focus-within:opacity-100 group-hover:opacity-100 max-lg:opacity-100"
              :title="`Actions for ${dropzone.name}`"
              type="button"
              @click="actionsOpenIndex = actionsOpenIndex === index ? null : index"
            >
              <UIcon
                class="size-3"
                name="i-lucide-ellipsis"
              />
            </button>
          </div>

          <div
            v-if="actionsOpenIndex === index"
            class="absolute right-1 top-7 z-10 w-32 rounded border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)] p-1 shadow-lg"
            role="menu"
          >
            <button
              class="flex h-7 w-full items-center gap-1.5 rounded px-1.5 text-left text-[length:var(--bitveins-ui-caption-size)] text-rose-400 hover:bg-rose-500/10"
              role="menuitem"
              type="button"
              @click="deleteDestination(index)"
            >
              <UIcon
                class="size-3"
                name="i-lucide-trash-2"
              />
              Delete
            </button>
          </div>

          <div
            v-for="(upload, id) in dropzoneUploads"
            v-show="upload.destinationName === dropzone.name && upload.destinationPath === dropzone.path"
            :key="id"
            class="mt-1 px-1"
          >
            <div class="flex items-center justify-between gap-2 text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-subtle)]">
              <span class="min-w-0 flex-1 truncate">{{ upload.file }}</span>
              <span :class="{ 'text-rose-400': upload.status === 'error' }">
                {{ upload.status === 'error' ? upload.error : `${upload.progress}%` }}
              </span>
            </div>
            <div class="mt-0.5 h-0.5 overflow-hidden rounded-full bg-[var(--bitveins-shell-border)]">
              <div
                class="h-full transition-[width] duration-150"
                :class="upload.status === 'error' ? 'bg-rose-500' : 'bg-[var(--bitveins-shell-accent)]'"
                :style="{ width: `${upload.progress}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
