import {
  codexNotificationPreferenceResponseSchema,
  codexNotificationPreferenceSchema,
  type CodexNotificationPreference,
} from '#shared/contracts/attention'

type PreferenceKey = keyof CodexNotificationPreference

export function useCodexNotificationPreferences() {
  const preference = ref<CodexNotificationPreference>(
    codexNotificationPreferenceSchema.parse({}),
  )
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    error.value = null
    try {
      const response = await $fetch<{ preference: CodexNotificationPreference }>(
        '/api/attention/codex/preferences',
      )
      preference.value = codexNotificationPreferenceResponseSchema.parse(response).preference
    }
    catch {
      error.value = 'Unable to load Codex notification settings.'
    }
  }

  async function setPreference(key: PreferenceKey, value: boolean): Promise<void> {
    busy.value = true
    error.value = null
    try {
      const response = await $fetch<{ preference: CodexNotificationPreference }>(
        '/api/attention/codex/preferences',
        { body: { [key]: value }, method: 'PUT' },
      )
      preference.value = codexNotificationPreferenceResponseSchema.parse(response).preference
    }
    catch {
      error.value = 'Unable to update Codex notification settings.'
    }
    finally {
      busy.value = false
    }
  }

  onMounted(() => void load())

  return {
    busy,
    error,
    preference,
    setPreference,
  }
}
