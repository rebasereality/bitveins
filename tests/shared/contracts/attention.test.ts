import { describe, expect, it } from 'vitest'
import {
  attentionEventSchema,
  createAttentionEventSchema,
  createAttentionDeepLink,
  hermesLifecycleEventSchema,
  hermesNotificationPreferenceResponseSchema,
  hermesNotificationPreferenceSchema,
  hermesNotificationPreferenceUpdateSchema,
  integrationAttentionEventResponseSchema,
  integrationAttentionEventSchema,
  isHermesLifecycleEnabled,
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

  it('keeps the existing Hermes lifecycle mapping enabled by default', () => {
    const preference = hermesNotificationPreferenceSchema.parse({})

    expect(preference).toEqual({
      completedWithTools: true,
      completedWithoutTools: false,
      failed: true,
      inputRequired: true,
      permissionRequired: true,
    })
    expect(isHermesLifecycleEnabled(preference, 'completed_with_tools')).toBe(true)
    expect(isHermesLifecycleEnabled(preference, 'completed_without_tools')).toBe(false)
  })

  it('accepts partial Hermes preference updates but rejects empty updates', () => {
    expect(hermesNotificationPreferenceUpdateSchema.parse({
      completedWithoutTools: true,
    })).toEqual({ completedWithoutTools: true })
    expect(() => hermesNotificationPreferenceUpdateSchema.parse({})).toThrow()
    expect(() => hermesNotificationPreferenceUpdateSchema.parse({ unknown: true })).toThrow()
  })

  it('requires privacy-safe typed lifecycle signals for Hermes events', () => {
    expect(hermesLifecycleEventSchema.parse({
      lifecycle: 'completed_without_tools',
      source: 'hermes',
      type: 'completed',
      windowId: '@4',
      paneId: '%8',
    })).toEqual({
      lifecycle: 'completed_without_tools',
      source: 'hermes',
      type: 'completed',
      windowId: '@4',
      paneId: '%8',
    })
    for (const forbidden of [
      { title: 'private answer' },
      { summary: 'tool arguments' },
      { project: 'secret project' },
      { sessionName: 'sensitive-session' },
    ]) {
      expect(() => hermesLifecycleEventSchema.parse({
        lifecycle: 'completed_without_tools',
        source: 'hermes',
        type: 'completed',
        ...forbidden,
      })).toThrow()
    }
    expect(() => hermesLifecycleEventSchema.parse({
      lifecycle: 'completed_without_tools',
      source: 'codex',
      type: 'completed',
    })).toThrow()
  })

  it('normalizes legacy Hermes events into the filtered lifecycle path', () => {
    expect(integrationAttentionEventSchema.parse({
      source: 'hermes',
      title: 'Hermes task completed',
      type: 'completed',
    })).toEqual({
      lifecycle: 'completed_with_tools',
      source: 'hermes',
      type: 'completed',
    })
    expect(() => integrationAttentionEventSchema.parse({
      source: 'hermes',
      title: 'Attacker-controlled completed text',
      type: 'completed',
    })).toThrow()
    expect(() => integrationAttentionEventSchema.parse({
      source: 'hermes',
      title: 'Generic bypass',
      type: 'information',
    })).toThrow()
    expect(integrationAttentionEventSchema.parse({
      source: 'codex',
      title: 'Generic integration',
      type: 'information',
    })).toMatchObject({ source: 'codex', type: 'information' })
    expect(() => createAttentionEventSchema.parse({
      source: 'hermes',
      title: 'Generic route bypass',
      type: 'completed',
    })).toThrow()
    expect(() => createAttentionEventSchema.parse({
      source: 'Hermes',
      title: 'Case-insensitive generic route bypass',
      type: 'completed',
    })).toThrow()
  })

  it('validates normalized preference and suppressed integration responses', () => {
    expect(hermesNotificationPreferenceResponseSchema.parse({
      preference: {},
    }).preference.completedWithoutTools).toBe(false)
    expect(integrationAttentionEventResponseSchema.parse({
      event: null,
      suppressed: true,
    })).toEqual({ event: null, suppressed: true })
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
