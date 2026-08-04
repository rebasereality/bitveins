import {
  hermesNotificationPreferenceResponseSchema,
  hermesNotificationPreferenceSchema,
  type HermesNotificationPreference,
} from '#shared/contracts/attention'

type PreferenceKey = keyof HermesNotificationPreference

export function useHermesNotificationPreferences() {
  const preference = ref<HermesNotificationPreference>(
    hermesNotificationPreferenceSchema.parse({}),
  )
  const busy = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    error.value = null
    try {
      const response = await $fetch<{ preference: HermesNotificationPreference }>(
        '/api/attention/hermes/preferences',
      )
      preference.value = hermesNotificationPreferenceResponseSchema.parse(response).preference
    }
    catch {
      error.value = 'Unable to load Hermes notification settings.'
    }
  }

  async function setPreference(key: PreferenceKey, value: boolean): Promise<void> {
    busy.value = true
    error.value = null
    try {
      const response = await $fetch<{ preference: HermesNotificationPreference }>(
        '/api/attention/hermes/preferences',
        { body: { [key]: value }, method: 'PUT' },
      )
      preference.value = hermesNotificationPreferenceResponseSchema.parse(response).preference
    }
    catch {
      error.value = 'Unable to update Hermes notification settings.'
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
