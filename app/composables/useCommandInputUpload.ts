import { nextTick, ref, type Ref } from 'vue'
import type { InputMode } from '~/types/session'
import { useFileUploadOverlay } from '~/composables/useFileUploadOverlay'
import { buildUploadDestinationPath } from '~/utils/upload-path'

export function useCommandInputUpload(
  value: Ref<string>,
  props: {
    inputMode: InputMode
    sessionName: string | null
    windowName?: string | null
  },
  textareaRefGetter: () => HTMLTextAreaElement | null,
  sendLiveInput: (data: string) => void,
) {
  const { uploadFile } = useFileUploadOverlay()
  const fileInput = ref<HTMLInputElement | null>(null)

  function insertTextAtCaret(el: HTMLTextAreaElement, textToInsert: string): void {
    const start = el.selectionStart ?? value.value.length
    const end = el.selectionEnd ?? value.value.length

    const val = value.value
    const spaceBefore = start > 0 && !/\s$/.test(val.slice(0, start)) ? ' ' : ''
    const spaceAfter = end < val.length && !/^\s/.test(val.slice(end)) ? ' ' : ''
    const inserted = `${spaceBefore}${textToInsert}${spaceAfter}`

    value.value = val.slice(0, start) + inserted + val.slice(end)

    nextTick(() => {
      const newPos = start + inserted.length
      if (typeof el.setSelectionRange === 'function') {
        el.setSelectionRange(newPos, newPos)
      }
      el.focus()
    })
  }

  function insertUploadedPath(uploadedPath: string, targetElement: HTMLTextAreaElement | null): void {
    if (props.inputMode === 'live') {
      sendLiveInput(uploadedPath)
      return
    }

    if (targetElement) {
      insertTextAtCaret(targetElement, uploadedPath)
      return
    }

    const space = value.value && !value.value.endsWith(' ') ? ' ' : ''
    value.value = value.value + space + uploadedPath
  }

  async function uploadFiles(
    files: File[],
    targetElement: HTMLTextAreaElement | null = textareaRefGetter(),
  ): Promise<void> {
    const destPath = buildUploadDestinationPath(props.sessionName, props.windowName)

    for (const file of files) {
      try {
        insertUploadedPath(await uploadFile(file, destPath), targetElement)
      }
      catch (err) {
        console.error('Failed to upload file:', err)
      }
    }
  }

  async function onPaste(event: ClipboardEvent): Promise<void> {
    const clipboardData = event.clipboardData
    if (!clipboardData) return

    const files: File[] = []
    if (clipboardData.files && clipboardData.files.length > 0) {
      files.push(...Array.from(clipboardData.files))
    }
    else if (clipboardData.items) {
      for (const item of Array.from(clipboardData.items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    }

    if (files.length === 0) return

    event.preventDefault()
    event.stopPropagation()

    const targetElement = (event.target as HTMLTextAreaElement | HTMLInputElement | null) || textareaRefGetter()
    const insertionTarget = targetElement
      && (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'INPUT')
      ? targetElement as HTMLTextAreaElement
      : textareaRefGetter()
    await uploadFiles(files, insertionTarget)
  }

  function triggerFilePicker(): void {
    if (fileInput.value) {
      fileInput.value.value = ''
      fileInput.value.click()
    }
  }

  async function onFileSelected(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement
    if (!target.files || target.files.length === 0) return

    await uploadFiles(Array.from(target.files))
  }

  async function readAndUploadClipboard(): Promise<void> {
    if (!import.meta.client || !navigator.clipboard) return

    try {
      if (typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read()
        const files: File[] = []

        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/') || type.startsWith('application/') || type.startsWith('video/')) {
              const blob = await item.getType(type)
              const ext = type.split('/')[1] || 'png'
              const file = new File([blob], `paste_${Date.now()}.${ext}`, { type })
              files.push(file)
            }
          }
        }

        if (files.length > 0) {
          await uploadFiles(files)
          return
        }
      }

      if (typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText()
        if (text) {
          const activeEl = textareaRefGetter()

          if (activeEl) {
            insertTextAtCaret(activeEl, text)
          }
          else {
            const space = value.value && !value.value.endsWith(' ') ? ' ' : ''
            value.value = value.value + space + text
          }
        }
      }
    }
    catch (err) {
      console.warn('Clipboard read error:', err)
    }
  }

  async function onDrop(event: DragEvent): Promise<void> {
    const dataTransfer = event.dataTransfer
    if (!dataTransfer || !dataTransfer.files || dataTransfer.files.length === 0) return

    event.preventDefault()
    event.stopPropagation()

    const targetElement = (event.target as HTMLTextAreaElement | HTMLInputElement | null) || textareaRefGetter()
    const insertionTarget = targetElement
      && (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'INPUT')
      ? targetElement as HTMLTextAreaElement
      : textareaRefGetter()
    await uploadFiles(Array.from(dataTransfer.files), insertionTarget)
  }

  return {
    fileInput,
    onPaste,
    triggerFilePicker,
    onFileSelected,
    readAndUploadClipboard,
    onDrop,
    uploadFiles,
  }
}
