import { and, eq } from 'drizzle-orm'
import type { NotificationPreference, PushSubscriptionInput } from '#shared/contracts/attention'
import { webPushSubscriptions } from '../../../db/schema'
import type { DrizzleDatabase } from '../../../utils/db'
import type { PushSubscriptionRepository, StoredPushSubscription } from '../ports/push-subscription-repository'

export class DrizzlePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly database: DrizzleDatabase) {}

  getPreference(endpoint?: string): NotificationPreference {
    if (!endpoint) return { showDetails: false }
    const row = this.database.select()
      .from(webPushSubscriptions)
      .where(eq(webPushSubscriptions.endpoint, endpoint))
      .get()
    return { showDetails: row?.showDetails ?? false }
  }

  list(): StoredPushSubscription[] {
    return this.database.select()
      .from(webPushSubscriptions)
      .all()
      .map(row => ({
        endpoint: row.endpoint,
        expirationTime: row.expirationTime,
        keys: { auth: row.auth, p256dh: row.p256dh },
        showDetails: row.showDetails,
      }))
  }

  remove(endpoint: string): boolean {
    return this.database.delete(webPushSubscriptions)
      .where(eq(webPushSubscriptions.endpoint, endpoint))
      .run().changes > 0
  }

  removeIfMatches(subscription: PushSubscriptionInput): boolean {
    return this.database.delete(webPushSubscriptions)
      .where(and(
        eq(webPushSubscriptions.endpoint, subscription.endpoint),
        eq(webPushSubscriptions.auth, subscription.keys.auth),
        eq(webPushSubscriptions.p256dh, subscription.keys.p256dh),
      ))
      .run().changes > 0
  }

  setPreference(endpoint: string, preference: NotificationPreference, now: number): NotificationPreference {
    this.database.update(webPushSubscriptions)
      .set({ showDetails: preference.showDetails, updatedAt: now })
      .where(eq(webPushSubscriptions.endpoint, endpoint))
      .run()
    return preference
  }

  upsert(subscription: PushSubscriptionInput, now: number): void {
    const values = {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      auth: subscription.keys.auth,
      p256dh: subscription.keys.p256dh,
      showDetails: false,
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
