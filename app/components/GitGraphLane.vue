<script setup lang="ts">
import { computed } from 'vue'
import type { GitGraphRow } from '~/git/git-graph-layout'

const props = defineProps<{ row: GitGraphRow }>()
const laneGap = 16
const padding = 8
const rowHeight = 34
const centerY = rowHeight / 2

const width = computed(() => padding * 2 + Math.max(1, props.row.laneCount) * laneGap)
const x = (lane: number) => padding + lane * laneGap
const color = (index: number) => `var(--bitveins-git-${index % 8})`

function path(from: number, to: number, outgoing: boolean): string {
  const startY = outgoing ? centerY : 0
  const startX = x(from)
  const endX = x(to)
  return `M ${startX} ${startY} C ${startX} ${centerY}, ${endX} ${centerY}, ${endX} ${rowHeight}`
}
</script>

<template>
  <svg
    :aria-label="`Commit graph lane ${row.lane + 1}`"
    class="block h-[34px] shrink-0 overflow-visible"
    :style="{ width: `${width}px` }"
    :viewBox="`0 0 ${width} ${rowHeight}`"
  >
    <path
      v-for="(segment, index) in row.segments"
      :key="`${segment.kind}-${segment.from}-${segment.to}-${index}`"
      fill="none"
      :d="path(segment.from, segment.to, segment.kind === 'outgoing')"
      :stroke="color(segment.color)"
      stroke-linecap="round"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
    <line
      :x1="x(row.lane)"
      :x2="x(row.lane)"
      y1="0"
      :y2="centerY"
      :stroke="color(row.color)"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
    <circle
      :cx="x(row.lane)"
      :cy="centerY"
      fill="var(--bitveins-terminal-bg)"
      r="4.25"
      :stroke="color(row.color)"
      stroke-width="2.5"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
