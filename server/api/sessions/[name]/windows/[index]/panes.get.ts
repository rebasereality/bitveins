import { useBitveinsContainer } from '../../../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../../../utils/http-errors'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const index = getRouterParam(event, 'index')

  try {
    return { panes: await sessions.listPanes(name ?? '', index) }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
