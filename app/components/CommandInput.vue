<script setup lang="ts">
import type { InputMode } from '~/types/session'
import type { LiveControlKey, LiveModifier, LiveModifiers } from '~/utils/terminal-controls'
import { terminalSequenceForLiveControl, terminalSequenceForPrintableKey } from '~/utils/terminal-controls'
import { useCommandInputHistory } from '~/composables/useCommandInputHistory'
import { useMobileLiveKeyboard } from '~/composables/useMobileLiveKeyboard'
import { useCommandInputUpload } from '~/composables/useCommandInputUpload'

const draftValue = defineModel<string>('draftValue', { default: '' })

const props = defineProps<{
  disabled: boolean
  focused?: boolean
  historyMessages: string[]
  inputMode: InputMode
  liveAvailable: boolean
  promptRecoveryKey: string | null
  sessionName: string | null
  windowName?: string | null
}>()

const emit = defineEmits<{
  blur: []
  control: [data: string]
  focus: []
  modeChange: [mode: InputMode]
  submit: [payload: { command: string, terminator: '\r' | '\t' }]
}>()

const footer = ref<HTMLElement | null>(null)
const textarea = ref<{ textareaRef?: HTMLTextAreaElement, autoResize?: () => void } | null>(null)
const mobileTextarea = ref<{ textareaRef?: HTMLTextAreaElement, autoResize?: () => void } | null>(null)
const queueMode = ref(false)
const liveModifiers = reactive<LiveModifiers>({
  alt: false,
  ctrl: false,
  shift: false,
})

const disabled = computed(() => props.disabled)
const liveDisabled = computed(() => props.disabled || !props.liveAvailable)
const inputMode = computed(() => props.inputMode)
const {
  close: closeLiveKeyboard,
  input: liveKeyboardInput,
  isOpen: liveKeyboardOpen,
  onBeforeInput: onMobileLiveBeforeInput,
  onBlur: onLiveKeyboardBlur,
  onFocus: onMobileLiveFocus,
  onInput: onMobileLiveInput,
  onKeydown: onMobileLiveKeydown,
  sentinel: mobileLiveInputSentinel,
  toggle: toggleLiveKeyboard,
} = useMobileLiveKeyboard({
  disabled: liveDisabled,
  onControl: handleLiveControl,
  onText: sendMobileLiveText,
})

const {
  value,
  historyIndex,
  submittedPromptAvailable,
  historyPreview,
  canHistoryUp,
  canHistoryDown,
  placeholder,
  restoreRecoverablePrompt,
  historyUp,
  historyDown,
  resetHistoryIndex,
} = useCommandInputHistory({
  historyMessages: () => props.historyMessages,
  promptRecoveryKey: () => props.promptRecoveryKey,
  value: draftValue,
})

watch(value, () => {
  nextTick(() => {
    textarea.value?.autoResize?.()
    mobileTextarea.value?.autoResize?.()
  })
})

const {
  fileInput,
  onPaste,
  onFileSelected,
  readAndUploadClipboard,
  onDrop,
  uploadFiles,
} = useCommandInputUpload(
  value,
  props,
  () => {
    const mobileEl = mobileTextarea.value?.textareaRef
    const desktopEl = textarea.value?.textareaRef
    return (mobileEl && document.activeElement === mobileEl ? mobileEl : desktopEl || mobileEl) as HTMLTextAreaElement | null
  },
  data => emit('control', data),
)

const {
  drawerOpen,
  dispose: disposeDrawer,
  focus,
  mount: mountDrawer,
  openDrawer,
} = useMobileCommandDrawer({
  disabled,
  inputMode,
  mobileTextarea,
  textarea,
})

let footerResizeObserver: ResizeObserver | null = null
let desktopFooterBaseline = 0

const modeControls: Array<{ icon: string, label: string, mode: InputMode, title: string }> = [
  { icon: 'i-lucide-rows-3', label: 'Async', mode: 'async', title: 'Async input' },
  { icon: 'i-lucide-terminal', label: 'Live', mode: 'live', title: 'Live input' },
]

function toggleLiveModifier(modifier: LiveModifier): void {
  if (liveDisabled.value) return
  liveModifiers[modifier] = !liveModifiers[modifier]
}

function resetLiveModifiers(): void {
  liveModifiers.alt = false
  liveModifiers.ctrl = false
  liveModifiers.shift = false
}

function handleLiveControl(key: LiveControlKey | string, itemModifiers?: Partial<LiveModifiers>): void {
  if (liveDisabled.value) return

  const mergedModifiers: LiveModifiers = {
    alt: liveModifiers.alt || Boolean(itemModifiers?.alt),
    ctrl: liveModifiers.ctrl || Boolean(itemModifiers?.ctrl),
    shift: liveModifiers.shift || Boolean(itemModifiers?.shift),
  }

  const sequence = terminalSequenceForLiveControl(key as LiveControlKey, mergedModifiers) || key
  emit('control', sequence)
  resetLiveModifiers()
}

function handleRestore(): void {
  restoreRecoverablePrompt(() => {
    textarea.value?.autoResize?.()
    mobileTextarea.value?.autoResize?.()
  })
}

function setMode(mode: InputMode): void {
  emit('modeChange', mode)
}

function submit(): void {
  if (disabled.value) return
  const text = value.value ? value.value.trimEnd() : historyPreview.value
  if (!text) return

  emit('submit', {
    command: text,
    terminator: queueMode.value ? '\t' : '\r',
  })
  value.value = ''
  resetHistoryIndex()
  drawerOpen.value = false

  nextTick(() => {
    textarea.value?.autoResize?.()
    mobileTextarea.value?.autoResize?.()
  })
}

function commitHistoryPreview(): void {
  if (!historyPreview.value || value.value) return
  value.value = historyPreview.value
  resetHistoryIndex()
  nextTick(() => {
    textarea.value?.autoResize?.()
    mobileTextarea.value?.autoResize?.()
  })
}

function onLiveModifierKeydown(event: KeyboardEvent): void {
  if (inputMode.value !== 'live' || liveDisabled.value) return

  const target = event.target as HTMLElement | null
  if (target && target.closest('input, textarea, select, button, [role="dialog"], [contenteditable]')) {
    return
  }
  if (target?.closest('[data-terminal-host]')) {
    return
  }

  if (event.repeat) return

  if (event.key === 'Alt') {
    event.preventDefault()
    toggleLiveModifier('alt')
    return
  }
  if (event.key === 'Control') {
    event.preventDefault()
    toggleLiveModifier('ctrl')
    return
  }
  if (event.key === 'Shift') {
    event.preventDefault()
    toggleLiveModifier('shift')
    return
  }

  const effectiveModifiers: LiveModifiers = {
    alt: liveModifiers.alt || event.altKey,
    ctrl: liveModifiers.ctrl || event.ctrlKey,
    shift: liveModifiers.shift || event.shiftKey,
  }

  if (effectiveModifiers.alt || effectiveModifiers.ctrl || effectiveModifiers.shift) {
    const sequence = (event.key === 'PageUp' || event.key === 'PageDown')
      ? terminalSequenceForLiveControl(event.key === 'PageUp' ? 'pageUp' : 'pageDown', effectiveModifiers)
      : terminalSequenceForPrintableKey(event.key, effectiveModifiers)

    if (sequence) {
      event.preventDefault()
      emit('control', sequence)
      resetLiveModifiers()
    }
  }
}

function sendMobileLiveText(data: string): void {
  if (!data || liveDisabled.value) return

  const modifiers = { ...liveModifiers }
  const terminalData = modifiers.ctrl || modifiers.alt || modifiers.shift
    ? Array.from(data).map(character => terminalSequenceForPrintableKey(character, modifiers)).join('')
    : data

  emit('control', terminalData)
  resetLiveModifiers()
}

function onKeydown(event: KeyboardEvent): void {
  const isEnter = event.key === 'Enter' || event.code === 'NumpadEnter' || event.keyCode === 13

  // 1. Ctrl+Enter or Cmd+Enter anywhere in Async mode
  if (isEnter && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    event.stopPropagation()
    submit()
    return
  }

  // 2. Focused inside input/textarea
  const target = event.target as HTMLElement | null
  const isInputFocused = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')

  if (isInputFocused) {
    if (event.key === 'Tab') {
      if (historyPreview.value && !value.value) {
        event.preventDefault()
        event.stopPropagation()
        commitHistoryPreview()
        return
      }
      if (queueMode.value) {
        event.preventDefault()
        event.stopPropagation()
        submit()
        return
      }
    }

    const isEditingCustomPrompt = value.value.length > 0 && historyIndex.value === -1
    if (event.key === 'ArrowUp' && canHistoryUp.value && !isEditingCustomPrompt) {
      event.preventDefault()
      event.stopPropagation()
      historyUp()
      return
    }
    if (event.key === 'ArrowDown' && canHistoryDown.value && !isEditingCustomPrompt) {
      event.preventDefault()
      event.stopPropagation()
      historyDown()
      return
    }
  }
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (inputMode.value === 'live') {
    onLiveModifierKeydown(event)
    return
  }

  if (inputMode.value === 'async' && !disabled.value) {
    onKeydown(event)
  }
}

function isDesktopViewport(): boolean {
  return import.meta.client && window.matchMedia('(min-width: 1024px)').matches
}

function updateCommandLayout(): void {
  if (!footer.value) {
    document.documentElement.style.setProperty('--bitveins-command-offset', '0px')
    document.documentElement.style.setProperty('--bitveins-command-baseline', '0px')
    return
  }

  const nextHeight = footer.value.getBoundingClientRect().height
  if (!isDesktopViewport()) {
    desktopFooterBaseline = 0
    document.documentElement.style.setProperty('--bitveins-command-baseline', `${Math.round(nextHeight)}px`)
    document.documentElement.style.setProperty('--bitveins-command-offset', '0px')
    return
  }

  if (desktopFooterBaseline === 0) {
    desktopFooterBaseline = nextHeight
  }
  const offset = Math.max(0, Math.round(nextHeight - desktopFooterBaseline))

  document.documentElement.style.setProperty('--bitveins-command-baseline', `${Math.round(desktopFooterBaseline)}px`)
  document.documentElement.style.setProperty('--bitveins-command-offset', `${offset}px`)
}

watch(inputMode, (mode) => {
  if (mode !== 'live') {
    closeLiveKeyboard()
  }
})

async function uploadFilesToCurrentPrompt(files: File[]): Promise<void> {
  await uploadFiles(files)
  await nextTick()
  textarea.value?.autoResize?.()
  mobileTextarea.value?.autoResize?.()
}

defineExpose({
  focus,
  uploadFilesToCurrentPrompt,
})

onMounted(() => {
  mountDrawer()
  footerResizeObserver = new ResizeObserver(updateCommandLayout)
  if (footer.value) {
    footerResizeObserver.observe(footer.value)
  }
  window.addEventListener('resize', updateCommandLayout)
  window.addEventListener('keydown', onGlobalKeydown, { capture: true })
  nextTick(updateCommandLayout)
})

onBeforeUnmount(() => {
  disposeDrawer()
  footerResizeObserver?.disconnect()
  window.removeEventListener('resize', updateCommandLayout)
  window.removeEventListener('keydown', onGlobalKeydown, { capture: true })
  document.documentElement.style.setProperty('--bitveins-command-baseline', '0px')
  document.documentElement.style.setProperty('--bitveins-command-offset', '0px')
})
</script>

<template>
  <footer
    ref="footer"
    class="bg-[var(--bitveins-terminal-chrome)] px-2 pb-2 pt-1 text-[var(--bitveins-shell-text)] lg:fixed lg:bottom-0 lg:left-[var(--bitveins-sidebar-width)] lg:right-0 lg:z-30 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:border-[var(--bitveins-shell-border)] max-lg:p-1.5 max-lg:pb-[calc(6px+env(safe-area-inset-bottom))]"
  >
    <input
      v-if="inputMode === 'live'"
      ref="liveKeyboardInput"
      aria-label="Live terminal keyboard"
      autocomplete="off"
      autocapitalize="none"
      autocorrect="off"
      class="fixed bottom-1 left-1 z-[-1] h-px w-px opacity-0 max-lg:block lg:hidden"
      enterkeyhint="enter"
      inputmode="text"
      spellcheck="false"
      type="text"
      :value="mobileLiveInputSentinel"
      @blur="onLiveKeyboardBlur"
      @beforeinput="onMobileLiveBeforeInput"
      @focus="onMobileLiveFocus"
      @input="onMobileLiveInput"
      @keydown="onMobileLiveKeydown"
    >
    <div class="flex flex-col gap-2">
      <CommandInputAsyncBar
        v-model:queue-mode="queueMode"
        v-model:value="value"
        :disabled="disabled"
        :focused="props.focused"
        :history-preview="historyPreview"
        :input-mode="inputMode"
        :mode-controls="modeControls"
        :placeholder="placeholder"
        :submitted-prompt-available="submittedPromptAvailable"
        @blur="emit('blur')"
        @commit-history-preview="commitHistoryPreview"
        @focus="emit('focus')"
        @keydown="onKeydown"
        @on-drop="onDrop"
        @on-paste="onPaste"
        @open-drawer="openDrawer"
        @restore="handleRestore"
        @set-mode="setMode"
        @submit="submit"
      />

      <CommandInputLiveBar
        :input-mode="inputMode"
        :keyboard-open="liveKeyboardOpen"
        :live-disabled="liveDisabled"
        :live-modifiers="liveModifiers"
        :mode-controls="modeControls"
        @control="handleLiveControl"
        @set-mode="setMode"
        @toggle-keyboard="toggleLiveKeyboard"
        @toggle-modifier="toggleLiveModifier"
      />
    </div>

    <CommandInputMobileDrawer
      v-model:drawer-open="drawerOpen"
      v-model:queue-mode="queueMode"
      v-model:value="value"
      :can-history-down="canHistoryDown"
      :can-history-up="canHistoryUp"
      :disabled="disabled"
      :focused="props.focused"
      :history-preview="historyPreview"
      :placeholder="placeholder"
      :submitted-prompt-available="submittedPromptAvailable"
      @blur="emit('blur')"
      @commit-history-preview="commitHistoryPreview"
      @focus="emit('focus')"
      @history-down="historyDown"
      @history-up="historyUp"
      @keydown="onKeydown"
      @on-drop="onDrop"
      @on-paste="onPaste"
      @read-and-upload-clipboard="readAndUploadClipboard"
      @restore="handleRestore"
      @submit="submit"
    />

    <input
      id="bitveins-file-upload-input"
      ref="fileInput"
      accept="image/*,video/*,application/*,*/*"
      class="hidden"
      multiple
      type="file"
      @change="onFileSelected"
    >
  </footer>
</template>
