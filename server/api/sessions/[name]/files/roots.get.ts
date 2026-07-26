import { createError, defineEventHandler, getRouterParam } from 'h3'
import { useBitveinsContainer } from '../../../../composition/bitveins-container'

const { explorerFileReferences, sessions } = useBitveinsContainer()

export default defineEventHandler(async (event) => {
  const sessionName = getRouterParam(event, 'name')
  if (!sessionName) {
    throw createError({ statusCode: 400, statusMessage: 'Session name is required.' })
  }

  return {
    roots: await explorerFileReferences.listProjectRoots(await sessions.getSessionPath(sessionName)),
  }
})
