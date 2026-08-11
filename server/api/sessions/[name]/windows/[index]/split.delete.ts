import { killPaneQuerySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../../../utils/http-errors'
import { readRequestQuery } from '../../../../../utils/request-validation'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const index = getRouterParam(event, 'index')
  const query = await readRequestQuery(event, killPaneQuerySchema)

  try {
    return {
      panes: await sessions.killPane(name ?? '', index ?? '', query.paneId),
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
