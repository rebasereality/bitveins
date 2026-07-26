import type { Ref, ShallowRef } from 'vue'
import { computed, nextTick, readonly, ref } from 'vue'

interface TerminalSelectionPort {
  readonly buffer: {
    readonly active: {
      readonly viewportY: number
    }
  }
  readonly cols: number
  readonly rows: number
  clearSelection(): void
  getSelection(): string
  select(column: number, row: number, length: number): void
}

type TerminalSelectionOptions<TerminalPort extends TerminalSelectionPort> = {
  terminal: ShallowRef<TerminalPort | null>
  terminalHost: Ref<HTMLElement | null>
}

type TerminalCell = {
  column: number
  row: number
}

const longPressDelay = 520
const touchMoveTolerance = 12

function isCopyShortcut(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'c' && (event.ctrlKey || event.metaKey) && !event.altKey
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(max-width: 1023px)').matches
}

function fallbackCopyText(text: string): void {
  const copyTarget = document.createElement('textarea')
  copyTarget.value = text
  copyTarget.setAttribute('readonly', '')
  copyTarget.style.position = 'fixed'
  copyTarget.style.left = '-9999px'
  copyTarget.style.top = '0'
  document.body.appendChild(copyTarget)
  copyTarget.select()
  document.execCommand('copy')
  copyTarget.remove()
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  fallbackCopyText(text)
}

export function useTerminalSelection<TerminalPort extends TerminalSelectionPort>(
  options: TerminalSelectionOptions<TerminalPort>,
) {
  const selectMode = ref(false)
  const selectedText = ref('')
  const hasSelection = computed(() => selectedText.value.length > 0)
  const copyState = ref<'idle' | 'copied' | 'error'>('idle')
  const copyIcon = computed(() => {
    if (copyState.value === 'copied') {
      return 'i-lucide-check'
    }

    if (copyState.value === 'error') {
      return 'i-lucide-triangle-alert'
    }

    return 'i-lucide-copy'
  })
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let copyStateTimer: ReturnType<typeof setTimeout> | null = null
  let activeTouchPointerId: number | null = null
  let mobileSelecting = false
  let mobileSelectionAnchor: TerminalCell | null = null
  let suppressNextClick = false
  let longPressStart: { x: number, y: number } | null = null

  function clearLongPressTimer(): void {
    if (!longPressTimer) {
      return
    }

    clearTimeout(longPressTimer)
    longPressTimer = null
  }

  function clearCopyStateTimer(): void {
    if (!copyStateTimer) {
      return
    }

    clearTimeout(copyStateTimer)
    copyStateTimer = null
  }

  function resetCopyStateSoon(): void {
    clearCopyStateTimer()
    copyStateTimer = setTimeout(() => {
      copyState.value = 'idle'
      copyStateTimer = null
    }, 1400)
  }

  async function copySelection(): Promise<void> {
    const text = selectedText.value

    if (!text) {
      return
    }

    try {
      await writeClipboard(text)
      copyState.value = 'copied'
      resetCopyStateSoon()
    }
    catch {
      copyState.value = 'error'
      resetCopyStateSoon()
    }
  }

  function isTerminalEvent(event: Event): boolean {
    const target = event.target

    return target instanceof Node && Boolean(options.terminalHost.value?.contains(target))
  }

  function exitSelectMode(): void {
    cancelMobileSelectionPointer()
    selectMode.value = false
    suppressNextClick = false
    options.terminal.value?.clearSelection()
    selectedText.value = ''
    copyState.value = 'idle'
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || !isTerminalEvent(event)) {
      return
    }

    if (isCopyShortcut(event) && hasSelection.value) {
      event.preventDefault()
      event.stopPropagation()
      void copySelection()
      return
    }

    if (event.key === 'Escape' && selectMode.value) {
      event.preventDefault()
      exitSelectMode()
    }
  }

  function isPasteShortcut(event: KeyboardEvent): boolean {
    return event.key.toLowerCase() === 'v' && (event.ctrlKey || event.metaKey) && !event.altKey
  }

  function onTerminalKey(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') {
      return true
    }

    if (isPasteShortcut(event)) {
      return false
    }

    if (isCopyShortcut(event) && hasSelection.value) {
      event.preventDefault()
      event.stopPropagation()
      void copySelection()
      return false
    }

    if (event.key === 'Escape' && selectMode.value) {
      event.preventDefault()
      event.stopPropagation()
      exitSelectMode()
      return false
    }

    return true
  }

  function terminalCellFromPointer(event: PointerEvent): TerminalCell | null {
    const term = options.terminal.value
    const screen = options.terminalHost.value?.querySelector<HTMLElement>('.xterm-screen')

    if (!term || !screen || term.cols < 1 || term.rows < 1) {
      return null
    }

    const rect = screen.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    return {
      column: Math.min(
        term.cols - 1,
        Math.max(0, Math.floor((event.clientX - rect.left) / (rect.width / term.cols))),
      ),
      row: Math.min(
        term.rows - 1,
        Math.max(0, Math.floor((event.clientY - rect.top) / (rect.height / term.rows))),
      ),
    }
  }

  function applyMobileSelection(event: PointerEvent): void {
    const term = options.terminal.value
    const anchor = mobileSelectionAnchor
    const current = terminalCellFromPointer(event)

    if (!term || !anchor || !current) {
      return
    }

    const viewportY = term.buffer.active.viewportY
    const anchorOffset = anchor.row * term.cols + anchor.column
    const currentOffset = current.row * term.cols + current.column
    const length = Math.abs(currentOffset - anchorOffset) + 1

    const start = currentOffset < anchorOffset ? current : anchor
    term.select(start.column, viewportY + start.row, length)
    updateSelection()
  }

  function beginMobileSelection(event: PointerEvent): void {
    if (!options.terminalHost.value || event.pointerType !== 'touch') {
      return
    }

    selectMode.value = true
    mobileSelecting = true
    activeTouchPointerId = event.pointerId
    mobileSelectionAnchor = terminalCellFromPointer(event)
    suppressNextClick = true

    try {
      options.terminalHost.value.setPointerCapture(event.pointerId)
    }
    catch {
      // Touch streams can be canceled by the browser before long-press fires.
    }
  }

  function cancelMobileSelectionPointer(): void {
    clearLongPressTimer()
    longPressStart = null
    activeTouchPointerId = null
    mobileSelecting = false
    mobileSelectionAnchor = null
  }

  function onTerminalPointerDown(event: PointerEvent): void {
    if (!isMobileViewport() || event.pointerType !== 'touch') {
      return
    }

    if (selectMode.value) {
      event.preventDefault()
      beginMobileSelection(event)
      return
    }

    clearLongPressTimer()
    activeTouchPointerId = event.pointerId
    longPressStart = {
      x: event.clientX,
      y: event.clientY,
    }

    longPressTimer = setTimeout(() => {
      longPressTimer = null

      if (activeTouchPointerId !== event.pointerId || !longPressStart) {
        return
      }

      beginMobileSelection(event)
    }, longPressDelay)
  }

  function onTerminalPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || activeTouchPointerId !== event.pointerId) {
      return
    }

    if (mobileSelecting) {
      event.preventDefault()
      applyMobileSelection(event)
      return
    }

    if (!longPressStart) {
      return
    }

    const deltaX = event.clientX - longPressStart.x
    const deltaY = event.clientY - longPressStart.y

    if (Math.hypot(deltaX, deltaY) > touchMoveTolerance) {
      cancelMobileSelectionPointer()
    }
  }

  function onTerminalPointerUp(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || activeTouchPointerId !== event.pointerId) {
      return
    }

    if (mobileSelecting) {
      event.preventDefault()
      applyMobileSelection(event)

      try {
        options.terminalHost.value?.releasePointerCapture(event.pointerId)
      }
      catch {
        // Ignore stale captures after OS/browser gesture cancellation.
      }

      nextTick(() => {
        updateSelection()
      })

      window.setTimeout(() => {
        suppressNextClick = false
      }, 350)
    }

    cancelMobileSelectionPointer()
  }

  function onTerminalPointerCancel(event: PointerEvent): void {
    if (event.pointerType !== 'touch' || activeTouchPointerId !== event.pointerId) {
      return
    }

    if (mobileSelecting) {
      options.terminal.value?.clearSelection()
      updateSelection()
    }

    cancelMobileSelectionPointer()
  }

  function onTerminalClick(event: MouseEvent): void {
    if (!suppressNextClick) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    suppressNextClick = false
  }

  function onTerminalContextMenu(event: MouseEvent): void {
    if (!selectMode.value && !isMobileViewport()) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
  }

  function onSelectionChange(): void {
    updateSelection()

    if (!hasSelection.value) {
      copyState.value = 'idle'
    }
  }

  function updateSelection(): void {
    selectedText.value = options.terminal.value?.getSelection() ?? ''
  }

  function mount(): void {
    window.addEventListener('keydown', onWindowKeydown, { capture: true })
  }

  function dispose(): void {
    window.removeEventListener('keydown', onWindowKeydown, { capture: true })
    clearLongPressTimer()
    clearCopyStateTimer()
  }

  return {
    copyIcon,
    copySelection,
    copyState,
    dispose,
    exitSelectMode,
    hasSelection,
    mount,
    onSelectionChange,
    onTerminalClick,
    onTerminalContextMenu,
    onTerminalKey,
    onTerminalPointerCancel,
    onTerminalPointerDown,
    onTerminalPointerMove,
    onTerminalPointerUp,
    selectedText: readonly(selectedText),
    selectMode,
  }
}
