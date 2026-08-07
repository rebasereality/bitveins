import type { AttentionEvent } from '#shared/contracts/attention'

export const MUTED_ATTENTION_EVENT_IDS_KEY = 'bitveins.mutedAttentionEventIds'
const ATTENTION_EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{12,80}$/u
const MAX_MUTED_EVENT_IDS = 500

function latestTimestamp(left?: string, right?: string): string | undefined {
  if (!left) return right
  if (!right) return left
  return left.localeCompare(right) >= 0 ? left : right
}

export function mergeAttentionSnapshots(
  current: AttentionEvent[],
  incoming: AttentionEvent[],
): AttentionEvent[] {
  const byId = new Map(incoming.map(event => [event.id, event]))
  for (const event of current) {
    const candidate = byId.get(event.id)
    byId.set(event.id, candidate
      ? {
          ...candidate,
          dismissedAt: latestTimestamp(candidate.dismissedAt, event.dismissedAt),
          readAt: latestTimestamp(candidate.readAt, event.readAt),
        }
      : event)
  }
  return [...byId.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function parseMutedAttentionEventIds(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const values = JSON.parse(raw)
    if (!Array.isArray(values)) return new Set()
    return new Set(values
      .filter((value): value is string => typeof value === 'string' && ATTENTION_EVENT_ID_PATTERN.test(value))
      .slice(0, MAX_MUTED_EVENT_IDS))
  }
  catch {
    return new Set()
  }
}

export function rememberMutedAttentionEvents(
  current: ReadonlySet<string>,
  incoming: AttentionEvent[],
  shouldMute: (event: AttentionEvent) => boolean,
): Set<string> {
  const next = new Set(current)
  for (const event of incoming) {
    if (shouldMute(event)) next.add(event.id)
  }
  return new Set([...next].slice(-MAX_MUTED_EVENT_IDS))
}
