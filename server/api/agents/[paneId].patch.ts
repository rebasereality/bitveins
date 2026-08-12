import { renameTmuxAgentBodySchema } from '#shared/contracts/agents'
import { useBitveinsContainer } from '../../composition/bitveins-container'
import { rethrowSessionError } from '../../utils/http-errors'
import { readRequestBody } from '../../utils/request-validation'

const sessions = useBitveinsContainer().sessions

export default defineEventHandler(async (event) => {
  const paneToken = getRouterParam(event, 'paneId')
  const paneId = paneToken ? `%${paneToken}` : ''
  const body = await readRequestBody(event, renameTmuxAgentBodySchema)
  try {
    return { agent: await sessions.renameAgent(paneId ?? '', body.label) }
  }
  catch (error: unknown) {
    rethrowSessionError(error)
  }
})
