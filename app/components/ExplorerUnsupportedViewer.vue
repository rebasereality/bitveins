<script setup lang="ts">
import { computed } from 'vue'
import type { ExplorerBinaryDocument } from '~/types/explorer'

const props = defineProps<{
  document: ExplorerBinaryDocument
}>()

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
</script>

<template>
  <div class="flex h-full items-center justify-center bg-[var(--bitveins-terminal-bg)] p-6 text-center">
    <div class="max-w-sm">
      <UIcon
        class="mx-auto size-10 text-[var(--bitveins-shell-text-subtle)]"
        name="i-lucide-file-question"
      />
      <p class="mt-3 text-sm font-medium text-[var(--bitveins-shell-text)]">
        No preview available
      </p>
      <p class="mt-1 text-xs text-[var(--bitveins-shell-text-muted)]">
        {{ document.name }} · {{ formattedSize }}
      </p>
      <p class="mt-3 text-xs text-[var(--bitveins-shell-text-subtle)]">
        You can still download this file from the toolbar.
      </p>
    </div>
  </div>
</template>
