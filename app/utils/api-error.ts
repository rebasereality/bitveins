interface ApiErrorShape {
  data?: {
    statusMessage?: unknown
  }
  message?: unknown
  response?: {
    _data?: {
      statusMessage?: unknown
    }
  }
  statusMessage?: unknown
}

function nonEmptyMessage(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) {
    return fallback
  }

  const candidate = error as ApiErrorShape

  return nonEmptyMessage(candidate.data?.statusMessage)
    ?? nonEmptyMessage(candidate.response?._data?.statusMessage)
    ?? nonEmptyMessage(candidate.statusMessage)
    ?? nonEmptyMessage(candidate.message)
    ?? fallback
}

export function isUnauthorizedError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && (error as { statusCode?: unknown }).statusCode === 401
}
