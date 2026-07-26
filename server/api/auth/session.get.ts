import { userInfo } from 'node:os'
import type { AuthSessionResponse } from '#shared/contracts/auth'

function getLinuxUsername(): string | null {
  try {
    return userInfo().username || null
  }
  catch {
    return null
  }
}

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const authenticated = Boolean(session.user) && session.authVersion === getBitveinsAuthVersion()

  if (session.user && !authenticated) {
    await clearUserSession(event)
  }

  return {
    authenticated,
    linuxUsername: authenticated ? getLinuxUsername() : null,
    loggedInAt: authenticated && typeof session.loggedInAt === 'number' ? session.loggedInAt : null,
  } satisfies AuthSessionResponse
})
