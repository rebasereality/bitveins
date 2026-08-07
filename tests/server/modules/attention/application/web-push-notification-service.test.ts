import { describe, expect, it, vi } from 'vitest'
import { WebPushNotificationService } from '../../../../../server/modules/attention/application/web-push-notification-service'
import type { PushSubscriptionRepository, StoredPushSubscription } from '../../../../../server/modules/attention/ports/push-subscription-repository'
import type { PushSubscriptionInput } from '../../../../../shared/contracts/attention'

const event = {
  createdAt: '2026-08-03T12:00:00.000Z',
  id: 'evt_123456789012',
  source: 'Codex',
  title: 'Completed',
  type: 'completed' as const,
}

class MemorySubscriptions implements PushSubscriptionRepository {
  preference = { showDetails: false }
  subscriptions: StoredPushSubscription[] = []
  getPreference = () => this.preference
  list = () => [...this.subscriptions]
  remove = (endpoint: string) => {
    const before = this.subscriptions.length
    this.subscriptions = this.subscriptions.filter(item => item.endpoint !== endpoint)
    return this.subscriptions.length !== before
  }

  removeIfMatches = (subscription: PushSubscriptionInput) => {
    const stored = this.subscriptions.find(item => item.endpoint === subscription.endpoint)
    if (
      !stored
      || stored.keys.auth !== subscription.keys.auth
      || stored.keys.p256dh !== subscription.keys.p256dh
    ) return false
    return this.remove(subscription.endpoint)
  }

  setPreference = (_endpoint: string, preference: { showDetails: boolean }) => (this.preference = preference)
  upsert = (subscription: PushSubscriptionInput) => {
    this.remove(subscription.endpoint)
    this.subscriptions.push({ ...subscription, showDetails: this.preference.showDetails })
  }
}

function subscription(id: number): StoredPushSubscription {
  return {
    endpoint: `https://push.example.test/${id}`,
    expirationTime: null,
    keys: { auth: `auth-${id}`, p256dh: `public-${id}` },
    showDetails: false,
  }
}

describe('WebPushNotificationService', () => {
  it('removes expired subscriptions and redacts provider failures', async () => {
    const repository = new MemorySubscriptions()
    repository.subscriptions = [subscription(1), subscription(2), subscription(3)]
    const warn = vi.fn()
    const removeEndpoint = vi.fn()
    const send = vi.fn(async (target: PushSubscriptionInput) => {
      if (target.endpoint.endsWith('/1')) throw Object.assign(new Error(target.endpoint), { statusCode: 410 })
      if (target.endpoint.endsWith('/2')) throw Object.assign(new Error('private auth token'), { statusCode: 503 })
    })
    const service = new WebPushNotificationService({
      logger: { warn },
      repository,
      sender: { send },
      sessionMutes: {
        isMuted: vi.fn(),
        list: vi.fn(),
        removeEndpoint,
        setMuted: vi.fn(),
      },
    })

    await expect(service.notify(event)).resolves.toBeUndefined()

    expect(repository.list().map(item => item.endpoint)).toEqual([
      'https://push.example.test/2',
      'https://push.example.test/3',
    ])
    expect(warn).toHaveBeenCalledWith('Web Push delivery failed.', {
      code: 'web_push_failed',
      statusCode: 503,
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('push.example.test/2')
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private auth token')
    expect(removeEndpoint).toHaveBeenCalledWith('https://push.example.test/1')
  })

  it('uses bounded concurrency and sends each event once per subscription', async () => {
    const repository = new MemorySubscriptions()
    repository.subscriptions = Array.from({ length: 9 }, (_, index) => subscription(index))
    let active = 0
    let maximum = 0
    const send = vi.fn(async () => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise(resolve => setTimeout(resolve, 2))
      active -= 1
    })
    const service = new WebPushNotificationService({ repository, sender: { send }, concurrency: 3 })

    await service.notify(event)

    expect(send).toHaveBeenCalledTimes(9)
    expect(maximum).toBeLessThanOrEqual(3)
  })

  it('includes sensitive details only for the subscription that opted in', async () => {
    const repository = new MemorySubscriptions()
    repository.subscriptions = [
      subscription(1),
      { ...subscription(2), showDetails: true },
    ]
    const send = vi.fn()
    const service = new WebPushNotificationService({ repository, sender: { send } })

    await service.notify({ ...event, summary: 'Private migration prompt' })

    expect(send.mock.calls[0]?.[1].body).not.toContain('Private migration prompt')
    expect(send.mock.calls[1]?.[1].body).toContain('Private migration prompt')
  })

  it('does not send a push to a subscription that muted the matching session', async () => {
    const repository = new MemorySubscriptions()
    repository.subscriptions = [subscription(1), subscription(2)]
    const send = vi.fn()
    const isMuted = vi.fn((endpoint: string) => endpoint.endsWith('/1'))
    const service = new WebPushNotificationService({
      repository,
      sender: { send },
      sessionMutes: {
        isMuted,
        list: vi.fn(),
        removeEndpoint: vi.fn(),
        setMuted: vi.fn(),
      },
    })

    await service.notify({ ...event, sessionId: 'abcdefghijklmnop' })

    expect(isMuted).toHaveBeenCalledTimes(2)
    expect(isMuted).toHaveBeenCalledWith('https://push.example.test/1', 'abcdefghijklmnop')
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[0].endpoint).toBe('https://push.example.test/2')
  })
})
