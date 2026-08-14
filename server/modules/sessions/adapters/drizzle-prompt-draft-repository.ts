import { and, eq } from 'drizzle-orm'
import { asyncPromptDrafts } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type {
  PromptDraft,
  PromptDraftRepository,
  SavePromptDraftInput,
} from '../ports/prompt-draft-repository'

export class DrizzlePromptDraftRepository implements PromptDraftRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  clearDraft(sessionName: string, windowId: string): void {
    this.database.delete(asyncPromptDrafts)
      .where(and(
        eq(asyncPromptDrafts.sessionName, sessionName),
        eq(asyncPromptDrafts.windowId, windowId),
      ))
      .run()
  }

  getDraft(sessionName: string, windowId: string): PromptDraft | null {
    const row = this.database.select()
      .from(asyncPromptDrafts)
      .where(and(
        eq(asyncPromptDrafts.sessionName, sessionName),
        eq(asyncPromptDrafts.windowId, windowId),
      ))
      .get()

    if (!row) return null
    return {
      draft: row.draft,
      revision: row.revision,
      sessionName: row.sessionName,
      updatedAt: row.updatedAt,
      windowId: row.windowId,
    }
  }

  listDrafts(sessionName: string): Record<string, string> {
    const rows = this.database.select({
      draft: asyncPromptDrafts.draft,
      windowId: asyncPromptDrafts.windowId,
    })
      .from(asyncPromptDrafts)
      .where(eq(asyncPromptDrafts.sessionName, sessionName))
      .all()

    const result: Record<string, string> = {}
    for (const row of rows) {
      if (row.draft) {
        result[row.windowId] = row.draft
      }
    }
    return result
  }

  saveDraft(input: SavePromptDraftInput): PromptDraft {
    const trimmed = input.draft
    if (!trimmed) {
      this.clearDraft(input.sessionName, input.windowId)
      return {
        draft: '',
        revision: (input.revision ?? 0) + 1,
        sessionName: input.sessionName,
        updatedAt: input.now,
        windowId: input.windowId,
      }
    }

    const existing = this.getDraft(input.sessionName, input.windowId)
    const revision = input.revision ?? (existing ? existing.revision + 1 : 1)

    this.database.insert(asyncPromptDrafts)
      .values({
        draft: trimmed,
        revision,
        sessionName: input.sessionName,
        updatedAt: input.now,
        windowId: input.windowId,
      })
      .onConflictDoUpdate({
        set: {
          draft: trimmed,
          revision,
          updatedAt: input.now,
        },
        target: [asyncPromptDrafts.sessionName, asyncPromptDrafts.windowId],
      })
      .run()

    return {
      draft: trimmed,
      revision,
      sessionName: input.sessionName,
      updatedAt: input.now,
      windowId: input.windowId,
    }
  }
}
