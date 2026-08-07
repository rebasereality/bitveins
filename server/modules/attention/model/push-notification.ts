import type { AttentionEvent, NotificationPreference, PushNotificationPayload } from '#shared/contracts/attention'
import { createAttentionDeepLink } from '#shared/contracts/attention'

export type { PushNotificationPayload } from '#shared/contracts/attention'

const MAX_TITLE_LENGTH = 80
const MAX_BODY_LENGTH = 240

function bounded(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

function eventLocation(event: AttentionEvent): string | null {
  if (!event.sessionName) return null
  const window = event.windowName
    ? `${event.windowName}${event.windowId ? ` (${event.windowId})` : ''}`
    : event.windowId
  return window
    ? `Session: ${event.sessionName} · Window: ${window}`
    : `Session: ${event.sessionName}`
}

export function buildPushPayload(
  event: AttentionEvent,
  preference: NotificationPreference,
): PushNotificationPayload {
  const title = preference.showDetails ? event.title : 'Bitveins needs your attention'
  const body = preference.showDetails
    ? [
        eventLocation(event),
        event.project ? `Project: ${event.project}` : null,
        `Source: ${event.source}`,
        event.summary ?? null,
      ].filter((value): value is string => Boolean(value)).join('\n')
    : 'Open Bitveins to view the event.'

  return {
    body: bounded(body, MAX_BODY_LENGTH),
    data: { url: createAttentionDeepLink(event) },
    tag: `attention:${event.id}`,
    title: bounded(title, MAX_TITLE_LENGTH),
  }
}

export function redactPushError(error: unknown): {
  code: 'web_push_failed'
  statusCode?: number
} {
  const statusCode = typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
    ? error.statusCode
    : undefined
  return statusCode === undefined
    ? { code: 'web_push_failed' }
    : { code: 'web_push_failed', statusCode }
}
