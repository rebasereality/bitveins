import { describe, expect, it } from 'vitest'
import { resolveInternalNotificationUrl } from '../../service-worker/notification-navigation'

describe('notification navigation', () => {
  it('accepts only validated canonical or strict legacy routes on the current origin', () => {
    const origin = 'https://terminal.example.com'
    expect(resolveInternalNotificationUrl('/?session=demo&window=%404&event=evt_123456789012', origin))
      .toBe('https://terminal.example.com/?session=demo&window=%404&event=evt_123456789012')
    expect(resolveInternalNotificationUrl('/s/demo~abcdefghijklmnop/t/4?event=evt_123456789012', origin))
      .toBe('https://terminal.example.com/s/demo~abcdefghijklmnop/t/4?event=evt_123456789012')
    expect(resolveInternalNotificationUrl('/s/demo~abcdefghijklmnop/e/docs/readme.md', origin))
      .toBe('https://terminal.example.com/s/demo~abcdefghijklmnop/e/docs/readme.md')
    expect(resolveInternalNotificationUrl('https://attacker.example/', origin)).toBe(origin)
    expect(resolveInternalNotificationUrl('/admin', origin)).toBe(origin)
    expect(resolveInternalNotificationUrl('/s/demo~abcdefghijklmnop/e/%2e%2e/secret', origin)).toBe(origin)
    expect(resolveInternalNotificationUrl('/?session=demo&next=https://attacker.example', origin)).toBe(origin)
    expect(resolveInternalNotificationUrl('javascript:alert(1)', origin)).toBe(origin)
  })
})
