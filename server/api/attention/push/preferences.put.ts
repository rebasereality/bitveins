import { notificationPreferenceUpdateSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestBody } from '../../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const { endpoint, ...preference } = await readRequestBody(event, notificationPreferenceUpdateSchema, 16_384, true)
  return {
    preference: useBitveinsContainer().pushSubscriptions.setPreference(endpoint, preference, Date.now()),
  }
})
