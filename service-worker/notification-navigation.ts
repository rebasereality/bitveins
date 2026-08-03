export function resolveInternalNotificationUrl(raw: unknown, origin: string): string {
  try {
    if (typeof raw !== 'string') return origin
    const url = new URL(raw, origin)
    if (url.origin !== origin || url.pathname !== '/') return origin
    const allowed = new Set(['event', 'session', 'window'])
    for (const key of url.searchParams.keys()) {
      if (!allowed.has(key)) return origin
    }
    return url.toString()
  }
  catch {
    return origin
  }
}
