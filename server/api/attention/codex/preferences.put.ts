import { codexNotificationPreferenceUpdateSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestBody } from '../../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const patch = await readRequestBody(
    event,
    codexNotificationPreferenceUpdateSchema,
    1024,
    true,
  )
  return {
    preference: useBitveinsContainer().codexNotifications.updatePreference(
      patch,
      Date.now(),
    ),
  }
})
