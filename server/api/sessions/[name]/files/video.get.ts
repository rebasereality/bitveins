import {
  createError,
  defineEventHandler,
  getHeader,
  getQuery,
  getRouterParam,
  sendStream,
  setHeader,
  setResponseStatus,
} from 'h3'
import { explorerFileQuerySchema } from '#shared/contracts/explorer'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'
import { throwWorkspaceDocumentHttpError } from '../../../../modules/explorer/delivery/workspace-document-error'
import { parseMediaByteRange } from '../../../../modules/explorer/model/media-byte-range'
import { WorkspaceDocumentError } from '../../../../modules/explorer/model/workspace-document'

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
    const rootPath = await sessions.getSessionPath(sessionName)
    const metadata = await explorerDocuments.describe(rootPath, query.data.path)
    if (metadata.kind !== 'video') {
      throw new WorkspaceDocumentError('unsupported-video', 'File is not a supported video container.')
    }

    let range
    try {
      range = parseMediaByteRange(getHeader(event, 'range'), metadata.size)
    }
    catch (error: unknown) {
      if (error instanceof WorkspaceDocumentError && error.code === 'invalid-range') {
        setHeader(event, 'Content-Range', `bytes */${metadata.size}`)
      }
      throw error
    }

    const video = await explorerDocuments.openVideo(rootPath, metadata.path, range)
    setHeader(event, 'Accept-Ranges', 'bytes')
    setHeader(event, 'Content-Type', metadata.mediaType)
    setHeader(event, 'Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(metadata.name)}`)
    setHeader(event, 'Cache-Control', 'private, no-store')
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
    setHeader(event, 'Content-Security-Policy', 'default-src \'none\'; sandbox')

    if (range) {
      setResponseStatus(event, 206)
      setHeader(event, 'Content-Range', `bytes ${range.start}-${range.end}/${metadata.size}`)
      setHeader(event, 'Content-Length', range.end - range.start + 1)
    }
    else {
      setHeader(event, 'Content-Length', metadata.size)
    }

    return sendStream(event, video.stream)
  }
  catch (error: unknown) {
    throwWorkspaceDocumentHttpError(error)
  }
})
