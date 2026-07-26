import { computed, nextTick, ref, watch, type Ref } from 'vue'
import {
  hasSubmittedAsyncPrompt,
  readSubmittedAsyncPrompt,
} from '~/utils/async-prompt-recovery'

export function useCommandInputHistory(options: {
  historyMessages: Readonly<Ref<string[]>> | (() => string[])
  promptRecoveryKey: Readonly<Ref<string | null>> | (() => string | null)
}) {
  const value = ref('')
  const historyIndex = ref(-1)
  const submittedPromptAvailable = ref(false)

  const messages = computed(() => (typeof options.historyMessages === 'function' ? options.historyMessages() : options.historyMessages.value))
  const scopeKey = computed(() => (typeof options.promptRecoveryKey === 'function' ? options.promptRecoveryKey() : options.promptRecoveryKey.value))

  const historyPreview = computed(() => (historyIndex.value >= 0 ? messages.value[historyIndex.value] || '' : ''))
  const canHistoryUp = computed(() => !value.value && messages.value.length > 0 && historyIndex.value < messages.value.length - 1)
  const canHistoryDown = computed(() => !value.value && historyIndex.value >= 0)
  const placeholder = computed(() => historyPreview.value || 'Type command... Ctrl+Enter to send')

  function refreshSubmittedPromptAvailability(): void {
    submittedPromptAvailable.value = import.meta.client
      ? hasSubmittedAsyncPrompt(localStorage, scopeKey.value)
      : false
  }

  function restoreRecoverablePrompt(autoResizeCallback?: () => void): void {
    if (!import.meta.client || !scopeKey.value || value.value) {
      return
    }

    value.value = readSubmittedAsyncPrompt(localStorage, scopeKey.value)
    nextTick(() => {
      autoResizeCallback?.()
    })
  }

  function historyUp(): void {
    if (!canHistoryUp.value) return
    historyIndex.value += 1
  }

  function historyDown(): void {
    if (!canHistoryDown.value) return
    historyIndex.value -= 1
  }

  function resetHistoryIndex(): void {
    historyIndex.value = -1
  }

  watch(scopeKey, () => {
    value.value = ''
    resetHistoryIndex()
    refreshSubmittedPromptAvailability()
  }, { immediate: true })

  watch(messages, () => {
    resetHistoryIndex()
  })

  return {
    value,
    historyIndex,
    submittedPromptAvailable,
    historyPreview,
    canHistoryUp,
    canHistoryDown,
    placeholder,
    refreshSubmittedPromptAvailability,
    restoreRecoverablePrompt,
    historyUp,
    historyDown,
    resetHistoryIndex,
  }
}
