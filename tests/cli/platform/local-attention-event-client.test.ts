import { describe, expect, it, vi } from 'vitest'
import { LocalAttentionEventClient } from '../../../cli/platform/local-attention-event-client'

const environment = {
  allowedOrigins: ['http://127.0.0.1:4567'],
  authPasswordHash: 'hash',
  authVersion: '1',
  databasePath: '/data/db.sqlite',
  eventToken: 'dedicated-secret',
  extensions: {},
  host: '127.0.0.1',
  port: 4567,
  sessionPassword: 'session-secret',
  vapidPrivateKey: 'private',
  vapidPublicKey: 'public',
}

function responseAt(body: BodyInit | null, init: ResponseInit, url = 'http://127.0.0.1:4567/api/integrations/events') {
  const response = new Response(body, init)
  Object.defineProperty(response, 'url', { value: url })
  return response
}

describe('LocalAttentionEventClient', () => {
  it('posts to loopback with the dedicated token and returns the event id', async () => {
    const fetcher = vi.fn().mockResolvedValue(responseAt(JSON.stringify({
      event: {
        createdAt: '2026-08-03T12:00:00.000Z',
        id: 'evt_123456789012',
        source: 'shell',
        title: 'Done',
        type: 'completed',
      },
    }), { status: 200 }))
    const client = new LocalAttentionEventClient({
      environment: { read: vi.fn().mockResolvedValue(environment) },
      fetcher,
    })

    await expect(client.create({
      source: 'shell', title: 'Done', type: 'completed',
    })).resolves.toBe('evt_123456789012')

    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:4567/api/integrations/events',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer dedicated-secret' }),
        method: 'POST',
        redirect: 'error',
      }),
    )
  })

  it('uses a timeout and exposes no response body or secret on failure', async () => {
    const fetcher = vi.fn().mockResolvedValue(responseAt('private endpoint details', { status: 500 }))
    const client = new LocalAttentionEventClient({
      environment: { read: vi.fn().mockResolvedValue(environment) },
      fetcher,
      timeoutMs: 50,
    })

    await expect(client.create({
      source: 'shell', title: 'Failed', type: 'failed',
    })).rejects.toThrow('Unable to create the Bitveins event (HTTP 500).')
  })

  it('refuses redirects and responses from a different URL', async () => {
    const redirected = vi.fn().mockResolvedValue(responseAt(null, {
      headers: { location: 'https://attacker.test/capture' },
      status: 307,
    }))
    const redirectedClient = new LocalAttentionEventClient({
      environment: { read: vi.fn().mockResolvedValue(environment) },
      fetcher: redirected,
    })

    await expect(redirectedClient.create({
      source: 'shell', title: 'Done', type: 'completed',
    })).rejects.toThrow()
    expect(redirected).toHaveBeenCalledTimes(1)

    const mismatchedClient = new LocalAttentionEventClient({
      environment: { read: vi.fn().mockResolvedValue(environment) },
      fetcher: vi.fn().mockResolvedValue(responseAt(JSON.stringify({}), {
        status: 200,
      }, 'http://127.0.0.1:9999/api/integrations/events')),
    })
    await expect(mismatchedClient.create({
      source: 'shell', title: 'Done', type: 'completed',
    })).rejects.toThrow(/unexpected URL/i)
  })

  it('handles connection failure and invalid event response payloads', async () => {
    const unreachableClient = new LocalAttentionEventClient({
      environment: { read: vi.fn().mockResolvedValue(environment) },
      fetcher: vi.fn().mockRejectedValue(new Error('connection refused')),
    })
    await expect(unreachableClient.create({
      source: 'shell', title: 'Done', type: 'completed',
    })).rejects.toThrow(/Unable to connect to the local Bitveins service/)

    const invalidSchemaClient = new LocalAttentionEventClient({
      environment: { read: vi.fn().mockResolvedValue(environment) },
      fetcher: vi.fn().mockResolvedValue(responseAt(JSON.stringify({ invalid: true }), {
        status: 200,
      })),
    })
    await expect(invalidSchemaClient.create({
      source: 'shell', title: 'Done', type: 'completed',
    })).rejects.toThrow(/returned an invalid event response/)
  })
})
