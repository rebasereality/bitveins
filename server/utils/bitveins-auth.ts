import { getValidatedEnv } from './env'

export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

const DEFAULT_AUTH_VERSION = '1'
interface LoginRateLimiterOptions {
  maxAttempts?: number
  windowMs?: number
}

interface LoginAttempt {
  count: number
  resetAt: number
}

export class BitveinsAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BitveinsAuthError'
  }
}

export function getBitveinsAuthVersion(): string {
  const env = getValidatedEnv()
  return env.BITVEINS_AUTH_VERSION || DEFAULT_AUTH_VERSION
}

export function getBitveinsPasswordHash(): string {
  const env = getValidatedEnv()
  const hash = env.BITVEINS_AUTH_PASSWORD_HASH?.trim() || ''

  if (!hash) {
    throw new BitveinsAuthError('BITVEINS_AUTH_PASSWORD_HASH is not configured.')
  }

  return hash
}

export function parseAllowedOrigins(raw = getValidatedEnv().BITVEINS_ALLOWED_ORIGINS): Set<string> {
  const origins = (raw?.trim() ? raw.split(',') : DEFAULT_ALLOWED_ORIGINS)
    .map(origin => origin.trim())
    .filter(Boolean)

  return new Set(origins)
}

export function isOriginAllowed(origin: string | null, allowedOrigins = parseAllowedOrigins()): boolean {
  return !origin || allowedOrigins.has(origin)
}

export function assertAllowedOrigin(origin: string | null): void {
  if (!isOriginAllowed(origin)) {
    throw new BitveinsAuthError('Request origin is not allowed.')
  }
}

export function assertRequestOrigin(event: Parameters<typeof getRequestHeader>[0]): void {
  try {
    assertAllowedOrigin(getRequestHeader(event, 'origin') ?? null)
  }
  catch (error) {
    throw createError({
      statusCode: 403,
      statusMessage: error instanceof Error ? error.message : 'Request origin is not allowed.',
    })
  }
}

export function createLoginRateLimiter(options: LoginRateLimiterOptions = {}) {
  const maxAttempts = options.maxAttempts ?? 5
  const windowMs = options.windowMs ?? 5 * 60_000
  const attempts = new Map<string, LoginAttempt>()

  function currentAttempt(key: string, now: number): LoginAttempt | null {
    const attempt = attempts.get(key)

    if (!attempt) {
      return null
    }

    if (attempt.resetAt <= now) {
      attempts.delete(key)
      return null
    }

    return attempt
  }

  return {
    isLimited(key: string, now = Date.now()): boolean {
      const attempt = currentAttempt(key, now)
      return Boolean(attempt && attempt.count >= maxAttempts)
    },
    recordFailure(key: string, now = Date.now()): void {
      const attempt = currentAttempt(key, now)

      if (!attempt) {
        attempts.set(key, {
          count: 1,
          resetAt: now + windowMs,
        })
        return
      }

      attempt.count += 1
    },
    recordSuccess(key: string): void {
      attempts.delete(key)
    },
  }
}

export async function requireBitveinsSession(event: Parameters<typeof requireUserSession>[0]) {
  const session = await requireUserSession(event, {
    statusCode: 401,
    message: 'Bitveins unlock required.',
  })

  if (session.authVersion !== getBitveinsAuthVersion()) {
    if (isEvent(event)) {
      await clearUserSession(event)
    }
    throw createError({
      statusCode: 401,
      statusMessage: 'Bitveins session has been revoked.',
    })
  }

  return session
}
