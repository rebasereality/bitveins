<script setup lang="ts">
import { computed } from 'vue'
import type { GitGraphRow } from '~/git/git-graph-layout'

const props = defineProps<{ row: GitGraphRow }>()
const laneGap = 16
const padding = 8
const connections = computed(() => {
  const unique = new Map<number, number>()
  for (const segment of props.row.segments) unique.set(segment.to, segment.color)
  return [...unique].map(([lane, color]) => ({ lane, color }))
})
const width = computed(() => padding * 2 + Math.max(1, props.row.laneCount) * laneGap)
</script>

<template>
  <svg
    aria-hidden="true"
    class="pointer-events-none absolute inset-y-0 left-2 z-10 h-full"
    :style="{ width: `${width}px` }"
  >
    <line
      v-for="connection in connections"
      :key="connection.lane"
      :x1="padding + connection.lane * laneGap"
      :x2="padding + connection.lane * laneGap"
      y1="0"
      y2="100%"
      :stroke="`var(--bitveins-git-${connection.color % 8})`"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
