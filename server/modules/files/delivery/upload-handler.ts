import { basename, dirname, join } from 'node:path'
import { createError } from 'h3'

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024

export interface UploadPart {
  data: Uint8Array
  filename?: string
  name?: string
}

interface UploadHandlerOptions {
  home: string
  maxUploadBytes?: number
  mkdir(path: string): Promise<unknown>
  writeFile(path: string, data: Uint8Array): Promise<unknown>
}

export interface UploadRequest {
  contentLength?: string
  multipart?: readonly UploadPart[] | null
}

export function normalizeUploadDestinationPath(path: string, home: string): string {
  if (path === '~') {
    return home
  }
  if (path.startsWith('~/')) {
    return join(home, path.slice(2))
  }
  if (path.startsWith('~')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only ~ for the current user home directory is supported.',
    })
  }
  return path
}

export function sanitizeUploadFilename(filename: string): string {
  const normalized = basename(filename.replaceAll('\\', '/'))
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()

  return !normalized || normalized === '.' || normalized === '..'
    ? 'uploaded_file'
    : normalized
}

export function createUploadHandler(options: UploadHandlerOptions) {
  const maxUploadBytes = options.maxUploadBytes ?? MAX_UPLOAD_BYTES

  return async (request: UploadRequest) => {
    const contentLength = Number(request.contentLength)
    if (
      Number.isFinite(contentLength)
      && contentLength > maxUploadBytes + MAX_MULTIPART_OVERHEAD_BYTES
    ) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Upload exceeds the 50 MiB limit.',
      })
    }

    const multipart = request.multipart
    if (!multipart) {
      throw createError({ statusCode: 400, statusMessage: 'No multipart data' })
    }

    const pathField = multipart.find(field => field.name === 'path')
    const fileField = multipart.find(field => field.name === 'file')
    if (!pathField || !fileField) {
      throw createError({ statusCode: 400, statusMessage: 'Missing path or file' })
    }

    const destination = normalizeUploadDestinationPath(
      Buffer.from(pathField.data).toString(),
      options.home,
    )
    const filename = sanitizeUploadFilename(fileField.filename || 'uploaded_file')
    if (fileField.data.byteLength > maxUploadBytes) {
      throw createError({
        statusCode: 413,
        statusMessage: 'Upload exceeds the 50 MiB limit.',
      })
    }

    const fullDestination = join(destination, filename)
    await options.mkdir(dirname(fullDestination))
    await options.writeFile(fullDestination, fileField.data)

    return {
      path: fullDestination,
      success: true as const,
    }
  }
}
