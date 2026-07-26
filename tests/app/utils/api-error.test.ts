import { describe, expect, it } from 'vitest'
import { apiErrorMessage, isUnauthorizedError } from '../../../app/utils/api-error'

describe('API error normalization', () => {
  it('uses server status messages before generic errors', () => {
    expect(apiErrorMessage({
      data: { statusMessage: 'Precise API failure' },
      message: 'Generic failure',
    }, 'Fallback')).toBe('Precise API failure')
  })

  it('supports response data and safe fallbacks', () => {
    expect(apiErrorMessage({
      response: { _data: { statusMessage: 'Download failure' } },
    }, 'Fallback')).toBe('Download failure')
    expect(apiErrorMessage(null, 'Fallback')).toBe('Fallback')
  })

  it('recognizes only explicit HTTP 401 errors', () => {
    expect(isUnauthorizedError({ statusCode: 401 })).toBe(true)
    expect(isUnauthorizedError({ statusCode: 403 })).toBe(false)
    expect(isUnauthorizedError('401')).toBe(false)
  })
})
