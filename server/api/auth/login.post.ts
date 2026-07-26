import { verifyBitveinsPassword } from '#shared/security/password-hasher'

interface LoginBody {
  password?: string
}

const loginLimiter = createLoginRateLimiter()

function clientKey(event: Parameters<typeof getRequestHeader>[0]): string {
  return (
    getRequestHeader(event, 'cf-connecting-ip')
    || getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim()
    || event.node.req.socket.remoteAddress
    || 'unknown'
  )
}

export default defineEventHandler(async (event) => {
  const key = clientKey(event)

  if (loginLimiter.isLimited(key)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many unlock attempts.',
    })
  }

  const body = await readBody<LoginBody>(event)

  if (typeof body.password !== 'string') {
    loginLimiter.recordFailure(key)
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid passphrase.',
    })
  }

  let valid: boolean
  try {
    valid = await verifyBitveinsPassword(getBitveinsPasswordHash(), body.password)
  }
  catch {
    throw createError({
      statusCode: 500,
      statusMessage: 'Bitveins auth is not configured.',
    })
  }

  if (!valid) {
    loginLimiter.recordFailure(key)
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid passphrase.',
    })
  }

  loginLimiter.recordSuccess(key)

  await setUserSession(event, {
    user: {
      id: 'bitveins',
      login: 'bitveins',
    },
    authVersion: getBitveinsAuthVersion(),
    loggedInAt: Date.now(),
  }, {
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  })

  return {
    authenticated: true,
  }
})
