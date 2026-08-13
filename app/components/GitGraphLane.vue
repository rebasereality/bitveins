<script setup lang="ts">
import { computed } from 'vue'
import type { GitGraphRow } from '~/git/git-graph-layout'
import {
  GIT_GRAPH_LANE_GAP,
  GIT_GRAPH_PADDING,
  GIT_GRAPH_ROW_HEIGHT,
  gitGraphWidth,
} from '~/git/git-graph-metrics'

const props = defineProps<{ row: GitGraphRow }>()
const centerY = GIT_GRAPH_ROW_HEIGHT / 2
const rowTop = -1
const rowBottom = GIT_GRAPH_ROW_HEIGHT + 1

const width = computed(() => gitGraphWidth(props.row.laneCount))
const x = (lane: number) => GIT_GRAPH_PADDING + lane * GIT_GRAPH_LANE_GAP
const color = (index: number) => `var(--bitveins-git-${index % 8})`

function path(from: number, to: number, outgoing: boolean): string {
  const startY = outgoing ? centerY : rowTop
  const startX = x(from)
  const endX = x(to)
  if (startX === endX) return `M ${startX} ${startY} V ${rowBottom}`

  if (outgoing) {
    const departureX = startX + (endX - startX) / 2
    return `M ${startX} ${startY} C ${departureX} ${startY}, ${endX} ${startY}, ${endX} ${rowBottom}`
  }

  return `M ${startX} ${startY} C ${startX} ${centerY}, ${endX} ${centerY}, ${endX} ${rowBottom}`
}
</script>

<template>
  <svg
    :aria-label="`Commit graph lane ${row.lane + 1}`"
    class="block h-[34px] shrink-0 overflow-visible"
    :style="{ width: `${width}px` }"
    :viewBox="`0 0 ${width} ${GIT_GRAPH_ROW_HEIGHT}`"
  >
    <path
      v-for="(segment, index) in row.segments"
      :key="`${segment.kind}-${segment.from}-${segment.to}-${index}`"
      fill="none"
      :d="path(segment.from, segment.to, segment.kind === 'outgoing')"
      :stroke="color(segment.color)"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    />
    <line
      :x1="x(row.lane)"
      :x2="x(row.lane)"
      :y1="rowTop"
      :y2="centerY"
      :stroke="color(row.color)"
      stroke-linecap="round"
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
