<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ExplorerTextDocument } from '~/types/explorer'

const props = defineProps<{
  document: ExplorerTextDocument
}>()

const previewUrl = ref('')
const loadError = ref(false)
let stopWatching: (() => void) | undefined

function revokePreview(): void {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function refreshPreview(): void {
  revokePreview()
  loadError.value = false
  previewUrl.value = URL.createObjectURL(new Blob(
    [props.document.content],
    { type: 'image/svg+xml' },
  ))
}

onMounted(() => {
  refreshPreview()
  stopWatching = watch(() => props.document.content, refreshPreview)
})

onBeforeUnmount(() => {
  stopWatching?.()
  revokePreview()
})
</script>

<template>
  <div
    class="flex h-full min-h-0 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_center,var(--bitveins-shell-border)_1px,transparent_1px)] bg-[size:18px_18px] p-6"
    data-svg-preview
  >
    <div
      v-if="loadError"
      class="flex flex-col items-center gap-3 rounded-md border border-rose-500/30 bg-[var(--bitveins-shell-panel-solid)] p-6 text-center"
      role="alert"
    >
      <UIcon
        name="i-lucide-image-off"
        class="size-8 text-rose-500"
      />
      <p class="text-sm">
        Unable to decode this SVG.
      </p>
      <UButton
        color="neutral"
        label="Retry"
        variant="subtle"
        @click="refreshPreview"
      />
    </div>
    <img
      v-else-if="previewUrl"
      :alt="document.name"
      class="block h-auto max-h-full w-auto max-w-full rounded-sm bg-[var(--bitveins-shell-panel-solid)] shadow-2xl"
      :src="previewUrl"
      @error="loadError = true"
    >
  </div>
</template>
