import { createAttentionEventSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { assertBrowserAttentionRateLimit } from '../../modules/attention/delivery/browser-event-rate-limit'
import { readRequestBody } from '../../utils/request-validation'

export default defineEventHandler(async (event) => {
  assertBrowserAttentionRateLimit()
  const body = await readRequestBody(event, createAttentionEventSchema, 16_384, true)
  return { event: await useBitveinsContainer().attention.create(body) }
})
