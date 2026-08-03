import { describe, expect, it, vi } from 'vitest'
import { WebPushNotificationService } from '../../../../../server/modules/attention/application/web-push-notification-service'
import type { PushSubscriptionRepository } from '../../../../../server/modules/attention/ports/push-subscription-repository'
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
  subscriptions: PushSubscriptionInput[] = []
  getPreference = () => this.preference
  list = () => [...this.subscriptions]
  remove = (endpoint: string) => {
    const before = this.subscriptions.length
    this.subscriptions = this.subscriptions.filter(item => item.endpoint !== endpoint)
    return this.subscriptions.length !== before
  }
  setPreference = (preference: { showDetails: boolean }) => (this.preference = preference)
  upsert = (subscription: PushSubscriptionInput) => {
    this.remove(subscription.endpoint)
    this.subscriptions.push(subscription)
  }
}

function subscription(id: number): PushSubscriptionInput {
  return {
    endpoint: `https://push.example.test/${id}`,
    expirationTime: null,
    keys: { auth: `auth-${id}`, p256dh: `public-${id}` },
  }
}

describe('WebPushNotificationService', () => {
  it('removes expired subscriptions and redacts provider failures', async () => {
    const repository = new MemorySubscriptions()
    repository.subscriptions = [subscription(1), subscription(2), subscription(3)]
    const warn = vi.fn()
    const send = vi.fn(async (target: PushSubscriptionInput) => {
      if (target.endpoint.endsWith('/1')) throw Object.assign(new Error(target.endpoint), { statusCode: 410 })
      if (target.endpoint.endsWith('/2')) throw Object.assign(new Error('private auth token'), { statusCode: 503 })
    })
    const service = new WebPushNotificationService({
      logger: { warn },
      repository,
      sender: { send },
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
})
