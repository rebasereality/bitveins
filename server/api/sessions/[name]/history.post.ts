import { saveHistoryBodySchema } from '#shared/contracts/api'
import { useBitveinsContainer } from '../../../composition/bitveins-container'
import { rethrowSessionError } from '../../../utils/http-errors'
import { readRequestBody } from '../../../utils/request-validation'

const history = useBitveinsContainer().history

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  const body = await readRequestBody(event, saveHistoryBodySchema)

  try {
    const message = history.saveMessage({
      sessionName: name ?? '',
      windowId: body.windowId,
      windowIndex: body.windowIndex,
    }, body.message)
    setResponseStatus(event, 201)

    return {
      message,
    }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
