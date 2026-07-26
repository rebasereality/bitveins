<script setup lang="ts">
import type { InputMode, TmuxWindow } from '~/types/session'
import type { TerminalFileResolution } from '#shared/contracts/explorer'

interface TerminalPaneHandle {
  dispose(): void
  focus(): void
  sendInput(data: string): void
  sendReliableInput(data: string): boolean
  sendReliableInputs(data: readonly string[]): boolean
}

const TerminalPane = defineAsyncComponent(() => import('~/components/TerminalPane.vue'))

const props = defineProps<{
  active: boolean
  activeSession: string | null
  activeWindow: TmuxWindow | null
  inputMode: InputMode
  windows: TmuxWindow[]
  rememberedRoot?: string
}>()

const emit = defineEmits<{
  authExpired: []
  connectionChange: [connected: boolean]
  ready: []
  fileLinkActivate: [resolution: Exclude<TerminalFileResolution, { status: 'missing' }>]
}>()

const paneRef = ref<TerminalPaneHandle | null>(null)
const activePaneKey = computed(() => props.activeSession && props.activeWindow
  ? paneKey(props.activeSession, props.activeWindow)
  : null)

function paneKey(sessionName: string, window: Pick<TmuxWindow, 'id' | 'index'>): string {
  return `${sessionName}:${window.id}:${window.index}`
}

function activePane(): TerminalPaneHandle | undefined {
  return paneRef.value ?? undefined
}

async function attach(): Promise<void> {
  await nextTick()
  focus()
}

async function attachWindow(_sessionName: string, _windowIndex: number): Promise<void> {
  await nextTick()
  focus()
}

function detach(sessionName?: string): void {
  if (!sessionName || sessionName === props.activeSession) {
    activePane()?.dispose()
  }
}

function focus(): void {
  activePane()?.focus()
}

function sendInput(data: string): void {
  activePane()?.sendInput(data)
}

function sendReliableInput(data: string): boolean {
  return activePane()?.sendReliableInput(data) ?? false
}

function sendReliableInputs(data: readonly string[]): boolean {
  return activePane()?.sendReliableInputs(data) ?? false
}

defineExpose({
  attach,
  attachWindow,
  detach,
  focus,
  sendInput,
  sendReliableInput,
  sendReliableInputs,
})

watch(activePaneKey, () => {
  nextTick(focus)
}, { immediate: true })
</script>

<template>
  <section class="relative min-h-0 overflow-hidden bg-[var(--bitveins-terminal-bg)]">
    <TerminalPane
      v-if="activeSession && activeWindow && activePaneKey"
      :key="activePaneKey"
      ref="paneRef"
      :active="active"
      :input-mode="inputMode"
      :pane-key="activePaneKey"
      :session-name="activeSession"
      :window-index="activeWindow.index"
      :window-id="activeWindow.id"
      :window-name="activeWindow.name"
      :remembered-root="rememberedRoot"
      @auth-expired="emit('authExpired')"
      @connection-change="emit('connectionChange', $event)"
      @ready="emit('ready')"
      @file-link-activate="emit('fileLinkActivate', $event)"
    />
  </section>
</template>
