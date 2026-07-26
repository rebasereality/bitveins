import { onMounted, ref } from 'vue'
import { useFileUploadOverlay } from '~/composables/useFileUploadOverlay'

export interface Dropzone {
  name: string
  path: string
}

export interface DropzoneUpload {
  destinationName: string
  destinationPath: string
  error?: string
  file: string
  progress: number
  status: 'error' | 'uploading'
}

export function useSessionDropzones() {
  const { uploadFile } = useFileUploadOverlay()
  const dropzones = useState<Dropzone[]>('bitveins.transfer-destinations', () => [])
  const dropzonesLoaded = useState<boolean>('bitveins.transfer-destinations-loaded', () => false)
  const dropzonesLoading = useState<boolean>('bitveins.transfer-destinations-loading', () => false)
  const dropzoneUploads = useState<Record<string, DropzoneUpload>>(
    'bitveins.transfer-uploads',
    () => ({}),
  )
  const dropzoneModalOpen = ref(false)
  const dropzoneName = ref('')
  const dropzonePath = ref('')
  const fileInput = ref<HTMLInputElement | null>(null)
  const activePickerDropzone = ref<Dropzone | null>(null)
  let uploadSequence = 0

  async function fetchDropzones() {
    if (dropzonesLoaded.value || dropzonesLoading.value) return
    dropzonesLoading.value = true
    try {
      const data = await $fetch<{ dropzones: Dropzone[] }>('/api/dropzones')
      dropzones.value = data.dropzones
      dropzonesLoaded.value = true
    }
    catch (err) {
      console.error('Failed to fetch dropzones:', err)
    }
    finally {
      dropzonesLoading.value = false
    }
  }

  async function syncDropzones(val: Dropzone[]) {
    try {
      await $fetch('/api/dropzones', {
        method: 'POST',
        body: { dropzones: val },
      })
    }
    catch (err) {
      console.error('Failed to sync dropzones:', err)
    }
  }

  onMounted(() => {
    void fetchDropzones()
  })

  function openDropzoneModal(): void {
    dropzoneModalOpen.value = true
    dropzoneName.value = ''
    dropzonePath.value = ''
  }

  function createDropzone(): void {
    dropzones.value.push({
      name: dropzoneName.value,
      path: dropzonePath.value || '~',
    })
    dropzoneModalOpen.value = false
    void syncDropzones([...dropzones.value])
  }

  function deleteDropzone(index: number): void {
    dropzones.value.splice(index, 1)
    void syncDropzones([...dropzones.value])
  }

  async function uploadFiles(files: File[], dropzone: Dropzone): Promise<void> {
    for (const file of files) {
      uploadSequence += 1
      const uploadId = `${dropzone.name}-${Date.now()}-${uploadSequence}`

      dropzoneUploads.value[uploadId] = {
        destinationName: dropzone.name,
        destinationPath: dropzone.path,
        progress: 0,
        file: file.name,
        status: 'uploading',
      }

      try {
        await uploadFile(file, dropzone.path, {
          errorSubtitle: `Could not upload to ${dropzone.name}`,
          errorTitle: 'Transfer failed',
          onProgress: (progress) => {
            const upload = dropzoneUploads.value[uploadId]
            if (!upload) return
            dropzoneUploads.value[uploadId] = {
              ...upload,
              progress,
            }
          },
          successSubtitle: `Uploaded to ${dropzone.name}`,
          successTitle: 'Transfer complete',
          uploadingSubtitle: `Uploading to ${dropzone.name}`,
          uploadingTitle: 'Transferring file...',
        })
        removeUpload(uploadId)
      }
      catch (error) {
        failUpload(
          uploadId,
          error instanceof Error ? error.message : 'Upload failed',
        )
      }
    }
  }

  function removeUpload(uploadId: string): void {
    const { [uploadId]: _, ...next } = dropzoneUploads.value
    dropzoneUploads.value = next
  }

  function failUpload(uploadId: string, error: string): void {
    const upload = dropzoneUploads.value[uploadId]
    if (!upload) return
    dropzoneUploads.value[uploadId] = {
      ...upload,
      error,
      status: 'error',
    }
    window.setTimeout(() => removeUpload(uploadId), 5000)
  }

  function triggerFilePicker(dropzone: Dropzone): void {
    activePickerDropzone.value = dropzone
    if (fileInput.value) {
      fileInput.value.value = ''
      fileInput.value.click()
    }
  }

  async function onFileSelected(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement
    if (!target.files?.length || !activePickerDropzone.value) return

    const files = Array.from(target.files)
    await uploadFiles(files, activePickerDropzone.value)
    activePickerDropzone.value = null
  }

  return {
    dropzones,
    dropzoneModalOpen,
    dropzoneName,
    dropzonePath,
    dropzoneUploads,
    fileInput,
    activePickerDropzone,
    openDropzoneModal,
    createDropzone,
    deleteDropzone,
    uploadFiles,
    triggerFilePicker,
    onFileSelected,
  }
}
