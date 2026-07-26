import type { OpenTransferResponse } from '#shared/contracts/api'
import { openTransferBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { rethrowSessionError } from '../../utils/http-errors'
import { readRequestBody } from '../../utils/request-validation'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event): Promise<OpenTransferResponse> => {
  const body = await readRequestBody(event, openTransferBodySchema)

  try {
    const result = await sessions.openTransferSession(body.name, body.path)
    setResponseStatus(event, result.created ? 201 : 200)
    return result
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
