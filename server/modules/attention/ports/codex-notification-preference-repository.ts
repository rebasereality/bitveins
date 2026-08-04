import type {
  CodexNotificationPreference,
  CodexNotificationPreferenceUpdate,
} from '#shared/contracts/attention'

export interface CodexNotificationPreferenceRepository {
  get(): CodexNotificationPreference
  update(
    patch: CodexNotificationPreferenceUpdate,
    now: number,
  ): CodexNotificationPreference
}
