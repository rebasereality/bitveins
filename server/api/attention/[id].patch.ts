import { attentionStateUpdateSchema } from '#shared/contracts/attention'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { readRequestBody } from '../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Attention event id is required.' })
  }
  const body = await readRequestBody(event, attentionStateUpdateSchema, 16_384, true)
  const attention = useBitveinsContainer().attention
  const updated = body.action === 'read'
    ? attention.markRead(id)
    : attention.dismiss(id)
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'Attention event not found.' })
  }
  return { event: updated }
})
