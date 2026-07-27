import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParam,
  sendStream,
  setHeader,
} from 'h3'
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
    const image = await explorerDocuments.openImage(
      await sessions.getSessionPath(sessionName),
      query.data.path,
    )
    setHeader(event, 'Content-Type', image.mediaType)
    if (image.contentLength !== undefined) {
      setHeader(event, 'Content-Length', image.contentLength)
    }
    setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(image.name)}`)
    setHeader(event, 'Cache-Control', 'private, no-store')
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
    setHeader(event, 'Content-Security-Policy', 'default-src \'none\'; sandbox')
    return sendStream(event, image.stream)
  }
  catch (error: unknown) {
    throwWorkspaceDocumentHttpError(error)
  }
})
