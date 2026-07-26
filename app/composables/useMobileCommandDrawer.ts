import type { Ref } from 'vue'
import type { InputMode } from '~/types/session'

type TextareaHandle = {
  autoResize?: () => void
  textareaRef?: HTMLTextAreaElement
}

type MobileCommandDrawerOptions = {
  disabled: Readonly<Ref<boolean>>
  inputMode: Readonly<Ref<InputMode>>
  mobileTextarea: Ref<TextareaHandle | null>
  textarea: Ref<TextareaHandle | null>
}

function isMobileViewport(): boolean {
  return import.meta.client && window.matchMedia('(max-width: 1023px)').matches
}

export function useMobileCommandDrawer(options: MobileCommandDrawerOptions) {
  const drawerOpen = ref(false)
  let touchStartX = 0
  let touchStartY = 0
  let pendingDrawerFocus = false
  let drawerFocusTimer: ReturnType<typeof setTimeout> | null = null
  let viewportUpdateFrame: number | null = null

  function clearDrawerFocusTimer(): void {
    if (!drawerFocusTimer) {
      return
    }

    clearTimeout(drawerFocusTimer)
    drawerFocusTimer = null
  }

  function setKeyboardInset(value: number): void {
    if (!import.meta.client) {
      return
    }

    document.documentElement.style.setProperty('--bitveins-keyboard-inset', `${Math.max(0, Math.round(value))}px`)
  }

  function updateKeyboardInset(): void {
    if (!import.meta.client || !drawerOpen.value || !isMobileViewport()) {
      setKeyboardInset(0)
      return
    }

    const viewport = window.visualViewport

    if (!viewport) {
      setKeyboardInset(0)
      return
    }

    setKeyboardInset(window.innerHeight - viewport.height - viewport.offsetTop)
  }

  function requestKeyboardInsetUpdate(): void {
    if (!import.meta.client) {
      return
    }

    if (viewportUpdateFrame !== null) {
      window.cancelAnimationFrame(viewportUpdateFrame)
    }

    viewportUpdateFrame = window.requestAnimationFrame(() => {
      viewportUpdateFrame = null
      updateKeyboardInset()
    })
  }

  function focus(): void {
    if (drawerOpen.value) {
      options.mobileTextarea.value?.textareaRef?.focus({ preventScroll: true })
      return
    }

    if (isMobileViewport()) {
      return
    }

    options.textarea.value?.textareaRef?.focus({ preventScroll: true })
  }

  function focusDrawerTextarea(): void {
    if (!drawerOpen.value || options.disabled.value) {
      return
    }

    const textareaEl = options.mobileTextarea.value?.textareaRef
    if (textareaEl) {
      options.mobileTextarea.value?.autoResize?.()
      textareaEl.focus({ preventScroll: true })
      pendingDrawerFocus = false
      clearDrawerFocusTimer()
    }
    requestKeyboardInsetUpdate()
  }

  function openDrawer(): void {
    pendingDrawerFocus = !options.disabled.value
    drawerOpen.value = true
    nextTick(() => {
      focusDrawerTextarea()
      window.setTimeout(focusDrawerTextarea, 60)
      window.setTimeout(focusDrawerTextarea, 180)
    })
  }

  function onDrawerAnimationEnd(open: boolean): void {
    if (!open) {
      pendingDrawerFocus = false
      clearDrawerFocusTimer()
      setKeyboardInset(0)
      return
    }

    requestKeyboardInsetUpdate()

    if (pendingDrawerFocus) {
      focusDrawerTextarea()
    }
  }

  function onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0]

    if (!touch) {
      return
    }

    touchStartX = touch.clientX
    touchStartY = touch.clientY
  }

  function closeDrawer(): void {
    pendingDrawerFocus = false
    clearDrawerFocusTimer()
    options.mobileTextarea.value?.textareaRef?.blur()
    drawerOpen.value = false
    setKeyboardInset(0)
  }

  function onTouchEnd(event: TouchEvent): void {
    if (drawerOpen.value) {
      return
    }

    const touch = event.changedTouches[0]

    if (!touch || options.inputMode.value !== 'async') {
      return
    }

    const target = event.target as HTMLElement | null
    if (target && target.closest('button, input, textarea, a, [role="button"]')) {
      return
    }

    const deltaX = Math.abs(touch.clientX - touchStartX)
    const deltaY = touchStartY - touch.clientY

    if (deltaY > 32 && deltaX < 80) {
      openDrawer()
    }
  }

  function mount(): void {
    options.textarea.value?.autoResize?.()
    window.visualViewport?.addEventListener('resize', requestKeyboardInsetUpdate)
    window.visualViewport?.addEventListener('scroll', requestKeyboardInsetUpdate)
    window.addEventListener('resize', requestKeyboardInsetUpdate)
  }

  function dispose(): void {
    pendingDrawerFocus = false
    clearDrawerFocusTimer()

    if (viewportUpdateFrame !== null) {
      window.cancelAnimationFrame(viewportUpdateFrame)
    }

    window.visualViewport?.removeEventListener('resize', requestKeyboardInsetUpdate)
    window.visualViewport?.removeEventListener('scroll', requestKeyboardInsetUpdate)
    window.removeEventListener('resize', requestKeyboardInsetUpdate)
    setKeyboardInset(0)
  }

  watch(drawerOpen, (open) => {
    if (open) {
      requestKeyboardInsetUpdate()
      return
    }

    pendingDrawerFocus = false
    clearDrawerFocusTimer()
    options.mobileTextarea.value?.textareaRef?.blur()
    setKeyboardInset(0)
  })

  return {
    closeDrawer,
    drawerOpen,
    focus,
    mount,
    dispose,
    onDrawerAnimationEnd,
    onTouchEnd,
    onTouchStart,
    openDrawer,
  }
}
