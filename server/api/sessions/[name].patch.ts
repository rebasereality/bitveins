import { renameSessionBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { rethrowSessionError } from '../../utils/http-errors'
import { readRequestBody } from '../../utils/request-validation'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const body = await readRequestBody(event, renameSessionBodySchema)

  try {
    return {
      session: await sessions.renameSession(name ?? '', body.name),
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
