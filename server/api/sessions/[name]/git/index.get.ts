import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { gitGraphQuerySchema } from '#shared/contracts/git'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'
import { resolveGitWorkspacePath } from '../../../../modules/git/application/resolve-git-workspace-path'
import { throwGitViewerHttpError } from '../../../../modules/git/delivery/git-viewer-http-error'

const { gitViewer, sessions } = useBitveinsContainer()

export default defineEventHandler(async (event) => {
  const sessionName = getRouterParam(event, 'name')
  if (!sessionName) throw createError({ statusCode: 400, statusMessage: 'Session name is required.' })
  const query = gitGraphQuerySchema.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Git graph query.' })
  const workspacePath = await resolveGitWorkspacePath(sessions, sessionName, query.data.windowId)
  if (!workspacePath) throw createError({ statusCode: 404, statusMessage: 'Tmux window was not found.' })

  try {
    return await gitViewer.list(
      workspacePath,
      query.data.offset,
      query.data.limit,
    )
  }
  catch (error: unknown) {
    throwGitViewerHttpError(error)
  }
})
