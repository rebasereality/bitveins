import { pushSubscriptionSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestBody } from '../../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const subscription = await readRequestBody(event, pushSubscriptionSchema, 16_384, true)
  const repository = useBitveinsContainer().pushSubscriptions
  const subscriptions = repository.list()
  if (
    subscriptions.length >= 10
    && !subscriptions.some(candidate => candidate.endpoint === subscription.endpoint)
  ) {
    throw createError({ statusCode: 409, statusMessage: 'Web Push subscription limit reached.' })
  }
  repository.upsert(subscription, Date.now())
  return { subscribed: true }
})
