const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/u
const SESSION_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/u
const EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{12,80}$/u
const WINDOW_NUMBER_PATTERN = /^(0|[1-9]\d{0,9})$/u
const MAX_URL_LENGTH = 2048
const MAX_EXPLORER_PATH_LENGTH = 1024

export type SessionRouteTarget
  = | { kind: 'home', eventId?: string }
    | { kind: 'session', sessionName: string, eventId?: string }
    | { kind: 'stable-session', sessionId: string, sessionName: string, eventId?: string }
    | { kind: 'terminal', sessionId: string, sessionName: string, windowNumber: number, eventId?: string }
    | { kind: 'explorer', sessionId: string, sessionName: string, path: string | null, eventId?: string }
    | { kind: 'legacy', sessionName: string, windowId?: string, eventId?: string }

export type ParsedSessionRoute
  = | { valid: true, target: SessionRouteTarget }
    | { valid: false, reason: string }

export interface CanonicalSessionIdentity {
  id: string
  name: string
}

function invalid(reason: string): ParsedSessionRoute {
  return { valid: false, reason }
}

export function isSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value)
}

export function isSessionRouteName(value: string): boolean {
  return SESSION_NAME_PATTERN.test(value) && !value.includes('~')
}

function decodeSegment(value: string): string | null {
  if (/%2f|%5c/iu.test(value)) return null
  try {
    const decoded = decodeURIComponent(value)
    if (!decoded || decoded === '.' || decoded === '..') return null
    if (decoded.includes('/') || decoded.includes('\\') || /[\u0000-\u001F\u007F]/u.test(decoded)) return null
    return decoded
  }
  catch {
    return null
  }
}

function readEvent(search: string): { eventId?: string, valid: boolean } {
  const query = new URLSearchParams(search)
  const keys = [...query.keys()]
  if (keys.some(key => key !== 'event') || query.getAll('event').length > 1) return { valid: false }
  const eventId = query.get('event') ?? undefined
  if (eventId && !EVENT_ID_PATTERN.test(eventId)) return { valid: false }
  return { eventId, valid: true }
}

function readHomeEvent(search: string): { eventId?: string, valid: boolean } {
  const query = new URLSearchParams(search)
  const sources = query.getAll('source')
  if (sources.length > 1 || (sources.length === 1 && sources[0] !== 'pwa')) {
    return { valid: false }
  }
  query.delete('source')
  return readEvent(query.toString())
}

function parseLegacy(search: string): ParsedSessionRoute | null {
  const query = new URLSearchParams(search)
  const keys = [...query.keys()]
  if (!keys.some(key => key === 'session' || key === 'window')) return null
  if (keys.some(key => !['event', 'session', 'window'].includes(key))) return invalid('Unsupported legacy query parameter.')
  if (['event', 'session', 'window'].some(key => query.getAll(key).length > 1)) return invalid('Duplicate legacy query parameter.')
  const sessionName = query.get('session') ?? ''
  const windowId = query.get('window') ?? undefined
  const eventId = query.get('event') ?? undefined
  if (!isSessionRouteName(sessionName)) return invalid('Invalid legacy session name.')
  if (windowId && !/^@\d{1,10}$/u.test(windowId)) return invalid('Invalid legacy window id.')
  if (eventId && !EVENT_ID_PATTERN.test(eventId)) return invalid('Invalid attention event id.')
  return { valid: true, target: { kind: 'legacy', sessionName, ...(windowId ? { windowId } : {}), ...(eventId ? { eventId } : {}) } }
}

export function parseSessionRoute(pathname: string, search = ''): ParsedSessionRoute {
  if (`${pathname}${search}`.length > MAX_URL_LENGTH) return invalid('Session URL is too long.')
  if (!pathname.startsWith('/')) return invalid('Session URL must be absolute.')
  if (pathname === '/') {
    const legacy = parseLegacy(search)
    if (legacy) return legacy
    const event = readHomeEvent(search)
    return event.valid
      ? { valid: true, target: { kind: 'home', ...(event.eventId ? { eventId: event.eventId } : {}) } }
      : invalid('Invalid query parameters.')
  }

  const event = readEvent(search)
  if (!event.valid) return invalid('Invalid query parameters.')
  const rawSegments = pathname.slice(1).split('/')
  if (rawSegments[0] !== 's' || rawSegments.length < 2) return invalid('Unknown route.')
  const rawIdentity = rawSegments[1] ?? ''
  const separator = rawIdentity.lastIndexOf('~')

  if (separator === -1) {
    if (rawSegments.length !== 2) return invalid('A convenience session route cannot include a view.')
    const name = decodeSegment(rawIdentity)
    if (!name || !isSessionRouteName(name)) return invalid('Invalid session name.')
    return { valid: true, target: { kind: 'session', sessionName: name, ...(event.eventId ? { eventId: event.eventId } : {}) } }
  }

  const name = decodeSegment(rawIdentity.slice(0, separator))
  const id = rawIdentity.slice(separator + 1)
  if (!name || !isSessionRouteName(name) || !isSessionId(id)) return invalid('Invalid session identity.')
  const view = rawSegments[2]
  if (rawSegments.length === 2) {
    return {
      valid: true,
      target: {
        kind: 'stable-session',
        sessionId: id,
        sessionName: name,
        ...(event.eventId ? { eventId: event.eventId } : {}),
      },
    }
  }
  if (view === 't' && rawSegments.length === 4) {
    const number = rawSegments[3] ?? ''
    if (!WINDOW_NUMBER_PATTERN.test(number)) return invalid('Invalid tmux window number.')
    return {
      valid: true,
      target: {
        kind: 'terminal',
        sessionId: id,
        sessionName: name,
        windowNumber: Number(number),
        ...(event.eventId ? { eventId: event.eventId } : {}),
      },
    }
  }
  if (view === 'e' && rawSegments.length >= 3) {
    const decoded = rawSegments.slice(3).map(decodeSegment)
    if (decoded.some(segment => segment === null)) return invalid('Invalid Explorer path.')
    const path = decoded.length ? decoded.join('/') : null
    if (path && path.length > MAX_EXPLORER_PATH_LENGTH) return invalid('Explorer path is too long.')
    return {
      valid: true,
      target: {
        kind: 'explorer',
        sessionId: id,
        sessionName: name,
        path,
        ...(event.eventId ? { eventId: event.eventId } : {}),
      },
    }
  }
  return invalid('Invalid session view route.')
}

function eventSearch(eventId?: string): string {
  return eventId ? `?event=${encodeURIComponent(eventId)}` : ''
}

function identitySegment(session: CanonicalSessionIdentity): string {
  if (!isSessionRouteName(session.name) || !isSessionId(session.id)) throw new Error('Invalid canonical session identity.')
  return `${encodeURIComponent(session.name)}~${session.id}`
}

export function terminalSessionRoute(
  session: CanonicalSessionIdentity,
  windowId: string,
  eventId?: string,
): string {
  if (!/^@\d{1,10}$/u.test(windowId)) throw new Error('Invalid tmux window id.')
  return `/s/${identitySegment(session)}/t/${windowId.slice(1)}${eventSearch(eventId)}`
}

export function explorerSessionRoute(
  session: CanonicalSessionIdentity,
  path: string | null,
  eventId?: string,
): string {
  const suffix = path
    ? `/${path.split('/').map((segment) => {
      if (!segment || segment === '.' || segment === '..' || segment.includes('\\') || /[\u0000-\u001F\u007F]/u.test(segment)) {
        throw new Error('Invalid Explorer path.')
      }
      return encodeURIComponent(segment)
    }).join('/')}`
    : ''
  if (path && path.length > MAX_EXPLORER_PATH_LENGTH) throw new Error('Explorer path is too long.')
  return `/s/${identitySegment(session)}/e${suffix}${eventSearch(eventId)}`
}

export function sessionConvenienceRoute(name: string, eventId?: string): string {
  if (!isSessionRouteName(name)) throw new Error('Invalid session name.')
  return `/s/${encodeURIComponent(name)}${eventSearch(eventId)}`
}

export function stableSessionRoute(session: CanonicalSessionIdentity, eventId?: string): string {
  return `/s/${identitySegment(session)}${eventSearch(eventId)}`
}
