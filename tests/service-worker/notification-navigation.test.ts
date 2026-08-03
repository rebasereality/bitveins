import { describe, expect, it } from 'vitest'
import { resolveInternalNotificationUrl } from '../../service-worker/notification-navigation'

describe('notification navigation', () => {
  it('accepts only the root route on the current Bitveins origin', () => {
    const origin = 'https://terminal.example.com'
    expect(resolveInternalNotificationUrl('/?session=demo&window=%404&event=evt_123456789012', origin))
      .toBe('https://terminal.example.com/?session=demo&window=%404&event=evt_123456789012')
    expect(resolveInternalNotificationUrl('https://attacker.example/', origin)).toBe(origin)
    expect(resolveInternalNotificationUrl('/admin', origin)).toBe(origin)
    expect(resolveInternalNotificationUrl('javascript:alert(1)', origin)).toBe(origin)
  })
})
