import { unsubscribePushSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestBody } from '../../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const { endpoint } = await readRequestBody(event, unsubscribePushSchema, 16_384, true)
  useBitveinsContainer().pushSubscriptions.remove(endpoint)
  return { subscribed: false }
})
