import { describe, expect, it } from 'vitest'
import {
  attentionEventSchema,
  createAttentionEventSchema,
  createAttentionDeepLink,
  notificationPreferenceSchema,
  pushNotificationPayloadSchema,
  pushSubscriptionSchema,
} from '../../../shared/contracts/attention'

describe('attention contracts', () => {
  it('accepts every generic attention type and normalizes optional context', () => {
    for (const type of ['input_required', 'permission_required', 'completed', 'failed', 'information'] as const) {
      expect(createAttentionEventSchema.parse({
        source: 'codex',
        title: 'Attention required',
        type,
      })).toEqual({ source: 'codex', title: 'Attention required', type })
    }
  })

  it('rejects control characters, unknown fields and invalid tmux identifiers', () => {
    expect(() => createAttentionEventSchema.parse({
      source: 'codex\nsecret',
      title: 'Bad',
      type: 'information',
    })).toThrow()
    expect(() => createAttentionEventSchema.parse({
      source: 'codex',
      title: 'Bad',
      type: 'unknown',
    })).toThrow()
    expect(() => createAttentionEventSchema.parse({
      source: 'codex',
      title: 'Bad',
      type: 'information',
      windowId: '4',
    })).toThrow()
  })

  it('validates persisted lifecycle timestamps and generates only internal deep links', () => {
    const event = attentionEventSchema.parse({
      id: 'evt_123456789012',
      source: 'codex',
      title: 'Permission required',
      type: 'permission_required',
      project: 'Kouizine',
      sessionName: 'kouizine',
      windowId: '@4',
      createdAt: '2026-08-03T12:00:00.000Z',
    })

    expect(createAttentionDeepLink(event)).toBe('/?session=kouizine&window=%404&event=evt_123456789012')
    expect(() => attentionEventSchema.parse({ ...event, readAt: 'yesterday' })).toThrow()
  })

  it('strictly validates push subscriptions and keeps details disabled by default', () => {
    expect(pushSubscriptionSchema.parse({
      endpoint: 'https://fcm.googleapis.com/fcm/send/subscription',
      expirationTime: null,
      keys: { auth: 'auth-key', p256dh: 'public-key' },
    })).toMatchObject({ endpoint: 'https://fcm.googleapis.com/fcm/send/subscription' })
    expect(notificationPreferenceSchema.parse({})).toEqual({ showDetails: false })
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/subscription',
      'https://127.0.0.1/push',
      'https://169.254.169.254/latest/meta-data',
      'https://fcm.googleapis.com.attacker.test/push',
      'https://user@fcm.googleapis.com/push',
      'https://fcm.googleapis.com:8443/push',
    ]) {
      expect(() => pushSubscriptionSchema.parse({
        endpoint,
        keys: { auth: 'auth-key', p256dh: 'public-key' },
      })).toThrow()
    }
  })

  it('validates the encrypted notification payload and internal deep link shape', () => {
    expect(pushNotificationPayloadSchema.parse({
      body: 'Source: test',
      data: { url: '/?session=demo&window=%401&event=evt_123456789012' },
      tag: 'attention:evt_123456789012',
      title: 'Attention required',
    })).toBeTruthy()
    expect(() => pushNotificationPayloadSchema.parse({
      body: 'Source: test',
      data: { url: 'https://attacker.test/' },
      tag: 'attention:evt_123456789012',
      title: 'Attention required',
    })).toThrow()
  })
})
