import { createError, defineEventHandler, getRouterParam } from 'h3'
import { gitCommitHashSchema } from '#shared/contracts/git'
import { useBitveinsContainer } from '../../../../../composition/bitveins-container'
import { throwGitViewerHttpError } from '../../../../../modules/git/delivery/git-viewer-http-error'

const { gitViewer, sessions } = useBitveinsContainer()

export default defineEventHandler(async (event) => {
  const sessionName = getRouterParam(event, 'name')
  const parsedCommit = gitCommitHashSchema.safeParse(getRouterParam(event, 'commit'))
  if (!sessionName) throw createError({ statusCode: 400, statusMessage: 'Session name is required.' })
  if (!parsedCommit.success) throw createError({ statusCode: 400, statusMessage: 'Invalid commit hash.' })

  try {
    return await gitViewer.details(await sessions.getSessionPath(sessionName), parsedCommit.data)
  }
  catch (error: unknown) {
    throwGitViewerHttpError(error)
  }
})
