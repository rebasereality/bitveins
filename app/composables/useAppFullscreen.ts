import { onBeforeUnmount, onMounted, ref } from 'vue'

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenElement?: Element | null
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

function fullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null
  const doc = document as FullscreenDocument
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

async function requestFullscreen(element: HTMLElement): Promise<void> {
  const target = element as FullscreenElement
  if (target.requestFullscreen) {
    await target.requestFullscreen()
    return
  }
  await target.webkitRequestFullscreen?.()
}

async function exitFullscreen(): Promise<void> {
  const doc = document as FullscreenDocument
  if (document.exitFullscreen) {
    await document.exitFullscreen()
    return
  }
  await doc.webkitExitFullscreen?.()
}

export function useAppFullscreen() {
  const isFullscreen = ref(false)

  function sync(): void {
    isFullscreen.value = Boolean(fullscreenElement())
  }

  async function toggle(): Promise<void> {
    if (typeof document === 'undefined') return
    try {
      if (fullscreenElement()) await exitFullscreen()
      else await requestFullscreen(document.documentElement)
    }
    catch {
      // Browsers can reject fullscreen outside a user gesture.
    }
    sync()
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    sync()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', sync)
    document.removeEventListener('webkitfullscreenchange', sync)
  })

  return { isFullscreen, toggle }
}
