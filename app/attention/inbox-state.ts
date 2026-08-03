import type { AttentionEvent } from '#shared/contracts/attention'

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
