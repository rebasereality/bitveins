import { antigravityNotificationPreferenceUpdateSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestBody } from '../../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const patch = await readRequestBody(
    event,
    antigravityNotificationPreferenceUpdateSchema,
    16_384,
    true,
  )
  return {
    preference: useBitveinsContainer().antigravityNotifications.updatePreference(
      patch,
      Date.now(),
    ),
  }
})
