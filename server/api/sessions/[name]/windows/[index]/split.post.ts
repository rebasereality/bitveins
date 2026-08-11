import { splitPaneBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../../../utils/http-errors'
import { readRequestBody } from '../../../../../utils/request-validation'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const index = getRouterParam(event, 'index')
  const body = await readRequestBody(event, splitPaneBodySchema)

  try {
    return {
      panes: await sessions.splitWindow(name ?? '', index ?? '', body.paneId, body.direction),
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
