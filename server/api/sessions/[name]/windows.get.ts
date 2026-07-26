import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../utils/http-errors'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')

  try {
    return {
      windows: await sessions.listWindows(name ?? ''),
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
