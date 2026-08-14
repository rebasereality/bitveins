import {
  antigravityNotificationPreferenceResponseSchema,
  antigravityNotificationPreferenceSchema,
  type AntigravityNotificationPreference,
} from '#shared/contracts/attention'

type PreferenceKey = keyof AntigravityNotificationPreference

export function useAntigravityNotificationPreferences() {
  const preference = ref<AntigravityNotificationPreference>(
    antigravityNotificationPreferenceSchema.parse({}),
  )
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    error.value = null
    try {
      const response = await $fetch<{ preference: AntigravityNotificationPreference }>(
        '/api/attention/antigravity/preferences',
      )
      preference.value = antigravityNotificationPreferenceResponseSchema.parse(response).preference
    }
    catch {
      error.value = 'Unable to load Antigravity notification settings.'
    }
  }

  async function setPreference(key: PreferenceKey, value: boolean): Promise<void> {
    busy.value = true
    error.value = null
    try {
      const response = await $fetch<{ preference: AntigravityNotificationPreference }>(
        '/api/attention/antigravity/preferences',
        { body: { [key]: value }, method: 'PUT' },
      )
      preference.value = antigravityNotificationPreferenceResponseSchema.parse(response).preference
    }
    catch {
      error.value = 'Unable to update Antigravity notification settings.'
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
