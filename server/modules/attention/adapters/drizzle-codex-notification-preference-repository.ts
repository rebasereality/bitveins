import { eq } from 'drizzle-orm'
import {
  codexNotificationPreferenceSchema,
  type CodexNotificationPreference,
  type CodexNotificationPreferenceUpdate,
} from '#shared/contracts/attention'
import { codexNotificationPreferences } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { CodexNotificationPreferenceRepository } from '../ports/codex-notification-preference-repository'

const preferenceId = 1

export class DrizzleCodexNotificationPreferenceRepository implements CodexNotificationPreferenceRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  get(): CodexNotificationPreference {
    const row = this.database.select({
      completedWithTools: codexNotificationPreferences.completedWithTools,
      completedWithoutTools: codexNotificationPreferences.completedWithoutTools,
      permissionRequired: codexNotificationPreferences.permissionRequired,
    })
      .from(codexNotificationPreferences)
      .where(eq(codexNotificationPreferences.id, preferenceId))
      .get()
    return codexNotificationPreferenceSchema.parse(row ?? {})
  }

  update(
    patch: CodexNotificationPreferenceUpdate,
    now: number,
  ): CodexNotificationPreference {
    const preference = codexNotificationPreferenceSchema.parse(patch)
    const values = { id: preferenceId, ...preference, updatedAt: now }
    const updates = {
      ...(patch.completedWithTools === undefined
        ? {}
        : { completedWithTools: patch.completedWithTools }),
      ...(patch.completedWithoutTools === undefined
        ? {}
        : { completedWithoutTools: patch.completedWithoutTools }),
      ...(patch.permissionRequired === undefined
        ? {}
        : { permissionRequired: patch.permissionRequired }),
      updatedAt: now,
    }
    this.database.insert(codexNotificationPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: codexNotificationPreferences.id,
        set: updates,
      })
      .run()
    return this.get()
  }
}
