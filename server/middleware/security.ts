import { requiresApiAuthentication } from '../utils/api-security'

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname

  setResponseHeaders(event, {
    'Content-Security-Policy': 'base-uri \'self\'; frame-ancestors \'none\'; object-src \'none\'',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  })

  if (!path.startsWith('/api/')) {
    return
  }

  setResponseHeader(event, 'Cache-Control', 'no-store')
  assertRequestOrigin(event)

  if (requiresApiAuthentication(path)) {
    await requireBitveinsSession(event)
  }
})
