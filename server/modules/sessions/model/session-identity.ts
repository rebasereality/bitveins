import { randomBytes } from 'node:crypto'
import { isSessionId } from '#shared/navigation/session-route'

export function createSessionId(): string {
  return randomBytes(12).toString('base64url')
}

export function normalizeSessionId(value: unknown): string | null {
  return typeof value === 'string' && isSessionId(value) ? value : null
}
