import { parseSessionRoute } from '../shared/navigation/session-route'

export function resolveInternalNotificationUrl(raw: unknown, origin: string): string {
  try {
    if (typeof raw !== 'string' || !raw.startsWith('/')) return origin
    const url = new URL(raw, origin)
    if (url.origin !== origin) return origin
    const parsed = parseSessionRoute(url.pathname, url.search)
    return parsed.valid ? url.toString() : origin
  }
  catch {
    return origin
  }
}
