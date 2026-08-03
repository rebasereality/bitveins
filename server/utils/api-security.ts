const PUBLIC_API_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/session',
])

export function isPublicApiPath(path: string): boolean {
  return PUBLIC_API_PATHS.has(path)
}

export function requiresApiAuthentication(path: string): boolean {
  return path.startsWith('/api/')
    && path !== '/api/ws'
    && path !== '/api/integrations/events'
    && !isPublicApiPath(path)
}
