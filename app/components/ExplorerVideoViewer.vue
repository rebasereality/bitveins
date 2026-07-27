<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ExplorerVideoDocument } from '~/types/explorer'

const props = defineProps<{
  document: ExplorerVideoDocument
}>()

const loadError = ref(false)
const retryKey = ref(0)

function retryLoad(): void {
  loadError.value = false
  retryKey.value += 1
}

watch(() => props.document.path, () => {
  loadError.value = false
  retryKey.value = 0
})
</script>

<template>
  <div
    class="flex h-full min-h-0 items-center justify-center overflow-auto bg-black p-3 sm:p-6"
    data-video-preview
  >
    <div
      v-if="loadError"
      class="flex flex-col items-center gap-3 rounded-md border border-rose-500/30 bg-[var(--bitveins-shell-panel-solid)] p-6 text-center text-[var(--bitveins-shell-text)]"
      role="alert"
    >
      <UIcon
        name="i-lucide-video-off"
        class="size-8 text-rose-500"
      />
      <div>
        <p class="text-sm font-medium">
          Unable to play this video.
        </p>
        <p class="mt-1 text-xs text-[var(--bitveins-shell-text-muted)]">
          Its container is recognized, but this browser may not support its codecs.
        </p>
      </div>
      <UButton
        color="neutral"
        label="Retry"
        variant="subtle"
        @click="retryLoad"
      />
    </div>
    <video
      v-else
      :key="`${document.streamUrl}:${retryKey}`"
      class="max-h-full max-w-full bg-black"
      controls
      playsinline
      preload="metadata"
      :src="document.streamUrl"
      @error="loadError = true"
    />
  </div>
</template>
