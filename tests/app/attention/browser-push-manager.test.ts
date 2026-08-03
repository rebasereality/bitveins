import { describe, expect, it, vi } from 'vitest'
import { BrowserPushManager } from '../../../app/attention/browser-push-manager'

function api() {
  return {
    loadConfiguration: vi.fn().mockResolvedValue({ publicKey: 'AQID', preference: { showDetails: false } }),
    removeSubscription: vi.fn().mockResolvedValue(undefined),
    saveSubscription: vi.fn().mockResolvedValue(undefined),
  }
}

describe('BrowserPushManager', () => {
  it('reports unsupported without requesting permission', async () => {
    const requestPermission = vi.fn()
    const manager = new BrowserPushManager({ api: api(), notification: undefined, serviceWorker: undefined })
    await expect(manager.enable()).resolves.toBe('unsupported')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('requests permission only from enable and stops when denied', async () => {
    const client = api()
    const requestPermission = vi.fn().mockResolvedValue('denied')
    const manager = new BrowserPushManager({
      api: client,
      notification: { permission: 'default', requestPermission },
      serviceWorker: { ready: Promise.resolve({ pushManager: {} as PushManager }) },
    })

    expect(requestPermission).not.toHaveBeenCalled()
    await expect(manager.enable()).resolves.toBe('denied')
    expect(requestPermission).toHaveBeenCalledOnce()
    expect(client.saveSubscription).not.toHaveBeenCalled()
  })

  it('subscribes with the VAPID public key and persists the browser subscription', async () => {
    const client = api()
    const subscription = {
      endpoint: 'https://push.example/sub',
      toJSON: () => ({ endpoint: 'https://push.example/sub', keys: { auth: 'auth', p256dh: 'p256dh' } }),
    } as unknown as PushSubscription
    const subscribe = vi.fn().mockResolvedValue(subscription)
    const manager = new BrowserPushManager({
      api: client,
      notification: { permission: 'granted', requestPermission: vi.fn() },
      serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe } as unknown as PushManager }) },
    })

    await expect(manager.enable()).resolves.toBe('subscribed')
    expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: expect.any(ArrayBuffer),
    }))
    expect(client.saveSubscription).toHaveBeenCalledWith(subscription.toJSON())
  })
})
