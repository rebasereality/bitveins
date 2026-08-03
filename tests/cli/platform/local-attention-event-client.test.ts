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

describe('LocalAttentionEventClient', () => {
  it('posts to loopback with the dedicated token and returns the event id', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
      }),
    )
  })

  it('uses a timeout and exposes no response body or secret on failure', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('private endpoint details', { status: 500 }))
    const client = new LocalAttentionEventClient({
      environment: { read: vi.fn().mockResolvedValue(environment) },
      fetcher,
      timeoutMs: 50,
    })

    await expect(client.create({
      source: 'shell', title: 'Failed', type: 'failed',
    })).rejects.toThrow('Unable to create the Bitveins event (HTTP 500).')
  })
})
