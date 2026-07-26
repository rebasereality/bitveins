/**
 * Utility functions for Bitveins file paste uploads.
 */

export function buildUploadDestinationPath(sessionName?: string | null, windowName?: string | null): string {
  const safeSession = (sessionName || 'default').trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'default'
  const safeWindow = (windowName || 'general').trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'general'
  return `/tmp/bitveins/${safeSession}/${safeWindow}`
}

export function formatPastedFileName(file: File): string {
  const name = file.name ? file.name.trim() : ''
  const ext = getFileExtension(name, file.type)
  const isGeneric = !name || name === 'blob' || /^image\.(png|jpe?g|webp|gif|svg)$/i.test(name) || name === 'file'

  if (isGeneric) {
    const dateStr = formatDateForFileName(new Date())
    return `paste_${dateStr}.${ext}`
  }

  return name
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getFileExtension(filename: string, mimeType: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/)
  if (match?.[1]) {
    return match[1].toLowerCase()
  }

  const mimeMap: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'text/plain': 'txt',
    'application/json': 'json',
    'application/pdf': 'pdf',
  }

  return mimeMap[mimeType] || 'bin'
}

function formatDateForFileName(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const mins = pad(d.getMinutes())
  const secs = pad(d.getSeconds())
  const ms = pad(Math.floor(d.getMilliseconds() / 10))
  return `${year}${month}${day}_${hours}${mins}${secs}_${ms}`
}
