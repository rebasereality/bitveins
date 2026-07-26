// @vitest-environment happy-dom

import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommandInputUpload } from '../../../app/composables/useCommandInputUpload'

class SuccessfulUploadRequest {
  responseText = JSON.stringify({
    success: true,
    path: '/tmp/bitveins/main/shell/uploaded.txt',
  })

  status = 200
  statusText = 'OK'
  upload = {
    addEventListener: vi.fn(),
  }

  private readonly listeners = new Map<string, EventListener>()

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener === 'function') this.listeners.set(type, listener)
  }

  open(): void {}

  send(): void {
    queueMicrotask(() => this.listeners.get('load')?.(new Event('load')))
  }
}

const OriginalXMLHttpRequest = globalThis.XMLHttpRequest

beforeEach(() => {
  globalThis.XMLHttpRequest = SuccessfulUploadRequest as unknown as typeof XMLHttpRequest
})

afterEach(() => {
  globalThis.XMLHttpRequest = OriginalXMLHttpRequest
})

describe('useCommandInputUpload', () => {
  it('uploads and inserts a path at the preserved Async caret', async () => {
    const value = ref('echo done')
    const textarea = document.createElement('textarea')
    textarea.value = value.value
    textarea.setSelectionRange(4, 4)
    const sendLiveInput = vi.fn()
    const upload = useCommandInputUpload(
      value,
      {
        inputMode: 'async',
        sessionName: 'main',
        windowName: 'shell',
      },
      () => textarea,
      sendLiveInput,
    )

    await upload.uploadFiles([
      new File(['hello'], 'hello.txt', { type: 'text/plain' }),
    ], textarea)
    await nextTick()

    expect(value.value).toBe('echo /tmp/bitveins/main/shell/uploaded.txt done')
    expect(sendLiveInput).not.toHaveBeenCalled()
  })

  it('injects uploaded paths into Live without a terminator', async () => {
    const value = ref('')
    const sendLiveInput = vi.fn()
    const upload = useCommandInputUpload(
      value,
      {
        inputMode: 'live',
        sessionName: 'main',
        windowName: 'shell',
      },
      () => null,
      sendLiveInput,
    )

    await upload.uploadFiles([
      new File(['one'], 'one.txt', { type: 'text/plain' }),
      new File(['two'], 'two.txt', { type: 'text/plain' }),
    ])

    expect(sendLiveInput).toHaveBeenCalledTimes(2)
    expect(sendLiveInput).toHaveBeenNthCalledWith(1, '/tmp/bitveins/main/shell/uploaded.txt')
    expect(sendLiveInput).toHaveBeenNthCalledWith(2, '/tmp/bitveins/main/shell/uploaded.txt')
    expect(sendLiveInput.mock.calls.flat().join('')).not.toMatch(/[\r\n\t]/)
    expect(value.value).toBe('')
  })
})
