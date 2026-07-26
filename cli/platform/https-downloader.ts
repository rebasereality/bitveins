import {
  open,
  rm,
} from 'node:fs/promises'
import { CliIntegrityError, CliServiceError } from '../core/cli-error'

const redirectStatuses = new Set([301, 302, 303, 307, 308])

export interface DownloadHeaders {
  readonly accept: string
  readonly userAgent: string
}

export class HttpsDownloader {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly maxRedirects = 5,
  ) {}

  async download(
    url: string,
    destination: string,
    maximumBytes: number,
    headers: DownloadHeaders,
  ): Promise<void> {
    const response = await this.request(url, headers)
    this.assertDownloadable(response, url, maximumBytes)
    if (!response.body) {
      throw new CliServiceError(`Download returned no body: ${url}`)
    }

    const handle = await open(destination, 'wx', 0o600)
    const reader = response.body.getReader()
    let received = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
        received += chunk.value.byteLength
        if (received > maximumBytes) {
          await reader.cancel()
          throw this.limitError(maximumBytes)
        }
        await handle.write(chunk.value)
      }
      await handle.sync()
    }
    catch (error) {
      await rm(destination, { force: true })
      throw error
    }
    finally {
      await handle.close()
    }
  }

  async readText(
    url: string,
    maximumBytes: number,
    headers: DownloadHeaders,
  ): Promise<string> {
    const response = await this.request(url, headers)
    this.assertDownloadable(response, url, maximumBytes)
    if (!response.body) {
      throw new CliServiceError(`Download returned no body: ${url}`)
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }
      received += chunk.value.byteLength
      if (received > maximumBytes) {
        await reader.cancel()
        throw this.limitError(maximumBytes)
      }
      chunks.push(chunk.value)
    }
    return Buffer.concat(chunks).toString('utf8')
  }

  private assertDownloadable(
    response: Response,
    url: string,
    maximumBytes: number,
  ): void {
    if (!response.ok) {
      throw new CliServiceError(
        `Unable to download ${url}: HTTP ${response.status}.`,
      )
    }
    const header = response.headers.get('content-length')
    if (header !== null) {
      const advertised = Number(header)
      if (Number.isFinite(advertised) && advertised > maximumBytes) {
        throw this.limitError(maximumBytes)
      }
    }
  }

  private limitError(maximumBytes: number): CliIntegrityError {
    return new CliIntegrityError(
      `Download exceeds the ${maximumBytes}-byte safety limit.`,
    )
  }

  private async request(
    source: string,
    headers: DownloadHeaders,
  ): Promise<Response> {
    let url = new URL(source)
    this.assertHttps(url)

    for (let redirects = 0; ; redirects += 1) {
      const response = await this.fetcher(url, {
        headers: {
          'accept': headers.accept,
          'User-Agent': headers.userAgent,
        },
        redirect: 'manual',
      })
      if (!redirectStatuses.has(response.status)) {
        return response
      }
      if (redirects >= this.maxRedirects) {
        throw new CliIntegrityError(
          `Download exceeded the ${this.maxRedirects}-redirect safety limit.`,
        )
      }
      const location = response.headers.get('location')
      if (!location) {
        throw new CliServiceError(
          `Download redirect from ${url.href} has no location.`,
        )
      }
      await response.body?.cancel()
      url = new URL(location, url)
      this.assertHttps(url)
    }
  }

  private assertHttps(url: URL): void {
    if (url.protocol !== 'https:') {
      throw new CliIntegrityError(
        `Refusing non-HTTPS release download: ${url.href}`,
      )
    }
  }
}
