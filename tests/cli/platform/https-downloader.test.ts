import {
  mkdtemp,
  readFile,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest'
import { HttpsDownloader } from '../../../cli/platform/https-downloader'

const temporaryDirectories: string[] = []
const headers = {
  accept: 'application/octet-stream',
  userAgent: 'bitveins-test',
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    path => rm(path, { force: true, recursive: true }),
  ))
})

function fetcher(
  handler: (url: string) => Response | Promise<Response>,
): typeof fetch {
  return async input => await handler(String(input))
}

describe('HttpsDownloader', () => {
  it('follows a bounded HTTPS redirect chain and streams to disk', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bitveins-download-'))
    temporaryDirectories.push(directory)
    const destination = join(directory, 'artifact')
    const calls: string[] = []
    const downloader = new HttpsDownloader(fetcher((url) => {
      calls.push(url)
      if (url.endsWith('/start')) {
        return new Response(null, {
          headers: { location: '/middle' },
          status: 302,
        })
      }
      if (url.endsWith('/middle')) {
        return new Response(null, {
          headers: { location: 'https://cdn.example/artifact' },
          status: 307,
        })
      }
      return new Response('trusted bytes', {
        headers: { 'content-length': '13' },
        status: 200,
      })
    }))

    await downloader.download(
      'https://releases.example/start',
      destination,
      64,
      headers,
    )

    expect(await readFile(destination, 'utf8')).toBe('trusted bytes')
    expect(calls).toEqual([
      'https://releases.example/start',
      'https://releases.example/middle',
      'https://cdn.example/artifact',
    ])
  })

  it('rejects initial and redirected non-HTTPS URLs', async () => {
    const downloader = new HttpsDownloader(fetcher(() => new Response(
      null,
      { headers: { location: 'http://cdn.example/file' }, status: 302 },
    )))

    await expect(downloader.readText(
      'http://releases.example/file',
      64,
      headers,
    )).rejects.toThrow(/non-HTTPS/)
    await expect(downloader.readText(
      'https://releases.example/file',
      64,
      headers,
    )).rejects.toThrow(/non-HTTPS/)
  })

  it('enforces advertised and streamed byte limits independently', async () => {
    const advertised = new HttpsDownloader(fetcher(() => new Response(
      'small',
      { headers: { 'content-length': '1000' } },
    )))
    await expect(advertised.readText(
      'https://releases.example/file',
      8,
      headers,
    )).rejects.toThrow(/8-byte safety limit/)

    const streamed = new HttpsDownloader(fetcher(() => new Response(
      new Uint8Array(16),
    )))
    await expect(streamed.readText(
      'https://releases.example/file',
      8,
      headers,
    )).rejects.toThrow(/8-byte safety limit/)
  })

  it('rejects excessive redirects and missing redirect locations', async () => {
    const excessive = new HttpsDownloader(
      fetcher(() => new Response(null, {
        headers: { location: '/again' },
        status: 302,
      })),
      1,
    )
    await expect(excessive.readText(
      'https://releases.example/start',
      64,
      headers,
    )).rejects.toThrow(/1-redirect safety limit/)

    const missing = new HttpsDownloader(fetcher(() => new Response(
      null,
      { status: 302 },
    )))
    await expect(missing.readText(
      'https://releases.example/start',
      64,
      headers,
    )).rejects.toThrow(/has no location/)
  })
})
