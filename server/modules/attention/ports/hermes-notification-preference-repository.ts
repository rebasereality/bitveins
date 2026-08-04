import type {
  HermesNotificationPreference,
  HermesNotificationPreferenceUpdate,
} from '#shared/contracts/attention'

export interface HermesNotificationPreferenceRepository {
  get(): HermesNotificationPreference
  update(
    patch: HermesNotificationPreferenceUpdate,
    now: number,
  ): HermesNotificationPreference
}
