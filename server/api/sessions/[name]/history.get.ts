import { historyScopeSchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../utils/http-errors'
import { readRequestQuery } from '../../../utils/request-validation'

const history = useBitveinsContainer().history

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name')
  const query = readRequestQuery(event, historyScopeSchema)

  try {
    return {
      messages: history.listMessages({
        sessionName: name ?? '',
        windowId: query.windowId,
        windowIndex: query.windowIndex,
      }),
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
