import type { AttentionEvent } from '#shared/contracts/attention'

export interface AttentionRepository {
  create(event: AttentionEvent): AttentionEvent
  dismiss(id: string, dismissedAt: string): AttentionEvent | null
  dismissAll(dismissedAt: string): string[]
  list(): AttentionEvent[]
  markRead(id: string, readAt: string): AttentionEvent | null
}
