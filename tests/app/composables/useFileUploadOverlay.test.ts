// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileUploadOverlay } from '../../../app/composables/useFileUploadOverlay'

class ProgressUploadRequest {
  responseText = JSON.stringify({
    success: true,
    path: '/workspace/uploads/report.txt',
  })

  status = 200
  statusText = 'OK'

  private readonly listeners = new Map<string, EventListener>()
  private readonly uploadListeners = new Map<string, EventListener>()

  upload = {
    addEventListener: (type: string, listener: EventListener): void => {
      this.uploadListeners.set(type, listener)
    },
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener)
  }

  open(): void {}

  send(): void {
    queueMicrotask(() => {
      const progress = new Event('progress')
      Object.defineProperties(progress, {
        lengthComputable: { value: true },
        loaded: { value: 42 },
        total: { value: 100 },
      })
      this.uploadListeners.get('progress')?.(progress)
      this.listeners.get('load')?.(new Event('load'))
    })
  }
}

const OriginalXMLHttpRequest = globalThis.XMLHttpRequest

beforeEach(() => {
  vi.useFakeTimers()
  globalThis.XMLHttpRequest = ProgressUploadRequest as unknown as typeof XMLHttpRequest
})

afterEach(() => {
  const { dismissError } = useFileUploadOverlay()
  dismissError()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  globalThis.XMLHttpRequest = OriginalXMLHttpRequest
})

describe('useFileUploadOverlay', () => {
  it('uses contextual Transfer copy and reports progress through the shared modal state', async () => {
    const onProgress = vi.fn()
    const { state, uploadFile } = useFileUploadOverlay()

    const result = uploadFile(
      new File(['report'], 'report.txt', { type: 'text/plain' }),
      '/workspace/uploads',
      {
        errorSubtitle: 'Could not upload to Docs',
        errorTitle: 'Transfer failed',
        onProgress,
        successSubtitle: 'Uploaded to Docs',
        successTitle: 'Transfer complete',
        uploadingSubtitle: 'Uploading to Docs',
        uploadingTitle: 'Transferring file...',
      },
    )

    expect(state.isUploading).toBe(true)
    expect(state.uploadStatus).toBe('uploading')
    expect(state.uploadingTitle).toBe('Transferring file...')
    expect(state.uploadingSubtitle).toBe('Uploading to Docs')
    expect(state.errorTitle).toBe('Transfer failed')
    expect(state.errorSubtitle).toBe('Could not upload to Docs')

    await expect(result).resolves.toBe('/workspace/uploads/report.txt')

    expect(state.uploadStatus).toBe('success')
    expect(state.successTitle).toBe('Transfer complete')
    expect(state.successSubtitle).toBe('Uploaded to Docs')
    expect(onProgress).toHaveBeenNthCalledWith(1, 0)
    expect(onProgress).toHaveBeenNthCalledWith(2, 42)
    expect(onProgress).toHaveBeenNthCalledWith(3, 100)
  })
})
