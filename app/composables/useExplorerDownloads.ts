import type { Ref } from 'vue'
import { apiErrorMessage } from '~/utils/api-error'
import { downloadRemotePath, explorerAbsolutePath } from '~/utils/file-download'

export function useExplorerDownloads(
  sessions: Ref<Array<{ name: string, path: string }>>,
  activeSession: Ref<string | null>,
) {
  async function downloadPath(path: string): Promise<void> {
    try {
      await downloadRemotePath(path)
    }
    catch (err: unknown) {
      alert(apiErrorMessage(err, 'Download failed.'))
    }
  }

  function downloadExplorerItem(path: string): void {
    const sessionPath = sessions.value.find(
      session => session.name === activeSession.value,
    )?.path
    void downloadPath(explorerAbsolutePath(sessionPath, path))
  }

  return {
    downloadExplorerItem,
    downloadPath,
  }
}
