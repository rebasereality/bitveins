export function explorerAbsolutePath(
  sessionPath: string | undefined,
  itemPath: string,
): string {
  if (!sessionPath || itemPath.startsWith('/')) return itemPath
  return `${sessionPath.replace(/\/+$/, '')}/${itemPath.replace(/^\/+/, '')}`
}

export async function downloadRemotePath(path: string): Promise<void> {
  const requestedPath = path.trim()
  await $fetch('/api/download', {
    query: { check: 'true', path: requestedPath },
  })

  const link = document.createElement('a')
  link.href = `/api/download?path=${encodeURIComponent(requestedPath)}`
  link.download = ''
  document.body.appendChild(link)
  try {
    link.click()
  }
  finally {
    link.remove()
  }
}
