import { reactive } from 'vue'
import { formatFileSize, formatPastedFileName } from '~/utils/upload-path'

export interface UploadState {
  destinationPath: string
  errorSubtitle: string
  errorTitle: string
  errorMessage: string | null
  fileName: string
  fileSizeFormatted: string
  isUploading: boolean
  progress: number
  successSubtitle: string
  successTitle: string
  uploadingSubtitle: string
  uploadingTitle: string
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error'
}

export interface UploadFileOptions {
  errorSubtitle?: string
  errorTitle?: string
  onProgress?: (progress: number) => void
  successSubtitle?: string
  successTitle?: string
  uploadingSubtitle?: string
  uploadingTitle?: string
}

const state = reactive<UploadState>({
  destinationPath: '',
  errorSubtitle: 'An error occurred while sending the file',
  errorTitle: 'Upload failed',
  errorMessage: null,
  fileName: '',
  fileSizeFormatted: '',
  isUploading: false,
  progress: 0,
  successSubtitle: 'Path copied to cursor',
  successTitle: 'Upload complete',
  uploadingSubtitle: 'XHR transfer in progress',
  uploadingTitle: 'Uploading file...',
  uploadStatus: 'idle',
})

let dismissTimer: ReturnType<typeof setTimeout> | null = null

export function useFileUploadOverlay() {
  function uploadFile(
    file: File,
    destPath: string,
    options: UploadFileOptions = {},
  ): Promise<string> {
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimer = null
    }

    const formattedName = formatPastedFileName(file)
    state.fileName = formattedName
    state.fileSizeFormatted = formatFileSize(file.size)
    state.destinationPath = destPath
    state.progress = 0
    state.errorTitle = options.errorTitle ?? 'Upload failed'
    state.errorSubtitle = options.errorSubtitle ?? 'An error occurred while sending the file'
    state.successTitle = options.successTitle ?? 'Upload complete'
    state.successSubtitle = options.successSubtitle ?? 'Path copied to cursor'
    state.uploadingTitle = options.uploadingTitle ?? 'Uploading file...'
    state.uploadingSubtitle = options.uploadingSubtitle ?? 'XHR transfer in progress'
    state.errorMessage = null
    state.uploadStatus = 'uploading'
    state.isUploading = true
    options.onProgress?.(0)

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && e.total > 0) {
          state.progress = Math.min(99, Math.round((e.loaded / e.total) * 100))
          options.onProgress?.(state.progress)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText) as { path?: string, success?: boolean }
            if (res.success && res.path) {
              state.progress = 100
              options.onProgress?.(100)
              state.uploadStatus = 'success'
              dismissTimer = setTimeout(() => {
                state.isUploading = false
                state.uploadStatus = 'idle'
              }, 600)
              resolve(res.path)
              return
            }
          }
          catch {
            // Invalid JSON
          }
        }

        const errorMsg = `Upload failed (${xhr.status}: ${xhr.statusText || 'Server error'})`
        state.errorMessage = errorMsg
        state.uploadStatus = 'error'
        reject(new Error(errorMsg))
      })

      xhr.addEventListener('error', () => {
        const errorMsg = 'Network error during file upload'
        state.errorMessage = errorMsg
        state.uploadStatus = 'error'
        reject(new Error(errorMsg))
      })

      xhr.addEventListener('abort', () => {
        const errorMsg = 'Upload cancelled'
        state.errorMessage = errorMsg
        state.uploadStatus = 'error'
        reject(new Error(errorMsg))
      })

      xhr.open('POST', '/api/upload')

      const formData = new FormData()
      formData.append('path', destPath)
      formData.append('file', file, formattedName)

      xhr.send(formData)
    })
  }

  function dismissError(): void {
    state.isUploading = false
    state.errorMessage = null
    state.uploadStatus = 'idle'
  }

  return {
    dismissError,
    state,
    uploadFile,
  }
}
