import { dismissAllAttentionEventsSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { readRequestBody } from '../../utils/request-validation'

export default defineEventHandler(async (event) => {
  await readRequestBody(event, dismissAllAttentionEventsSchema, 16_384, true)
  return useBitveinsContainer().attention.dismissAll()
})
