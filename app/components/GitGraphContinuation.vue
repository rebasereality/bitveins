<script setup lang="ts">
import { computed } from 'vue'
import type { GitGraphRow } from '~/git/git-graph-layout'
import {
  GIT_GRAPH_LANE_GAP,
  GIT_GRAPH_PADDING,
  gitGraphWidth,
} from '~/git/git-graph-metrics'

const props = defineProps<{ row: GitGraphRow }>()
const connections = computed(() => {
  const unique = new Map<number, number>()
  for (const segment of props.row.segments) unique.set(segment.to, segment.color)
  return [...unique].map(([lane, color]) => ({ lane, color }))
})
const width = computed(() => gitGraphWidth(props.row.laneCount))
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
      :x1="GIT_GRAPH_PADDING + connection.lane * GIT_GRAPH_LANE_GAP"
      :x2="GIT_GRAPH_PADDING + connection.lane * GIT_GRAPH_LANE_GAP"
      y1="0"
      y2="100%"
      :stroke="`var(--bitveins-git-${connection.color % 8})`"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
