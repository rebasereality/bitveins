<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type { IDisposable, ITheme } from '@xterm/xterm'
import type {
  TerminalFileReference,
  TerminalFileResolution,
} from '#shared/contracts/explorer'
import type { InputMode } from '~/types/session'
import { TerminalFileLinkProvider } from '~/terminal/file-link-provider'
import { createTerminalInputRouter } from '~/terminal/terminal-input-router'
import { createTerminalOutputNormalizer } from '~/terminal/terminal-output-normalizer'
import { terminalThemeForAccent } from '~/terminal/terminal-theme'
import { parseSelectedFileReferences } from '~/utils/file-reference-parser'
import { suppressMobileTerminalKeyboard } from '~/utils/mobile-terminal-input'
import { buildUploadDestinationPath } from '~/utils/upload-path'

const props = defineProps<{
  active: boolean
  application?: 'hermes'
  inputMode: InputMode
  paneKey: string
  sessionName: string
  windowIndex: number
  windowId: string
  windowName?: string
  rememberedRoot?: string
}>()

const emit = defineEmits<{
  authExpired: []
  connectionChange: [connected: boolean]
  ready: []
  fileLinkActivate: [resolution: Exclude<TerminalFileResolution, { status: 'missing' }>]
}>()

const terminalHost = ref<HTMLElement | null>(null)
const terminal = shallowRef<Terminal | null>(null)
const fitAddon = shallowRef<FitAddon | null>(null)
const colorMode = useColorMode()
const { accentColor, terminalFontSize } = useAppearanceSettings()
const ready = ref(true)
let terminalDataDisposable: IDisposable | null = null
let terminalBinaryDisposable: IDisposable | null = null
let terminalSelectionDisposable: IDisposable | null = null
let terminalFileLinkDisposable: IDisposable | null = null
let terminalFileLinkProvider: TerminalFileLinkProvider | null = null
let terminalResizeObserver: ResizeObserver | null = null
let disposed = false

const activeSession = computed(() => props.sessionName)
const active = computed(() => props.active)
const inputMode = computed(() => props.inputMode)
const isLightTheme = computed(() => colorMode.value === 'light')
const terminalOutputNormalizer = createTerminalOutputNormalizer(
  () => props.application === 'hermes',
)

const terminalTheme = computed<ITheme>(() => terminalThemeForAccent(
  isLightTheme.value ? 'light' : 'dark',
  accentColor.value,
))

const terminalSocket = useTerminalSocket({
  activeSession,
  active,
  bufferInitialOutput: true,
  emitAuthExpired: () => emit('authExpired'),
  fitAddon,
  inputMode,
  normalizeOutput: terminalOutputNormalizer.normalize,
  promptRecoveryKey: props.paneKey,
  resetOutput: terminalOutputNormalizer.reset,
  terminal,
  onStdout: () => {
    emit('ready')
  },
})
const terminalSelection = useTerminalSelection({
  terminal,
  terminalHost,
})
const {
  applyInputMode,
  attachWindow,
  connectionState,
  dispose: disposeSocket,
  fitAndResize,
  pendingReliableCount,
  sendInput,
  sendReliableInput,
  sendReliableInputs,
  sendWheelInput,
  status,
} = terminalSocket
const terminalInputRouter = createTerminalInputRouter({
  enableStdin: () => {
    if (terminal.value) terminal.value.options.disableStdin = false
  },
  inputMode: () => props.inputMode,
  isActive: () => props.active,
  isAsyncWheelEnabled: () => connectionState.value === 'attached',
  isMouseTrackingEnabled: () => terminal.value?.modes.mouseTrackingMode !== 'none',
  restoreInputMode: applyInputMode,
  sendInput,
  sendWheelInput,
})
const {
  copyIcon,
  copySelection,
  copyState,
  exitSelectMode,
  hasSelection,
  onSelectionChange,
  onTerminalClick,
  onTerminalContextMenu,
  onTerminalKey,
  onTerminalPointerCancel,
  onTerminalPointerDown,
  onTerminalPointerMove,
  onTerminalPointerUp,
  selectedText,
  selectMode,
} = terminalSelection

async function resolveFileReferences(
  references: TerminalFileReference[],
): Promise<TerminalFileResolution[]> {
  const response = await $fetch<{ resolutions: TerminalFileResolution[] }>(
    `/api/sessions/${encodeURIComponent(props.sessionName)}/files/resolve`,
    {
      method: 'POST',
      body: {
        windowId: props.windowId,
        rememberedRoot: props.rememberedRoot,
        references,
      },
    },
  )
  return response.resolutions
}

const selectedFileReferences = computed(() => parseSelectedFileReferences(selectedText.value))
const hasSelectedFileReference = computed(() => selectedFileReferences.value.length > 0)

async function openSelectedFileReference(): Promise<void> {
  try {
    const references = selectedFileReferences.value
    if (references.length === 0) return
    const resolutions = await resolveFileReferences(references)
    const resolution = resolutions.find(candidate => candidate.status !== 'missing')
    if (resolution) {
      emit('fileLinkActivate', resolution)
      exitSelectMode()
    }
  }
  catch (error: unknown) {
    console.warn('Unable to resolve the selected terminal path.', error)
  }
}

function focus(): void {
  if (props.active && isDesktopViewport()) {
    terminal.value?.focus()
  }
}

function isDesktopViewport(): boolean {
  return import.meta.client && window.matchMedia('(min-width: 1024px)').matches
}

function resolvedTerminalFontSize(): number {
  return terminalFontSize.value
}

function applyTerminalFontSize(): void {
  if (!terminal.value) return
  terminal.value.options.fontSize = resolvedTerminalFontSize()
  if (props.active) nextTick(fitAndResize)
}

function applyTerminalTheme(): void {
  const term = terminal.value

  if (!term) {
    return
  }

  term.options.theme = { ...terminalTheme.value }
}

async function warmPane(): Promise<void> {
  if (disposed) {
    return
  }

  let liveStarted = false
  const snapshotPromise = writeSnapshot(() => liveStarted)

  await Promise.race([
    snapshotPromise,
    new Promise(resolve => window.setTimeout(resolve, 180)),
  ])

  liveStarted = true

  if (disposed) {
    return
  }

  attachWindow(props.sessionName, props.windowIndex)
}

async function writeSnapshot(isLiveStarted: () => boolean): Promise<void> {
  const term = terminal.value

  if (!term) {
    return
  }

  try {
    const rows = Math.max(16, term.rows * 2)
    const data = await $fetch<{ data: string }>(`/api/sessions/${encodeURIComponent(props.sessionName)}/windows/${props.windowIndex}/snapshot`, {
      query: { lines: rows },
    })

    if (disposed || isLiveStarted()) {
      return
    }

    term.clear()
    term.write('\x1b[2J\x1b[3J\x1b[H')
    term.write(terminalOutputNormalizer.normalize(data.data || ''))
  }
  catch {
    if (!disposed && !isLiveStarted()) {
      term.clear()
    }
  }
}

const { uploadFile } = useFileUploadOverlay()

async function onTerminalPaste(event: ClipboardEvent): Promise<void> {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
    if (!target.classList.contains('xterm-helper-textarea')) {
      return
    }
  }

  const clipboardData = event.clipboardData
  if (!clipboardData) return

  const files: File[] = []
  if (clipboardData.files && clipboardData.files.length > 0) {
    files.push(...Array.from(clipboardData.files))
  }
  else if (clipboardData.items) {
    for (const item of Array.from(clipboardData.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }

  if (files.length === 0) {
    const pastedText = clipboardData.getData('text/plain') || clipboardData.getData('text')
    if (pastedText) {
      event.preventDefault()
      event.stopPropagation()
      sendInput(pastedText)
    }
    return
  }

  event.preventDefault()
  event.stopPropagation()

  const destPath = buildUploadDestinationPath(props.sessionName, props.windowName || `window_${props.windowIndex}`)

  for (const file of files) {
    try {
      const uploadedPath = await uploadFile(file, destPath)
      sendInput(uploadedPath)
    }
    catch (err) {
      console.error('Failed to upload pasted file in terminal:', err)
    }
  }
}

function dispose(): void {
  if (disposed) {
    return
  }

  disposed = true
  window.removeEventListener('resize', applyTerminalFontSize)
  terminalHost.value?.removeEventListener('paste', onTerminalPaste)
  terminalBinaryDisposable?.dispose()
  terminalDataDisposable?.dispose()
  terminalSelectionDisposable?.dispose()
  terminalFileLinkDisposable?.dispose()
  terminalFileLinkProvider?.dispose()
  terminalResizeObserver?.disconnect()
  terminalInputRouter.dispose()
  terminalSelection.dispose()
  disposeSocket()
  terminal.value?.dispose()
}

defineExpose({
  dispose,
  focus,
  sendInput,
  sendReliableInput,
  sendReliableInputs,
})

onMounted(async () => {
  if (!terminalHost.value) {
    return
  }

  const term = new Terminal({
    allowProposedApi: false,
    convertEol: true,
    cursorBlink: false,
    disableStdin: props.inputMode !== 'live' || !props.active,
    fontFamily: '"JetBrains Mono", "SFMono-Regular", "Cascadia Code", monospace',
    fontSize: resolvedTerminalFontSize(),
    letterSpacing: 0,
    lineHeight: 1.18,
    rightClickSelectsWord: true,
    scrollback: 8000,
    theme: { ...terminalTheme.value },
  })
  const fit = new FitAddon()

  term.loadAddon(fit)
  terminalBinaryDisposable = term.onBinary(terminalInputRouter.onBinary)
  terminalDataDisposable = term.onData(terminalInputRouter.onData)
  terminalSelectionDisposable = term.onSelectionChange(onSelectionChange)
  term.attachCustomKeyEventHandler(onTerminalKey)
  term.attachCustomWheelEventHandler(terminalInputRouter.onWheel)
  term.open(terminalHost.value)
  if (!isDesktopViewport()) suppressMobileTerminalKeyboard(terminalHost.value)
  terminal.value = term
  fitAddon.value = fit
  terminalFileLinkProvider = new TerminalFileLinkProvider({
    terminal: term,
    cacheScope: () => props.rememberedRoot || '',
    resolve: resolveFileReferences,
    activate: resolution => emit('fileLinkActivate', resolution),
  })
  terminalFileLinkDisposable = term.registerLinkProvider(terminalFileLinkProvider)

  await nextTick()
  applyInputMode()
  fitAndResize()
  terminalResizeObserver = new ResizeObserver(() => {
    if (props.active) fitAndResize()
  })
  terminalResizeObserver.observe(terminalHost.value)
  terminalSelection.mount()
  window.addEventListener('resize', applyTerminalFontSize)
  terminalHost.value.addEventListener('paste', onTerminalPaste)
  void warmPane()
})

watch(terminalTheme, () => {
  applyTerminalTheme()
})

watch(terminalFontSize, applyTerminalFontSize)

watch(connectionState, state => emit('connectionChange', state === 'attached'), { immediate: true })

watch(
  () => [props.inputMode, props.active] as const,
  () => {
    applyInputMode()

    if (props.active && isDesktopViewport()) {
      nextTick(() => {
        fitAndResize()
        focus()
      })
    }
  },
  { flush: 'post' },
)

onBeforeUnmount(() => {
  dispose()
})
</script>

<template>
  <section
    class="absolute inset-0 min-h-0 overflow-hidden bg-[var(--bitveins-terminal-bg)] transition-opacity duration-100"
    :class="active ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'"
    :data-connection-state="connectionState"
    :data-select-mode="selectMode"
  >
    <div
      v-if="selectMode"
      class="absolute right-2 top-2 z-30 hidden items-center gap-1 rounded-md border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel)] p-1 shadow-lg shadow-black/20 backdrop-blur max-lg:flex"
      data-select-toolbar
      @pointerdown.stop
    >
      <UButton
        v-if="hasSelectedFileReference"
        color="neutral"
        icon="i-lucide-folder-open"
        size="xs"
        square
        title="Open selected path in Explorer"
        type="button"
        variant="subtle"
        @click="void openSelectedFileReference()"
      />
      <UButton
        :color="copyState === 'error' ? 'error' : copyState === 'copied' ? 'primary' : 'neutral'"
        :disabled="!hasSelection"
        :icon="copyIcon"
        size="xs"
        square
        title="Copy selection"
        type="button"
        :variant="copyState === 'copied' ? 'solid' : 'subtle'"
        @click="void copySelection()"
      />
      <UButton
        color="neutral"
        icon="i-lucide-x"
        size="xs"
        square
        title="Exit select mode"
        type="button"
        variant="ghost"
        @click="exitSelectMode"
      />
    </div>

    <div
      ref="terminalHost"
      data-terminal-host
      class="h-full w-full overflow-hidden"
      :class="[selectMode ? 'touch-none cursor-text' : '', ready ? 'opacity-100' : 'opacity-0']"
      @click.capture="onTerminalClick"
      @contextmenu="onTerminalContextMenu"
      @pointercancel="onTerminalPointerCancel"
      @pointerdown="onTerminalPointerDown"
      @pointermove="onTerminalPointerMove"
      @pointerup="onTerminalPointerUp"
    />

    <div
      v-if="connectionState !== 'attached' || pendingReliableCount > 0"
      aria-live="polite"
      class="absolute right-3 top-3 z-20 flex max-w-[min(28rem,calc(100%-1.5rem))] items-center gap-2 rounded-md border border-[var(--bitveins-shell-border-strong)] bg-[var(--bitveins-shell-panel-solid)]/95 px-3 py-2 text-xs text-[var(--bitveins-shell-text-muted)] shadow-lg backdrop-blur"
      data-terminal-connection-status
    >
      <UIcon
        class="size-3.5 shrink-0"
        :class="connectionState === 'offline' ? 'text-amber-400' : 'animate-spin text-[var(--bitveins-shell-accent)]'"
        :name="connectionState === 'offline' ? 'i-lucide-wifi-off' : 'i-lucide-loader-circle'"
      />
      <span>{{ connectionState === 'attached' ? `Delivering ${pendingReliableCount} async command${pendingReliableCount === 1 ? '' : 's'}…` : status }}</span>
    </div>

    <div
      v-if="!ready"
      class="absolute inset-0 z-20 bg-[var(--bitveins-terminal-bg)]"
    />
  </section>
</template>
