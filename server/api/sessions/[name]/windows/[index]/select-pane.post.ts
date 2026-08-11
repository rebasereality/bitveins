import { selectPaneBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../../../utils/http-errors'
import { readRequestBody } from '../../../../../utils/request-validation'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const index = getRouterParam(event, 'index')
  const body = await readRequestBody(event, selectPaneBodySchema)

  try {
    await sessions.selectPane(name ?? '', index ?? '', body.paneId)
    return { ok: true }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
