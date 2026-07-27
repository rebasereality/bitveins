import { ref } from 'vue'
import { apiErrorMessage } from '~/utils/api-error'
import { downloadRemotePath } from '~/utils/file-download'

export function useFileDownloadModal() {
  const downloadModalOpen = ref(false)
  const downloadPath = ref('')
  const downloadError = ref<string | null>(null)
  const downloadLoading = ref(false)

  function openDownloadModal(): void {
    downloadModalOpen.value = true
    downloadPath.value = ''
    downloadError.value = null
    downloadLoading.value = false
  }

  async function handleDownloadFile(): Promise<void> {
    downloadError.value = null
    downloadLoading.value = true
    try {
      await downloadRemotePath(downloadPath.value)
      downloadModalOpen.value = false
    }
    catch (err: unknown) {
      downloadError.value = apiErrorMessage(err, 'Download failed.')
    }
    finally {
      downloadLoading.value = false
    }
  }

  return {
    downloadModalOpen,
    downloadPath,
    downloadError,
    downloadLoading,
    openDownloadModal,
    handleDownloadFile,
  }
}
