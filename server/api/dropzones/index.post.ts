import { saveDropzonesBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { readRequestBody } from '../../utils/request-validation'

export default defineEventHandler(async (event) => {
  const body = await readRequestBody(event, saveDropzonesBodySchema)

  try {
    useBitveinsContainer().dropzones.replace(body.dropzones)
    return {
      success: true,
    }
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save dropzones'
    throw createError({
      statusCode: 400,
      statusMessage: message,
    })
  }
})
