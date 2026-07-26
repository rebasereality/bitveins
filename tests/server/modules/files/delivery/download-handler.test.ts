import { Readable } from 'node:stream'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDownloadHandler } from '../../../../../server/modules/files/delivery/download-handler'

interface TestResponse {
  headers: Map<string, number | string>
  streams: Readable[]
}

function createResponse(): TestResponse & {
  sendStream(stream: Readable): Readable
  setHeader(name: string, value: number | string): void
} {
  const response = {
    headers: new Map<string, number | string>(),
    streams: [] as Readable[],
    sendStream(stream: Readable) {
      response.streams.push(stream)
      return stream
    },
    setHeader(name: string, value: number | string) {
      response.headers.set(name, value)
    },
  }
  return response
}

describe('createDownloadHandler', () => {
  let tempDir = ''

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'bitveins-download-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  function setup() {
    const directoryStream = Readable.from(['archive'])
    const fileStream = Readable.from(['file'])
    const handler = createDownloadHandler({
      createDirectoryStream: vi.fn(() => directoryStream),
      createFileStream: vi.fn(() => fileStream),
      exists: (path) => {
        try {
          return Boolean(path && requireStat(path))
        }
        catch {
          return false
        }
      },
      normalizePath: path => path,
      stat: requireStat,
    })
    return { directoryStream, fileStream, handler }
  }

  it('validates required and existing paths with typed HTTP errors', async () => {
    const { handler } = setup()
    const response = createResponse()

    await expect(handler({}, response)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Path is required.',
    })
    await expect(handler({ path: join(tempDir, 'missing') }, response)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('returns check-only validation for files and directories', async () => {
    const { handler } = setup()
    const file = join(tempDir, 'test.txt')
    const directory = join(tempDir, 'directory')
    writeFileSync(file, 'hello')
    mkdirSync(directory)

    await expect(handler({ check: 'true', path: file }, createResponse()))
      .resolves.toEqual({ valid: true })
    await expect(handler({ check: 'true', path: directory }, createResponse()))
      .resolves.toEqual({ valid: true })
  })

  it('sets file headers and streams through the response port', async () => {
    const { fileStream, handler } = setup()
    const file = join(tempDir, 'test.txt')
    writeFileSync(file, 'hello world!')
    const response = createResponse()

    await expect(handler({ path: file }, response)).resolves.toBe(fileStream)
    expect(response.headers).toEqual(new Map([
      ['Content-Disposition', 'attachment; filename="test.txt"'],
      ['Content-Type', 'application/octet-stream'],
      ['Content-Length', 12],
    ]))
  })

  it('sets archive headers and uses the directory stream factory', async () => {
    const { directoryStream, handler } = setup()
    const directory = join(tempDir, 'folder')
    mkdirSync(directory)
    const response = createResponse()

    await expect(handler({ path: directory }, response)).resolves.toBe(directoryStream)
    expect(response.headers).toEqual(new Map([
      ['Content-Disposition', 'attachment; filename="folder.zip"'],
      ['Content-Type', 'application/zip'],
    ]))
  })

  it('uses a stable archive name when the normalized directory is a root', async () => {
    const handler = createDownloadHandler({
      createDirectoryStream: () => Readable.from([]),
      createFileStream: () => Readable.from([]),
      exists: () => true,
      normalizePath: () => '/',
      stat: () => ({
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
      }),
    })
    const response = createResponse()

    await handler({ path: '~' }, response)

    expect(response.headers.get('Content-Disposition'))
      .toBe('attachment; filename="archive.zip"')
  })

  it('maps path normalization and unsupported file type failures', async () => {
    const normalizationFailure = createDownloadHandler({
      createDirectoryStream: () => Readable.from([]),
      createFileStream: () => Readable.from([]),
      exists: () => true,
      normalizePath: () => {
        throw new Error('bad path')
      },
      stat: requireStat,
    })
    await expect(normalizationFailure({ path: '/bad' }, createResponse())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'bad path',
    })

    const unsupported = createDownloadHandler({
      createDirectoryStream: () => Readable.from([]),
      createFileStream: () => Readable.from([]),
      exists: () => true,
      normalizePath: path => path,
      stat: () => ({
        isDirectory: () => false,
        isFile: () => false,
        size: 0,
      }),
    })
    await expect(unsupported({ path: '/device' }, createResponse())).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Specified path is neither a file nor a directory.',
    })
  })
})

function requireStat(path: string) {
  return statSync(path)
}
