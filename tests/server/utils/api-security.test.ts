import { describe, expect, it } from 'vitest'
import {
  isPublicApiPath,
  requiresApiAuthentication,
} from '../../../server/utils/api-security'

describe('API authentication policy', () => {
  it('keeps only pre-authentication endpoints public', () => {
    expect(isPublicApiPath('/api/auth/login')).toBe(true)
    expect(isPublicApiPath('/api/auth/session')).toBe(true)
    expect(isPublicApiPath('/api/auth/logout')).toBe(false)
  })

  it.each([
    '/api/auth/logout',
    '/api/download',
    '/api/dropzones',
    '/api/sessions',
    '/api/sessions/demo/files',
    '/api/upload',
  ])('requires authentication for %s', (path) => {
    expect(requiresApiAuthentication(path)).toBe(true)
  })

  it('leaves the WebSocket route to its upgrade authentication handler', () => {
    expect(requiresApiAuthentication('/api/ws')).toBe(false)
  })

  it('does not apply API authentication policy to page routes', () => {
    expect(requiresApiAuthentication('/')).toBe(false)
  })
})
