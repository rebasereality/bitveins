import { SessionError } from './session-error'

export const BITVEINS_SESSION_PREFIX = '_bitveins_'

function normalizeInternalSessionName(name: string): string {
  const trimmed = name.trim()

  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(trimmed)) {
    throw new SessionError('Session names may contain letters, numbers, underscores, dots, and hyphens only.')
  }

  return trimmed
}

export function normalizeSessionName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new SessionError('A session name is required.')
  }

  const sessionName = normalizeInternalSessionName(name)

  if (sessionName.startsWith(BITVEINS_SESSION_PREFIX)) {
    throw new SessionError('Session names starting with _bitveins_ are reserved.')
  }

  return sessionName
}

export function normalizeHelperSessionName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new SessionError('A session name is required.')
  }

  const sessionName = normalizeInternalSessionName(name)

  if (!sessionName.startsWith(BITVEINS_SESSION_PREFIX)) {
    throw new SessionError('Refusing to kill a non-Bitveins helper session.')
  }

  return sessionName
}

export function normalizeTerminalTargetName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new SessionError('A session name is required.')
  }
  return normalizeInternalSessionName(name)
}

export function normalizeWindowIndex(index: unknown): number {
  const parsed = typeof index === 'number' ? index : Number(index)

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
    throw new SessionError('A valid tmux window index is required.')
  }

  return parsed
}

export function normalizeWindowName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new SessionError('A window name is required.')
  }

  const trimmed = name.trim()

  if (!trimmed || trimmed.length > 80 || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    throw new SessionError('Window names must be 1-80 characters and cannot contain control characters.')
  }

  return trimmed
}
