import { notificationSessionMuteUpdateSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { readRequestBody } from '../../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const update = await readRequestBody(event, notificationSessionMuteUpdateSchema, 16_384, true)
  const container = useBitveinsContainer()
  if (!container.pushSubscriptions.list().some(subscription => subscription.endpoint === update.endpoint)) {
    throw createError({ statusCode: 404, statusMessage: 'Web Push subscription not found.' })
  }
  return {
    muted: container.pushSessionMutes.setMuted(
      update.endpoint,
      update.sessionId,
      update.muted,
      Date.now(),
    ),
  }
})
