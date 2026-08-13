import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { gitDiffQuerySchema } from '#shared/contracts/git'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'
import { resolveGitWorkspacePath } from '../../../../modules/git/application/resolve-git-workspace-path'
import { throwGitViewerHttpError } from '../../../../modules/git/delivery/git-viewer-http-error'

const { gitViewer, sessions } = useBitveinsContainer()

export default defineEventHandler(async (event) => {
  const sessionName = getRouterParam(event, 'name')
  if (!sessionName) throw createError({ statusCode: 400, statusMessage: 'Session name is required.' })
  const query = gitDiffQuerySchema.safeParse(getQuery(event))
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Invalid Git diff query.' })
  const workspacePath = await resolveGitWorkspacePath(sessions, sessionName, query.data.windowId)
  if (!workspacePath) throw createError({ statusCode: 404, statusMessage: 'Tmux window was not found.' })

  try {
    return await gitViewer.diff(
      workspacePath,
      query.data.commit,
      query.data.path,
    )
  }
  catch (error: unknown) {
    throwGitViewerHttpError(error)
  }
})
