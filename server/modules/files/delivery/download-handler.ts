import type { Readable } from 'node:stream'
import { basename } from 'node:path'
import { createError } from 'h3'

interface DownloadFileStat {
  isDirectory(): boolean
  isFile(): boolean
  size: number
}

interface DownloadResponse {
  sendStream(stream: Readable): unknown
  setHeader(name: string, value: number | string): void
}

interface DownloadHandlerOptions {
  createDirectoryStream(path: string): Readable
  createFileStream(path: string): Readable
  exists(path: string): boolean
  normalizePath(path: string): string
  stat(path: string): DownloadFileStat
}

export interface DownloadRequest {
  check?: unknown
  path?: unknown
}

export function createDownloadHandler(options: DownloadHandlerOptions) {
  return async (request: DownloadRequest, response: DownloadResponse) => {
    const pathParam = request.path
    const checkOnly = request.check === 'true'

    if (typeof pathParam !== 'string' || !pathParam.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Path is required.' })
    }

    let fullPath: string
    try {
      fullPath = options.normalizePath(pathParam)
    }
    catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid path.'
      throw createError({ statusCode: 400, statusMessage: message })
    }

    if (!options.exists(fullPath)) {
      throw createError({
        statusCode: 404,
        statusMessage: `File not found at: ${pathParam}`,
      })
    }

    const stat = options.stat(fullPath)
    const isDirectory = stat.isDirectory()
    if (!stat.isFile() && !isDirectory) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Specified path is neither a file nor a directory.',
      })
    }

    if (checkOnly) {
      return { valid: true as const }
    }

    if (isDirectory) {
      const filename = `${basename(fullPath) || 'archive'}.zip`
      response.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      response.setHeader('Content-Type', 'application/zip')
      return response.sendStream(options.createDirectoryStream(fullPath))
    }

    response.setHeader('Content-Disposition', `attachment; filename="${basename(fullPath)}"`)
    response.setHeader('Content-Type', 'application/octet-stream')
    response.setHeader('Content-Length', stat.size)
    return response.sendStream(options.createFileStream(fullPath))
  }
}
