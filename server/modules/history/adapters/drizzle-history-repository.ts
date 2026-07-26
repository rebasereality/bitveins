import { and, desc, eq } from 'drizzle-orm'
import type { HistoryMessage } from '#shared/contracts/terminal'
import { asyncMessages } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { HistoryScope } from '../model/history-scope'
import type { HistoryRepository } from '../ports/history-repository'

export class DrizzleHistoryRepository implements HistoryRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  list(scope: HistoryScope): HistoryMessage[] {
    return this.database
      .select({
        id: asyncMessages.id,
        message: asyncMessages.message,
        createdAt: asyncMessages.createdAt,
      })
      .from(asyncMessages)
      .where(
        and(
          eq(asyncMessages.sessionName, scope.sessionName),
          eq(asyncMessages.windowId, scope.windowId),
          eq(asyncMessages.windowIndex, scope.windowIndex),
        ),
      )
      .orderBy(desc(asyncMessages.id))
      .all()
  }

  save(scope: HistoryScope, message: string, createdAt: number): HistoryMessage {
    const inserted = this.database
      .insert(asyncMessages)
      .values({
        ...scope,
        message,
        createdAt,
      })
      .returning({ id: asyncMessages.id })
      .get()

    return {
      id: inserted.id,
      message,
      createdAt,
    }
  }
}
