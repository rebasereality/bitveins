import { desc, eq } from 'drizzle-orm'
import type { AttentionEvent, AttentionEventType } from '#shared/contracts/attention'
import { attentionEventSchema } from '#shared/contracts/attention'
import { attentionEvents, type AttentionEventRow } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { AttentionRepository } from '../ports/attention-repository'

function toEvent(row: AttentionEventRow): AttentionEvent {
  return attentionEventSchema.parse({
    id: row.id,
    type: row.type as AttentionEventType,
    source: row.source,
    title: row.title,
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.project ? { project: row.project } : {}),
    ...(row.sessionName ? { sessionName: row.sessionName } : {}),
    ...(row.windowId ? { windowId: row.windowId } : {}),
    ...(row.paneId ? { paneId: row.paneId } : {}),
    createdAt: row.createdAt,
    ...(row.readAt ? { readAt: row.readAt } : {}),
    ...(row.dismissedAt ? { dismissedAt: row.dismissedAt } : {}),
  })
}

export class DrizzleAttentionRepository implements AttentionRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  create(event: AttentionEvent): AttentionEvent {
    this.database.insert(attentionEvents).values({
      ...event,
      summary: event.summary ?? null,
      project: event.project ?? null,
      sessionName: event.sessionName ?? null,
      windowId: event.windowId ?? null,
      paneId: event.paneId ?? null,
      readAt: event.readAt ?? null,
      dismissedAt: event.dismissedAt ?? null,
    }).run()
    return event
  }

  dismiss(id: string, dismissedAt: string): AttentionEvent | null {
    return this.update(id, { dismissedAt })
  }

  list(): AttentionEvent[] {
    return this.database.select()
      .from(attentionEvents)
      .orderBy(desc(attentionEvents.createdAt))
      .all()
      .map(toEvent)
  }

  markRead(id: string, readAt: string): AttentionEvent | null {
    return this.update(id, { readAt })
  }

  private update(
    id: string,
    values: { dismissedAt?: string, readAt?: string },
  ): AttentionEvent | null {
    const rows = this.database.update(attentionEvents)
      .set(values)
      .where(eq(attentionEvents.id, id))
      .returning()
      .all()
    return rows[0] ? toEvent(rows[0]) : null
  }
}
