import type { Ref } from 'vue'
import type { LiveControlKey, LiveModifiers } from '~/utils/terminal-controls'
import { onBeforeUnmount, readonly, ref, watch } from 'vue'

interface MobileLiveKeyboardOptions {
  disabled: Readonly<Ref<boolean>>
  onControl: (control: LiveControlKey, modifiers?: Partial<LiveModifiers>) => void
  onText: (data: string) => void
}

const sentinel = '\u200B'

export function useMobileLiveKeyboard(options: MobileLiveKeyboardOptions) {
  const input = ref<HTMLInputElement | null>(null)
  const isOpen = ref(false)

  function resetInput(target = input.value): void {
    if (!target) return

    target.value = sentinel
    target.setSelectionRange(sentinel.length, sentinel.length)
  }

  function close(): void {
    input.value?.blur()
    isOpen.value = false
  }

  function open(): void {
    if (options.disabled.value || !input.value) {
      return
    }

    input.value.focus({ preventScroll: true })
  }

  function toggle(): void {
    if (isOpen.value) {
      close()
      return
    }

    open()
  }

  function onBlur(): void {
    isOpen.value = false
  }

  function onFocus(event: FocusEvent): void {
    resetInput(event.target as HTMLInputElement)
    isOpen.value = true
  }

  function controlForKeyboardEvent(event: KeyboardEvent): LiveControlKey | null {
    if (event.key === 'Enter' || event.code === 'NumpadEnter' || event.keyCode === 13) {
      return 'enter'
    }
    if (event.key === 'Backspace' || event.code === 'Backspace' || event.keyCode === 8) {
      return 'backspace'
    }

    const controls: Partial<Record<string, LiveControlKey>> = {
      ArrowDown: 'arrowDown',
      ArrowLeft: 'arrowLeft',
      ArrowRight: 'arrowRight',
      ArrowUp: 'arrowUp',
      Escape: 'escape',
      PageDown: 'pageDown',
      PageUp: 'pageUp',
      Tab: 'tab',
    }

    return controls[event.key] || null
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return

    const control = controlForKeyboardEvent(event)
    if (!control) return

    event.preventDefault()
    event.stopPropagation()
    options.onControl(control, {
      alt: event.altKey,
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
    })
    resetInput(event.target as HTMLInputElement)
  }

  function onBeforeInput(event: InputEvent): void {
    const control = event.inputType === 'deleteContentBackward'
      ? 'backspace'
      : event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph'
        ? 'enter'
        : null
    if (!control) return

    event.preventDefault()
    options.onControl(control)
    resetInput(event.target as HTMLInputElement)
  }

  function onInput(event: InputEvent): void {
    const target = event.target as HTMLInputElement

    if (
      event.inputType === 'deleteContentBackward'
      || event.inputType === 'insertLineBreak'
      || event.inputType === 'insertParagraph'
    ) {
      options.onControl(event.inputType === 'deleteContentBackward' ? 'backspace' : 'enter')
      resetInput(target)
      return
    }

    const data = target.value.startsWith(sentinel)
      ? target.value.slice(sentinel.length)
      : target.value

    if (data) {
      options.onText(data)
    }

    resetInput(target)
  }

  watch(options.disabled, (disabled) => {
    if (disabled) {
      close()
    }
  })

  onBeforeUnmount(close)

  return {
    close,
    input,
    isOpen: readonly(isOpen),
    onBeforeInput,
    onBlur,
    onFocus,
    onInput,
    onKeydown,
    open,
    sentinel,
    toggle,
  }
}
