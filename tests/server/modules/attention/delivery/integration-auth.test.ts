import { describe, expect, it } from 'vitest'
import { assertEventIntegrationRequest } from '../../../../../server/modules/attention/delivery/integration-auth'

describe('event integration authentication', () => {
  it('accepts only loopback callers with the dedicated bearer token', () => {
    expect(() => assertEventIntegrationRequest({
      authorization: 'Bearer dedicated-secret',
      remoteAddress: '127.0.0.1',
    }, 'dedicated-secret')).not.toThrow()
    expect(() => assertEventIntegrationRequest({
      authorization: 'Bearer dedicated-secret',
      remoteAddress: '::ffff:127.0.0.1',
    }, 'dedicated-secret')).not.toThrow()
  })

  it('returns one generic error for remote, malformed and incorrect credentials', () => {
    for (const request of [
      { authorization: 'Bearer dedicated-secret', remoteAddress: '10.0.0.2' },
      { authorization: 'Bearer wrong', remoteAddress: '127.0.0.1' },
      { remoteAddress: '127.0.0.1' },
    ]) {
      expect(() => assertEventIntegrationRequest(request, 'dedicated-secret'))
        .toThrow('Unauthorized event integration request.')
    }
  })
})
