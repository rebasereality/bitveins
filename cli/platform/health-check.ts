export interface HealthCheckResult {
  status: number
  url: string
}

export async function waitForBitveinsHealth(
  port: number,
  options: {
    attempts?: number
    delayMs?: number
    fetcher?: typeof fetch
  } = {},
): Promise<HealthCheckResult> {
  const attempts = options.attempts ?? 30
  const delayMs = options.delayMs ?? 250
  const fetcher = options.fetcher ?? fetch
  const url = `http://127.0.0.1:${port}/api/auth/session`
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetcher(url, { redirect: 'manual' })
      if (response.status === 200) {
        return { status: response.status, url }
      }
      lastError = new Error(`Health endpoint returned HTTP ${response.status}.`)
    }
    catch (error) {
      lastError = error
    }

    if (attempt + 1 < attempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw new Error(`Bitveins did not become healthy at ${url}.`, { cause: lastError })
}
