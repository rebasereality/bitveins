import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DrizzlePushSessionMuteRepository } from '../../../../../server/modules/attention/adapters/drizzle-push-session-mute-repository'
import { DrizzlePushSubscriptionRepository } from '../../../../../server/modules/attention/adapters/drizzle-push-subscription-repository'
import { closeDatabase, useDrizzle } from '../../../../../server/utils/db'

let tempDir = ''
const endpoint = 'https://push.example.test/device'

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bitveins-session-mutes-'))
  process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'history.sqlite')
})

afterEach(() => {
  closeDatabase()
  delete process.env.BITVEINS_DATABASE_PATH
  rmSync(tempDir, { force: true, recursive: true })
})

describe('DrizzlePushSessionMuteRepository integration', () => {
  it('persists independent session mutes for each subscription', () => {
    const database = useDrizzle()
    const subscriptions = new DrizzlePushSubscriptionRepository(database)
    const mutes = new DrizzlePushSessionMuteRepository(database)
    subscriptions.upsert({
      endpoint,
      expirationTime: null,
      keys: { auth: 'auth-key', p256dh: 'public-key' },
    }, 100)

    expect(mutes.setMuted(endpoint, 'abcdefghijklmnop', true, 200)).toBe(true)
    expect(mutes.setMuted(endpoint, 'qrstuvwxyzabcdef', true, 300)).toBe(true)
    expect(mutes.list(endpoint)).toEqual(['abcdefghijklmnop', 'qrstuvwxyzabcdef'])
    expect(mutes.isMuted(endpoint, 'abcdefghijklmnop')).toBe(true)
    expect(mutes.isMuted('https://push.example.test/other', 'abcdefghijklmnop')).toBe(false)

    expect(mutes.setMuted(endpoint, 'abcdefghijklmnop', false, 400)).toBe(false)
    expect(mutes.list(endpoint)).toEqual(['qrstuvwxyzabcdef'])
    mutes.removeEndpoint(endpoint)
    expect(mutes.list(endpoint)).toEqual([])
  })
})
