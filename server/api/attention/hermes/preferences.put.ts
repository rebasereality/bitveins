import { hermesNotificationPreferenceUpdateSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestBody } from '../../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const patch = await readRequestBody(
    event,
    hermesNotificationPreferenceUpdateSchema,
    16_384,
    true,
  )
  return {
    preference: useBitveinsContainer().hermesNotifications.updatePreference(
      patch,
      Date.now(),
    ),
  }
})
