import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DrizzlePushSubscriptionRepository } from '../../../../../server/modules/attention/adapters/drizzle-push-subscription-repository'
import { closeDatabase, useDrizzle } from '../../../../../server/utils/db'

let tempDir = ''
const subscription = {
  endpoint: 'https://push.example.test/device',
  expirationTime: null,
  keys: { auth: 'auth-key', p256dh: 'public-key' },
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bitveins-push-'))
  process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'history.sqlite')
})

afterEach(() => {
  closeDatabase()
  delete process.env.BITVEINS_DATABASE_PATH
  rmSync(tempDir, { force: true, recursive: true })
})

describe('DrizzlePushSubscriptionRepository integration', () => {
  it('creates, deduplicates, updates and removes subscriptions', () => {
    const repository = new DrizzlePushSubscriptionRepository(useDrizzle())
    repository.upsert(subscription, 100)
    repository.upsert({
      ...subscription,
      keys: { auth: 'next-auth', p256dh: 'next-public' },
    }, 200)

    expect(repository.list()).toEqual([{
      endpoint: subscription.endpoint,
      expirationTime: null,
      keys: { auth: 'next-auth', p256dh: 'next-public' },
      showDetails: false,
    }])
    expect(repository.removeIfMatches(subscription)).toBe(false)
    expect(repository.list()).toHaveLength(1)
    expect(repository.remove(subscription.endpoint)).toBe(true)
    expect(repository.remove(subscription.endpoint)).toBe(false)
    expect(repository.list()).toEqual([])
  })

  it('persists details preference per subscription disabled by default', () => {
    const repository = new DrizzlePushSubscriptionRepository(useDrizzle())
    repository.upsert(subscription, 100)
    expect(repository.getPreference(subscription.endpoint)).toEqual({ showDetails: false })
    expect(repository.setPreference(subscription.endpoint, { showDetails: true }, 300)).toEqual({ showDetails: true })
    expect(repository.getPreference(subscription.endpoint)).toEqual({ showDetails: true })
    expect(repository.getPreference('https://push.example.test/other')).toEqual({ showDetails: false })
  })
})
