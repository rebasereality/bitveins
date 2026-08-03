import type {
  NotificationPreference,
  PushSubscriptionInput,
} from '#shared/contracts/attention'

export type StoredPushSubscription = PushSubscriptionInput & { showDetails: boolean }

export interface PushSubscriptionRepository {
  getPreference(endpoint?: string): NotificationPreference
  list(): StoredPushSubscription[]
  remove(endpoint: string): boolean
  removeIfMatches(subscription: PushSubscriptionInput): boolean
  setPreference(endpoint: string, preference: NotificationPreference, now: number): NotificationPreference
  upsert(subscription: PushSubscriptionInput, now: number): void
}
