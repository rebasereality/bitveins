import { describe, expect, it } from 'vitest'
import {
  attentionEventSchema,
  createAttentionEventSchema,
  createAttentionDeepLink,
  notificationPreferenceSchema,
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
      endpoint: 'https://push.example.test/subscription',
      expirationTime: null,
      keys: { auth: 'auth-key', p256dh: 'public-key' },
    })).toMatchObject({ endpoint: 'https://push.example.test/subscription' })
    expect(notificationPreferenceSchema.parse({})).toEqual({ showDetails: false })
    expect(() => pushSubscriptionSchema.parse({
      endpoint: 'http://push.example.test/subscription',
      keys: { auth: 'auth-key', p256dh: 'public-key' },
    })).toThrow()
  })
})
