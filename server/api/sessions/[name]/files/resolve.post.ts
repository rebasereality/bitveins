import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { resolveTerminalFileReferencesBodySchema } from '#shared/contracts/explorer'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'

const { explorerFileReferences, sessions } = useBitveinsContainer()

export default defineEventHandler(async (event) => {
  const sessionName = getRouterParam(event, 'name')
  if (!sessionName) {
    throw createError({ statusCode: 400, statusMessage: 'Session name is required.' })
  }

  const body = resolveTerminalFileReferencesBodySchema.safeParse(await readBody(event))
  if (!body.success) {
    throw createError({ statusCode: 400, statusMessage: body.error.issues[0]?.message || 'Invalid file references.' })
  }

  const window = (await sessions.listWindows(sessionName))
    .find(candidate => candidate.id === body.data.windowId)
  if (!window) {
    throw createError({ statusCode: 404, statusMessage: 'Tmux window was not found.' })
  }

  const sessionRoot = await sessions.getSessionPath(sessionName)
  return {
    resolutions: await explorerFileReferences.resolve({
      currentPath: window.path,
      rememberedRoot: body.data.rememberedRoot,
      sessionRoot,
    }, body.data.references),
  }
})
