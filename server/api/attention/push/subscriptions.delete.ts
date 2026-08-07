import { unsubscribePushSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestBody } from '../../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const { endpoint } = await readRequestBody(event, unsubscribePushSchema, 16_384, true)
  const container = useBitveinsContainer()
  container.pushSessionMutes.removeEndpoint(endpoint)
  container.pushSubscriptions.remove(endpoint)
  return { subscribed: false }
})
