import { eq } from 'drizzle-orm'
import {
  antigravityNotificationPreferenceSchema,
  type AntigravityNotificationPreference,
  type AntigravityNotificationPreferenceUpdate,
} from '#shared/contracts/attention'
import { antigravityNotificationPreferences } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { AntigravityNotificationPreferenceRepository } from '../ports/antigravity-notification-preference-repository'

const preferenceId = 1

export class DrizzleAntigravityNotificationPreferenceRepository implements AntigravityNotificationPreferenceRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  get(): AntigravityNotificationPreference {
    const row = this.database.select({
      completedWithTools: antigravityNotificationPreferences.completedWithTools,
      completedWithoutTools: antigravityNotificationPreferences.completedWithoutTools,
      failed: antigravityNotificationPreferences.failed,
      inputRequired: antigravityNotificationPreferences.inputRequired,
      permissionRequired: antigravityNotificationPreferences.permissionRequired,
    })
      .from(antigravityNotificationPreferences)
      .where(eq(antigravityNotificationPreferences.id, preferenceId))
      .get()
    return antigravityNotificationPreferenceSchema.parse(row ?? {})
  }

  update(
    patch: AntigravityNotificationPreferenceUpdate,
    now: number,
  ): AntigravityNotificationPreference {
    const preference = antigravityNotificationPreferenceSchema.parse(patch)
    const values = {
      id: preferenceId,
      ...preference,
      updatedAt: now,
    }
    const updates = {
      ...(patch.completedWithTools === undefined
        ? {}
        : { completedWithTools: patch.completedWithTools }),
      ...(patch.completedWithoutTools === undefined
        ? {}
        : { completedWithoutTools: patch.completedWithoutTools }),
      ...(patch.failed === undefined ? {} : { failed: patch.failed }),
      ...(patch.inputRequired === undefined
        ? {}
        : { inputRequired: patch.inputRequired }),
      ...(patch.permissionRequired === undefined
        ? {}
        : { permissionRequired: patch.permissionRequired }),
      updatedAt: now,
    }
    this.database.insert(antigravityNotificationPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: antigravityNotificationPreferences.id,
        set: updates,
      })
      .run()
    return this.get()
  }
}
