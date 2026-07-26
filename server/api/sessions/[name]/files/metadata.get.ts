import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { explorerFileQuerySchema } from '#shared/contracts/explorer'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'
import { throwWorkspaceDocumentHttpError } from '../../../../modules/explorer/delivery/workspace-document-error'

const { explorerDocuments, sessions } = useBitveinsContainer()

export default defineEventHandler(async (event) => {
  const sessionName = getRouterParam(event, 'name')
  if (!sessionName) {
    throw createError({ statusCode: 400, statusMessage: 'Session name is required.' })
  }

  const query = explorerFileQuerySchema.safeParse(getQuery(event))
  if (!query.success) {
    throw createError({ statusCode: 400, statusMessage: 'A valid file path is required.' })
  }

  try {
    return await explorerDocuments.describe(await sessions.getSessionPath(sessionName), query.data.path)
  }
  catch (error: unknown) {
    throwWorkspaceDocumentHttpError(error)
  }
})
