import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { explorerFileQuerySchema } from '#shared/contracts/explorer'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'
import { throwWorkspaceDocumentHttpError } from '../../../../modules/explorer/delivery/workspace-document-error'

const { explorerDocuments, sessions } = useBitveinsContainer()

export default defineEventHandler(async (event) => {
  const sessionName = getRouterParam(event, 'name')
  if (!sessionName) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Session name is required.',
    })
  }

  const query = explorerFileQuerySchema.safeParse(getQuery(event))
  if (!query.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid file path is required.',
    })
  }

  try {
    const rootPath = await sessions.getSessionPath(sessionName)
    return { content: await explorerDocuments.readText(rootPath, query.data.path) }
  }
  catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error) throw error
    throwWorkspaceDocumentHttpError(error)
  }
})
