import { useBitveinsContainer } from '../../../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../../../utils/http-errors'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const index = getRouterParam(event, 'index')
  const lines = Number(getQuery(event).lines)

  try {
    return {
      data: await sessions.captureWindowSnapshot(name ?? '', index, Number.isFinite(lines) ? lines : undefined),
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
