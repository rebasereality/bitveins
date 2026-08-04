import { eq } from 'drizzle-orm'
import {
  hermesNotificationPreferenceSchema,
  type HermesNotificationPreference,
  type HermesNotificationPreferenceUpdate,
} from '#shared/contracts/attention'
import { hermesNotificationPreferences } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { HermesNotificationPreferenceRepository } from '../ports/hermes-notification-preference-repository'

const preferenceId = 1

export class DrizzleHermesNotificationPreferenceRepository implements HermesNotificationPreferenceRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  get(): HermesNotificationPreference {
    const row = this.database.select({
      completedWithTools: hermesNotificationPreferences.completedWithTools,
      completedWithoutTools: hermesNotificationPreferences.completedWithoutTools,
      failed: hermesNotificationPreferences.failed,
      inputRequired: hermesNotificationPreferences.inputRequired,
      permissionRequired: hermesNotificationPreferences.permissionRequired,
    })
      .from(hermesNotificationPreferences)
      .where(eq(hermesNotificationPreferences.id, preferenceId))
      .get()
    return hermesNotificationPreferenceSchema.parse(row ?? {})
  }

  update(
    patch: HermesNotificationPreferenceUpdate,
    now: number,
  ): HermesNotificationPreference {
    const preference = hermesNotificationPreferenceSchema.parse(patch)
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
    this.database.insert(hermesNotificationPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: hermesNotificationPreferences.id,
        set: updates,
      })
      .run()
    return this.get()
  }
}
