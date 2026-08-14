import type {
  AntigravityNotificationPreference,
  AntigravityNotificationPreferenceUpdate,
} from '#shared/contracts/attention'

export interface AntigravityNotificationPreferenceRepository {
  get(): AntigravityNotificationPreference
  update(
    patch: AntigravityNotificationPreferenceUpdate,
    now: number,
  ): AntigravityNotificationPreference
}
