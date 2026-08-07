import { notificationSessionMuteQuerySchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestQuery } from '../../../utils/request-validation'

export default defineEventHandler((event) => {
  const { endpoint } = readRequestQuery(event, notificationSessionMuteQuerySchema)
  const container = useBitveinsContainer()
  const subscribed = container.pushSubscriptions.list()
    .some(subscription => subscription.endpoint === endpoint)
  return {
    sessionIds: subscribed ? container.pushSessionMutes.list(endpoint) : [],
    subscribed,
  }
})
