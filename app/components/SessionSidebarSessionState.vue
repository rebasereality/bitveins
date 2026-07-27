<script setup lang="ts">
defineProps<{
  isMobile?: boolean
  loading: boolean
}>()

const skeletonWidths = ['w-3/5', 'w-4/5', 'w-2/5']
</script>

<template>
  <div
    v-if="loading"
    aria-label="Loading tmux sessions"
    aria-live="polite"
    class="flex flex-col"
    data-session-loading
    role="status"
  >
    <div
      v-for="width in skeletonWidths"
      :key="width"
      class="flex items-center px-1.5"
      :class="isMobile ? 'h-9' : 'h-6'"
    >
      <span
        aria-hidden="true"
        class="h-1.5 animate-pulse rounded-full bg-[var(--bitveins-shell-panel-muted)]"
        :class="width"
      />
    </div>
  </div>

  <div
    v-else
    class="flex items-center gap-1.5 px-1.5 text-[length:var(--bitveins-ui-micro-size)] text-[var(--bitveins-shell-text-subtle)]"
    :class="isMobile ? 'h-9' : 'h-6'"
    data-session-empty
  >
    <span
      aria-hidden="true"
      class="size-1 shrink-0 rounded-full border border-current opacity-60"
    />
    <span>No sessions yet</span>
  </div>
</template>
