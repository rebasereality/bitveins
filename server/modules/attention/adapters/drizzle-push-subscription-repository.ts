import { eq } from 'drizzle-orm'
import type { NotificationPreference, PushSubscriptionInput } from '#shared/contracts/attention'
import { notificationPreferences, webPushSubscriptions } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { PushSubscriptionRepository } from '../ports/push-subscription-repository'

export class DrizzlePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  getPreference(): NotificationPreference {
    const row = this.database.select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.id, 1))
      .get()
    return { showDetails: row?.showDetails ?? false }
  }

  list(): PushSubscriptionInput[] {
    return this.database.select()
      .from(webPushSubscriptions)
      .all()
      .map(row => ({
        endpoint: row.endpoint,
        expirationTime: row.expirationTime,
        keys: { auth: row.auth, p256dh: row.p256dh },
      }))
  }

  remove(endpoint: string): boolean {
    return this.database.delete(webPushSubscriptions)
      .where(eq(webPushSubscriptions.endpoint, endpoint))
      .run().changes > 0
  }

  setPreference(preference: NotificationPreference, now: number): NotificationPreference {
    this.database.insert(notificationPreferences)
      .values({ id: 1, showDetails: preference.showDetails, updatedAt: now })
      .onConflictDoUpdate({
        target: notificationPreferences.id,
        set: { showDetails: preference.showDetails, updatedAt: now },
      })
      .run()
    return preference
  }

  upsert(subscription: PushSubscriptionInput, now: number): void {
    const values = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      auth: subscription.keys.auth,
      p256dh: subscription.keys.p256dh,
      createdAt: now,
      updatedAt: now,
    }
    this.database.insert(webPushSubscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: webPushSubscriptions.endpoint,
        set: {
          expirationTime: values.expirationTime,
          auth: values.auth,
          p256dh: values.p256dh,
          updatedAt: now,
        },
      })
      .run()
  }
}
