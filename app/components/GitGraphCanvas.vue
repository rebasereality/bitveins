<script setup lang="ts">
import type { GitGraphRow } from '~/git/git-graph-layout'
import {
  GIT_GRAPH_LANE_GAP,
  GIT_GRAPH_PADDING,
  gitGraphWidth,
} from '~/git/git-graph-metrics'
import { gitGraphSpline } from '~/git/git-graph-spline'

interface RowPosition {
  bottom: number
  node: number
  top: number
}

const props = defineProps<{ rows: GitGraphRow[] }>()
const root = ref<HTMLDivElement | null>(null)
const positions = shallowRef<RowPosition[]>([])
const height = ref(0)
let resizeObserver: ResizeObserver | null = null

const laneCount = computed(() => Math.max(1, ...props.rows.map(row => row.laneCount)))
const width = computed(() => gitGraphWidth(laneCount.value))
const x = (lane: number) => GIT_GRAPH_PADDING + lane * GIT_GRAPH_LANE_GAP
const color = (index: number) => `var(--bitveins-git-${index % 8})`

const connections = computed(() => props.rows.flatMap((row, rowIndex) => {
  const position = positions.value[rowIndex]
  if (!position) return []
  const nextTop = positions.value[rowIndex + 1]?.top ?? position.bottom
  return row.segments.map((segment, segmentIndex) => {
    const startY = segment.kind === 'outgoing' ? position.node : position.top
    const path = gitGraphSpline(x(segment.from), startY, x(segment.to), position.bottom)
    return {
      color: color(segment.color),
      d: nextTop > position.bottom ? `${path} V ${nextTop}` : path,
      key: `${row.commit.hash}:${segment.kind}:${segment.from}:${segment.to}:${segmentIndex}`,
      kind: segment.kind,
    }
  })
}))

function measure(): void {
  const element = root.value
  if (!element) return
  const rootRect = element.getBoundingClientRect()
  const buttons = [...element.querySelectorAll<HTMLElement>('[data-git-commit]')]
  positions.value = buttons.map((button) => {
    const rect = button.getBoundingClientRect()
    const top = rect.top - rootRect.top
    return {
      bottom: rect.bottom - rootRect.top,
      node: top + rect.height / 2,
      top,
    }
  })
  height.value = Math.ceil(rootRect.height)
}

function scheduleMeasure(): void {
  requestAnimationFrame(measure)
}

onMounted(() => {
  resizeObserver = new ResizeObserver(scheduleMeasure)
  if (root.value) resizeObserver.observe(root.value)
  scheduleMeasure()
})

onBeforeUnmount(() => resizeObserver?.disconnect())
watch(() => props.rows.map(row => row.commit.hash).join(','), scheduleMeasure, { flush: 'post' })
</script>

<template>
  <div
    ref="root"
    class="relative"
    data-git-graph-rows
  >
    <svg
      aria-label="Commit graph"
      class="pointer-events-none absolute left-2 top-0 z-[1] overflow-visible"
      :height="height"
      :style="{ width: `${width}px` }"
      :viewBox="`0 0 ${width} ${height}`"
    >
      <path
        v-for="connection in connections"
        :key="connection.key"
        :data-segment-kind="connection.kind"
        :d="connection.d"
        fill="none"
        :stroke="connection.color"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      <path
        v-for="(row, index) in rows"
        :key="`incoming:${row.commit.hash}`"
        :d="positions[index] ? `M ${x(row.lane)} ${positions[index]!.top} V ${positions[index]!.node}` : ''"
        fill="none"
        :stroke="color(row.color)"
        stroke-linecap="round"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      <circle
        v-for="(row, index) in rows"
        :key="`node:${row.commit.hash}`"
        :cx="x(row.lane)"
        :cy="positions[index]?.node || 0"
        fill="var(--bitveins-terminal-bg)"
        r="4.25"
        :stroke="color(row.color)"
        stroke-width="2.5"
        vector-effect="non-scaling-stroke"
      />
    </svg>
    <slot />
  </div>
</template>
