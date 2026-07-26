import type { Ref } from 'vue'

interface TerminalBrowserShortcutsOptions {
  enabled: Readonly<Ref<boolean>>
  sendInput: (data: string) => void
}

function isCtrlW(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'w' && event.ctrlKey && !event.altKey && !event.metaKey
}

function isTextInput(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

function isEditableTarget(target: EventTarget | null): target is Element {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'))
}

function isTerminalTarget(target: EventTarget | null): target is Element {
  return target instanceof Element && Boolean(target.closest('[data-terminal-host], .xterm'))
}

function deletePreviousWord(element: HTMLInputElement | HTMLTextAreaElement): void {
  const { selectionStart, selectionEnd, value } = element

  if (selectionStart === null || selectionEnd === null) {
    return
  }

  if (selectionStart !== selectionEnd) {
    element.setRangeText('', selectionStart, selectionEnd, 'end')
    element.dispatchEvent(new Event('input', { bubbles: true }))
    return
  }

  const beforeCursor = value.slice(0, selectionStart)
  const deleteFrom = beforeCursor.replace(/\s+$/, '').search(/\S+$/)

  if (deleteFrom === -1) {
    return
  }

  element.setRangeText('', deleteFrom, selectionStart, 'end')
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

export function useTerminalBrowserShortcuts(options: TerminalBrowserShortcutsOptions): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || !options.enabled.value || !isCtrlW(event)) {
      return
    }

    if (isEditableTarget(event.target) && !isTerminalTarget(event.target)) {
      event.preventDefault()
      event.stopPropagation()

      if (isTextInput(event.target)) {
        deletePreviousWord(event.target)
      }

      return
    }

    event.preventDefault()
    event.stopPropagation()
    options.sendInput('\x17')
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown, { capture: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, { capture: true })
  })
}
