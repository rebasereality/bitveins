import { resizePaneBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../../../utils/http-errors'
import { readRequestBody } from '../../../../../utils/request-validation'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const index = getRouterParam(event, 'index')
  const body = await readRequestBody(event, resizePaneBodySchema)

  try {
    return {
      panes: await sessions.resizePane(
        name ?? '',
        index ?? '',
        body.paneId,
        body.dimension,
        body.size,
      ),
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
