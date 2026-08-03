import { describe, expect, it, vi } from 'vitest'
import { NodeWebPushSender } from '../../../../../server/modules/attention/adapters/node-web-push-sender'

const payload = {
  body: 'Source: test',
  data: { url: '/?event=evt_123456789012' },
  tag: 'attention:evt_123456789012',
  title: 'Attention',
}

const subscription = (endpoint: string) => ({
  endpoint,
  keys: { auth: 'auth-key', p256dh: 'public-key' },
})

describe('NodeWebPushSender', () => {
  it('rejects unsupported endpoints before opening an outbound request', async () => {
    const sendNotification = vi.fn()
    const sender = new NodeWebPushSender({
      client: { sendNotification },
      privateKey: 'private',
      publicKey: 'public',
    })

    await expect(sender.send(subscription('https://127.0.0.1/private'), payload))
      .rejects.toThrow('Unsupported Web Push endpoint.')
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('sends only to a supported browser push service with bounded options', async () => {
    const sendNotification = vi.fn().mockResolvedValue(undefined)
    const sender = new NodeWebPushSender({
      client: { sendNotification },
      privateKey: 'private',
      publicKey: 'public',
      timeoutMs: 500,
    })
    const target = subscription('https://fcm.googleapis.com/fcm/send/device')

    await sender.send(target, payload)

    expect(sendNotification).toHaveBeenCalledWith(
      target,
      JSON.stringify(payload),
      expect.objectContaining({ TTL: 3600, timeout: 500 }),
    )
  })
})
