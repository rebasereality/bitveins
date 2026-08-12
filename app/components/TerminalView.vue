<script setup lang="ts">
import type { TmuxPane, TmuxWindow } from '#shared/contracts/terminal'
import type { TerminalFileResolution } from '#shared/contracts/explorer'
import type { InputMode } from '~/types/session'

interface TerminalPaneHandle {
  dispose(): void
  fitAndResize(): void
  focus(): void
  sendInput(data: string): void
  sendReliableInput(data: string): boolean
  sendReliableInputs(data: readonly string[]): boolean
}

interface PaneSeparator {
  dimension: 'height' | 'width'
  id: string
  length: number
  orientation: 'horizontal' | 'vertical'
  paneId: string
  position: number
  size: number
  start: number
  windowSize: number
}

interface ResizeGesture {
  deltaPixels: number
  initialSize: number
  pointerId: number
  separator: PaneSeparator
  size: number
  startClient: number
  unitPixels: number
}

const TerminalPane = defineAsyncComponent(() => import('~/components/TerminalPane.vue'))

const props = defineProps<{
  active: boolean
  activeSession: string | null
  activeWindow: TmuxWindow | null
  inputMode: InputMode
  rememberedRoot?: string
}>()

const emit = defineEmits<{
  authExpired: []
  connectionChange: [connected: boolean]
  fileLinkActivate: [resolution: Exclude<TerminalFileResolution, { status: 'missing' }>]
  panesChange: []
  focusedPaneChange: [paneId: string | null]
  ready: []
}>()

const sessionName = computed(() => props.activeSession)
const activeWindow = computed(() => props.activeWindow)
const { close, error, panes, refresh, resize, select, split } = useTmuxPanes(sessionName, activeWindow)
const focusedPaneId = ref<string | null>(null)
const paneConnections = reactive(new Map<string, boolean>())
const paneRefs = new Map<string, TerminalPaneHandle>()
const resizeGesture = ref<ResizeGesture | null>(null)
const workspaceHost = ref<HTMLElement | null>(null)

const separators = computed<PaneSeparator[]>(() => panes.value.flatMap((pane) => {
  const result: PaneSeparator[] = []
  if (pane.left + pane.width < pane.windowWidth) {
    result.push({
      dimension: 'width',
      id: `${pane.id}:right`,
      length: pane.height / pane.windowHeight,
      orientation: 'vertical',
      paneId: pane.id,
      position: (pane.left + pane.width + 0.5) / pane.windowWidth,
      size: pane.width,
      start: pane.top / pane.windowHeight,
      windowSize: pane.windowWidth,
    })
  }
  if (pane.top + pane.height < pane.windowHeight) {
    result.push({
      dimension: 'height',
      id: `${pane.id}:bottom`,
      length: pane.width / pane.windowWidth,
      orientation: 'horizontal',
      paneId: pane.id,
      position: (pane.top + pane.height + 0.5) / pane.windowHeight,
      size: pane.height,
      start: pane.left / pane.windowWidth,
      windowSize: pane.windowHeight,
    })
  }
  return result
}))

function paneKey(pane: TmuxPane): string {
  return `${props.activeSession}:${props.activeWindow?.id}:${pane.id}`
}

function paneStyle(pane: TmuxPane): Record<string, string> {
  return {
    left: `${(pane.left / pane.windowWidth) * 100}%`,
    top: `${(pane.top / pane.windowHeight) * 100}%`,
    width: `${(pane.width / pane.windowWidth) * 100}%`,
    height: `${(pane.height / pane.windowHeight) * 100}%`,
  }
}

function separatorStyle(separator: PaneSeparator): Record<string, string> {
  const activeGesture = resizeGesture.value?.separator.id === separator.id
    ? resizeGesture.value
    : null
  const transform = activeGesture?.deltaPixels ?? 0
  return separator.orientation === 'vertical'
    ? {
        height: `${separator.length * 100}%`,
        left: `${separator.position * 100}%`,
        top: `${separator.start * 100}%`,
        transform: `translateX(calc(-50% + ${transform}px))`,
        width: '9px',
      }
    : {
        height: '9px',
        left: `${separator.start * 100}%`,
        top: `${separator.position * 100}%`,
        transform: `translateY(calc(-50% + ${transform}px))`,
        width: `${separator.length * 100}%`,
      }
}

function clampPaneSize(separator: PaneSeparator, size: number): number {
  return Math.max(2, Math.min(separator.windowSize - 2, size))
}

function beginResize(separator: PaneSeparator, event: PointerEvent): void {
  const host = workspaceHost.value
  const target = event.currentTarget as HTMLElement | null
  if (!host || !target) return
  const rect = host.getBoundingClientRect()
  const hostPixels = separator.orientation === 'vertical' ? rect.width : rect.height
  resizeGesture.value = {
    deltaPixels: 0,
    initialSize: separator.size,
    pointerId: event.pointerId,
    separator,
    size: separator.size,
    startClient: separator.orientation === 'vertical' ? event.clientX : event.clientY,
    unitPixels: hostPixels / separator.windowSize,
  }
  target.setPointerCapture(event.pointerId)
  focusPane(separator.paneId)
}

function moveResize(event: PointerEvent): void {
  const gesture = resizeGesture.value
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const current = gesture.separator.orientation === 'vertical' ? event.clientX : event.clientY
  const deltaCells = Math.round((current - gesture.startClient) / gesture.unitPixels)
  gesture.size = clampPaneSize(gesture.separator, gesture.initialSize + deltaCells)
  gesture.deltaPixels = (gesture.size - gesture.initialSize) * gesture.unitPixels
}

async function finishResize(event: PointerEvent, canceled = false): Promise<void> {
  const gesture = resizeGesture.value
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const target = event.currentTarget as HTMLElement | null
  if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  resizeGesture.value = null
  if (canceled || gesture.size === gesture.initialSize) return
  await resize(gesture.separator.paneId, gesture.separator.dimension, gesture.size)
  emit('panesChange')
  await nextTick()
  focus()
}

async function resizeWithKeyboard(separator: PaneSeparator, event: KeyboardEvent): Promise<void> {
  const delta = separator.orientation === 'vertical'
    ? event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    : event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (delta === 0) return
  event.preventDefault()
  await resize(separator.paneId, separator.dimension, clampPaneSize(separator, separator.size + delta))
  emit('panesChange')
}

function setPaneRef(paneId: string, value: unknown): void {
  if (value) paneRefs.set(paneId, value as TerminalPaneHandle)
  else paneRefs.delete(paneId)
}

function targetPane(): TerminalPaneHandle | undefined {
  return focusedPaneId.value ? paneRefs.get(focusedPaneId.value) : undefined
}

function focus(): void {
  targetPane()?.focus()
}

function focusPane(paneId: string): void {
  if (focusedPaneId.value !== paneId) {
    focusedPaneId.value = paneId
    void select(paneId)
  }
  nextTick(focus)
}

async function focusPaneById(paneId: string): Promise<boolean> {
  await refresh()
  if (!panes.value.some(pane => pane.id === paneId)) return false
  focusPane(paneId)
  await nextTick()
  return true
}

async function splitWindow(direction: 'horizontal' | 'vertical'): Promise<void> {
  const paneId = focusedPaneId.value
  if (!paneId) return
  await split(paneId, direction)
  focusedPaneId.value = panes.value.find(pane => pane.active)?.id ?? panes.value.at(-1)?.id ?? null
  emit('panesChange')
  await nextTick()
  focus()
}

async function closePane(paneId: string): Promise<void> {
  await close(paneId)
  if (!panes.value.some(pane => pane.id === focusedPaneId.value)) {
    focusedPaneId.value = panes.value.find(pane => pane.active)?.id ?? panes.value[0]?.id ?? null
  }
  emit('panesChange')
  await nextTick()
  focus()
}

async function attach(): Promise<void> {
  await refresh()
  await nextTick()
  focus()
}

async function attachWindow(_sessionName: string, _windowIndex: number): Promise<void> {
  await refresh()
  await nextTick()
  focus()
}

function detach(session?: string): void {
  if (session && session !== props.activeSession) return
  for (const pane of paneRefs.values()) pane.dispose()
  paneRefs.clear()
}

function setConnection(paneId: string, connected: boolean): void {
  paneConnections.set(paneId, connected)
  if (paneId === focusedPaneId.value) emit('connectionChange', connected)
}

defineExpose({
  attach,
  attachWindow,
  detach,
  focus,
  focusPane: focusPaneById,
  sendInput: (data: string) => targetPane()?.sendInput(data),
  sendReliableInput: (data: string) => targetPane()?.sendReliableInput(data) ?? false,
  sendReliableInputs: (data: readonly string[]) => targetPane()?.sendReliableInputs(data) ?? false,
  splitWindow,
})

watch(panes, (nextPanes) => {
  for (const paneId of paneConnections.keys()) {
    if (!nextPanes.some(pane => pane.id === paneId)) paneConnections.delete(paneId)
  }
  if (!nextPanes.some(pane => pane.id === focusedPaneId.value)) {
    focusedPaneId.value = nextPanes.find(pane => pane.active)?.id ?? nextPanes[0]?.id ?? null
  }
}, { immediate: true })

watch(focusedPaneId, (paneId) => {
  emit('connectionChange', paneId ? paneConnections.get(paneId) ?? false : false)
  emit('focusedPaneChange', paneId)
})
</script>

<template>
  <section
    ref="workspaceHost"
    class="relative min-h-0 overflow-hidden bg-[var(--bitveins-terminal-bg)]"
  >
    <div
      v-for="pane in panes"
      :key="paneKey(pane)"
      :aria-label="`Tmux pane ${pane.index + 1}`"
      class="absolute overflow-hidden bg-[var(--bitveins-terminal-bg)]"
      :class="{ 'tmux-pane--focused': panes.length > 1 && focusedPaneId === pane.id }"
      :data-focused="focusedPaneId === pane.id"
      :data-pane-id="pane.id"
      data-tmux-pane
      role="group"
      :style="paneStyle(pane)"
      @pointerdown.capture="focusPane(pane.id)"
    >
      <TerminalPane
        :ref="value => setPaneRef(pane.id, value)"
        :active="active"
        :application="pane.application"
        :focused="focusedPaneId === pane.id"
        :input-mode="inputMode"
        :pane="pane"
        :pane-key="paneKey(pane)"
        :remembered-root="rememberedRoot"
        :session-name="activeSession!"
        :window-id="activeWindow!.id"
        :window-index="activeWindow!.index"
        :window-name="activeWindow!.name"
        @auth-expired="emit('authExpired')"
        @connection-change="setConnection(pane.id, $event)"
        @file-link-activate="emit('fileLinkActivate', $event)"
        @ready="emit('ready')"
      />

      <UButton
        v-if="panes.length > 1"
        :aria-label="`Close tmux pane ${pane.index + 1}`"
        class="absolute right-1 top-1 z-30 size-5 bg-[var(--bitveins-shell-panel-solid)]/80 p-0 opacity-70 hover:opacity-100"
        color="neutral"
        icon="i-lucide-x"
        size="xs"
        :title="`Close pane ${pane.index + 1}`"
        variant="ghost"
        @click.stop="void closePane(pane.id)"
      />
    </div>

    <div
      v-for="separator in separators"
      :key="separator.id"
      :aria-label="`Resize tmux pane ${separator.paneId}`"
      :aria-orientation="separator.orientation"
      :aria-valuemax="separator.windowSize - 2"
      aria-valuemin="2"
      :aria-valuenow="separator.size"
      class="group absolute z-20 touch-none select-none outline-none focus-visible:ring-1 focus-visible:ring-[var(--bitveins-shell-accent)]"
      :class="separator.orientation === 'vertical' ? 'cursor-col-resize' : 'cursor-row-resize'"
      data-pane-resizer
      :data-orientation="separator.orientation"
      role="separator"
      :style="separatorStyle(separator)"
      tabindex="0"
      @keydown="void resizeWithKeyboard(separator, $event)"
      @pointercancel.stop="void finishResize($event, true)"
      @pointerdown.stop.prevent="beginResize(separator, $event)"
      @pointermove.stop.prevent="moveResize"
      @pointerup.stop.prevent="void finishResize($event)"
    >
      <span
        class="absolute bg-[var(--bitveins-shell-border-strong)] transition-colors group-hover:bg-[var(--bitveins-shell-accent)] group-focus-visible:bg-[var(--bitveins-shell-accent)]"
        :class="separator.orientation === 'vertical'
          ? 'left-1/2 top-0 h-full w-px -translate-x-1/2'
          : 'left-0 top-1/2 h-px w-full -translate-y-1/2'"
      />
    </div>

    <div
      v-if="error"
      aria-live="polite"
      class="absolute bottom-2 left-2 z-40 rounded border border-red-500/40 bg-[var(--bitveins-shell-panel-solid)] px-3 py-2 text-xs text-red-400"
      data-pane-error
    >
      {{ error }}
    </div>
  </section>
</template>

<style scoped>
.tmux-pane--focused {
  box-shadow: inset 0 0 0 1px var(--bitveins-shell-accent);
}
</style>
