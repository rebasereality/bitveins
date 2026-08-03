import type { AttentionEvent, NotificationPreference } from '#shared/contracts/attention'
import { createAttentionDeepLink } from '#shared/contracts/attention'

export interface PushNotificationPayload {
  body: string
  data: { url: string }
  tag: string
  title: string
}

const MAX_TITLE_LENGTH = 80
const MAX_BODY_LENGTH = 240

function bounded(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

export function buildPushPayload(
  event: AttentionEvent,
  preference: NotificationPreference,
): PushNotificationPayload {
  const context = [
    event.project ? `Project: ${event.project}` : null,
    `Source: ${event.source}`,
  ].filter((value): value is string => Boolean(value))
  const body = preference.showDetails && event.summary
    ? event.summary
    : context.join('\n')

  return {
    body: bounded(body, MAX_BODY_LENGTH),
    data: { url: createAttentionDeepLink(event) },
    tag: `attention:${event.id}`,
    title: bounded(event.title, MAX_TITLE_LENGTH),
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
