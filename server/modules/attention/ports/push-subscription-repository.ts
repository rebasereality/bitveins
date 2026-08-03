import type {
  NotificationPreference,
  PushSubscriptionInput,
} from '#shared/contracts/attention'

export interface PushSubscriptionRepository {
  getPreference(): NotificationPreference
  list(): PushSubscriptionInput[]
  remove(endpoint: string): boolean
  setPreference(preference: NotificationPreference, now: number): NotificationPreference
  upsert(subscription: PushSubscriptionInput, now: number): void
}
