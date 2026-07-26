import { createSessionBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { rethrowSessionError } from '../../utils/http-errors'
import { readRequestBody } from '../../utils/request-validation'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const body = await readRequestBody(event, createSessionBodySchema)

  try {
    const session = await sessions.createSession(body.name, body.path)
    setResponseStatus(event, 201)

    return {
      session,
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
