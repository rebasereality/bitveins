<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ExplorerImageDocument } from '~/types/explorer'

const props = defineProps<{
  document: ExplorerImageDocument
}>()

const scale = ref(1)
const fit = ref(true)
const dimensions = ref<{ width: number, height: number } | null>(null)
const loadError = ref(false)
const loadAttempt = ref(0)

const formattedSize = computed(() => {
  const units = ['B', 'KiB', 'MiB', 'GiB']
  let value = props.document.size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
})

function setScale(nextScale: number): void {
  scale.value = Math.min(8, Math.max(0.1, nextScale))
  fit.value = false
}

async function copyPath(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.document.path)
  }
  catch {
    alert('Unable to copy the image path.')
  }
}

function retryLoad(): void {
  loadError.value = false
  loadAttempt.value += 1
}

watch(() => props.document.path, () => {
  scale.value = 1
  fit.value = true
  dimensions.value = null
  loadError.value = false
  loadAttempt.value = 0
})
</script>

<template>
  <section class="flex h-full min-h-0 flex-col bg-[var(--bitveins-terminal-bg)] text-[var(--bitveins-shell-text)]">
    <div class="flex min-h-10 flex-wrap items-center gap-1.5 border-b border-[var(--bitveins-shell-border)] bg-[var(--bitveins-terminal-chrome)] px-2 py-1">
      <UButton
        icon="i-lucide-minus"
        size="xs"
        color="neutral"
        variant="subtle"
        title="Zoom out"
        @click="setScale(scale / 1.25)"
      />
      <button
        class="min-w-14 rounded px-2 py-1 text-xs text-[var(--bitveins-shell-text-muted)] hover:bg-[var(--bitveins-shell-panel-muted)]"
        type="button"
        title="Reset to 100%"
        @click="setScale(1)"
      >
        {{ Math.round(scale * 100) }}%
      </button>
      <UButton
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="subtle"
        title="Zoom in"
        @click="setScale(scale * 1.25)"
      />
      <UButton
        size="xs"
        color="neutral"
        :variant="fit ? 'solid' : 'subtle'"
        label="Fit"
        @click="fit = true"
      />
      <span class="ml-1 text-xs text-[var(--bitveins-shell-text-muted)]">
        <template v-if="dimensions">{{ dimensions.width }} × {{ dimensions.height }} · </template>{{ formattedSize }}
      </span>
      <span class="min-w-0 flex-1 truncate text-right font-mono text-xs text-[var(--bitveins-shell-text-subtle)]">
        {{ document.path }}
      </span>
      <UButton
        icon="i-lucide-copy"
        size="xs"
        color="neutral"
        variant="subtle"
        title="Copy relative path"
        @click="void copyPath()"
      />
      <UButton
        :to="document.previewUrl"
        external
        download
        icon="i-lucide-download"
        size="xs"
        color="neutral"
        variant="subtle"
        title="Download image"
      />
    </div>

    <div class="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_center,var(--bitveins-shell-border)_1px,transparent_1px)] bg-[size:18px_18px] p-6">
      <div class="flex min-h-full min-w-full items-center justify-center">
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
            Unable to decode this image.
          </p>
          <UButton
            color="neutral"
            variant="subtle"
            label="Retry"
            @click="retryLoad"
          />
        </div>
        <img
          v-else
          :key="`${document.previewUrl}:${loadAttempt}`"
          :alt="document.name"
          :src="document.previewUrl"
          class="block max-w-none rounded-sm bg-[var(--bitveins-shell-panel-solid)] shadow-2xl"
          :class="{ 'h-auto max-h-full w-auto max-w-full object-contain': fit }"
          :style="fit ? undefined : { width: `${dimensions ? dimensions.width * scale : 0}px` }"
          @load="dimensions = { width: ($event.target as HTMLImageElement).naturalWidth, height: ($event.target as HTMLImageElement).naturalHeight }"
          @error="loadError = true"
        >
      </div>
    </div>
  </section>
</template>
