import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createUploadHandler,
  normalizeUploadDestinationPath,
  sanitizeUploadFilename,
} from '../../../../../server/modules/files/delivery/upload-handler'

const home = '/home/test'

function field(name: string, data: string, filename?: string) {
  return {
    data: Buffer.from(data),
    filename,
    name,
  }
}

describe('upload path normalization', () => {
  it('expands only current-user home shorthand', () => {
    expect(normalizeUploadDestinationPath('~', home)).toBe(home)
    expect(normalizeUploadDestinationPath('~/uploads', home)).toBe(join(home, 'uploads'))
    expect(normalizeUploadDestinationPath('/tmp/uploads', home)).toBe('/tmp/uploads')
  })

  it('rejects unsupported user-home shorthand', () => {
    expect(() => normalizeUploadDestinationPath('~someone/uploads', home))
      .toThrow('Only ~ for the current user home directory is supported.')
  })

  it('sanitizes directory components, control characters, and empty names', () => {
    expect(sanitizeUploadFilename('../../escape.txt')).toBe('escape.txt')
    expect(sanitizeUploadFilename('..\\..\\escape.txt')).toBe('escape.txt')
    expect(sanitizeUploadFilename(' report\u0000.txt ')).toBe('report.txt')
    expect(sanitizeUploadFilename('')).toBe('uploaded_file')
    expect(sanitizeUploadFilename('.')).toBe('uploaded_file')
    expect(sanitizeUploadFilename('..')).toBe('uploaded_file')
  })
})

describe('createUploadHandler', () => {
  it('writes a sanitized upload through typed filesystem ports', async () => {
    const mkdir = vi.fn(async () => {})
    const writeFile = vi.fn(async () => {})
    const handler = createUploadHandler({
      home,
      mkdir,
      writeFile,
    })

    await expect(handler({
      multipart: [
        field('path', '~/uploads'),
        field('file', 'contents', '../../safe.txt'),
      ],
    })).resolves.toEqual({
      path: '/home/test/uploads/safe.txt',
      success: true,
    })
    expect(mkdir).toHaveBeenCalledWith('/home/test/uploads')
    expect(writeFile).toHaveBeenCalledWith(
      '/home/test/uploads/safe.txt',
      Buffer.from('contents'),
    )
  })

  it('rejects missing multipart data and required fields', async () => {
    const handler = createUploadHandler({
      home,
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
    })

    await expect(handler({})).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'No multipart data',
    })
    await expect(handler({
      multipart: [field('path', '/tmp')],
    })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Missing path or file',
    })
  })

  it('enforces both request and decoded file limits', async () => {
    const handler = createUploadHandler({
      home,
      maxUploadBytes: 4,
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async () => {}),
    })

    await expect(handler({
      contentLength: String(4 + 1024 * 1024 + 1),
    })).rejects.toMatchObject({ statusCode: 413 })
    await expect(handler({
      multipart: [
        field('path', '/tmp'),
        field('file', '12345', 'file.txt'),
      ],
    })).rejects.toMatchObject({ statusCode: 413 })
  })
})
