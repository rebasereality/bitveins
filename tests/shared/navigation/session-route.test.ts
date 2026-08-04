import { describe, expect, it } from 'vitest'
import {
  explorerSessionRoute,
  parseSessionRoute,
  stableSessionRoute,
  terminalSessionRoute,
} from '../../../shared/navigation/session-route'

const session = { id: 'abcdefghijklmnop', name: 'kouizine.prod' }

describe('session route codec', () => {
  it('round-trips stable session, terminal, Explorer root, and file routes', () => {
    expect(parseSessionRoute(stableSessionRoute(session))).toEqual({
      valid: true,
      target: { kind: 'stable-session', sessionId: session.id, sessionName: session.name },
    })
    const terminalUrl = new URL(terminalSessionRoute(session, '@4', 'evt_123456789012'), 'https://bitveins.test')
    expect(parseSessionRoute(terminalUrl.pathname, terminalUrl.search)).toEqual({
      valid: true,
      target: {
        eventId: 'evt_123456789012',
        kind: 'terminal',
        sessionId: session.id,
        sessionName: session.name,
        windowNumber: 4,
      },
    })
    expect(parseSessionRoute(explorerSessionRoute(session, null))).toMatchObject({
      valid: true,
      target: { kind: 'explorer', path: null },
    })
    const file = explorerSessionRoute(session, 'docs/guide français.md')
    expect(parseSessionRoute(new URL(file, 'https://bitveins.test').pathname)).toMatchObject({
      valid: true,
      target: { kind: 'explorer', path: 'docs/guide français.md' },
    })
  })

  it('accepts strict convenience and legacy links', () => {
    expect(parseSessionRoute('/s/kouizine')).toMatchObject({ valid: true, target: { kind: 'session' } })
    expect(parseSessionRoute('/', '?session=kouizine&window=%404&event=evt_123456789012')).toMatchObject({
      valid: true,
      target: { kind: 'legacy', sessionName: 'kouizine', windowId: '@4' },
    })
  })

  it.each([
    ['/s/name~short/t/4', ''],
    ['/s/name~abcdefghijklmnop/t/-1', ''],
    ['/s/name~abcdefghijklmnop/t/4/extra', ''],
    ['/s/name~abcdefghijklmnop/e/..', ''],
    ['/s/name~abcdefghijklmnop/e/%2e%2e', ''],
    ['/s/name~abcdefghijklmnop/e/docs%2Fsecret', ''],
    ['/s/name~abcdefghijklmnop/e/docs%5Csecret', ''],
    ['/s/name~abcdefghijklmnop/e/%00secret', ''],
    ['/', '?session=main&session=other'],
    ['/', '?session=main&next=https://attacker.test'],
    ['/s/main', '?window=%404'],
  ])('rejects unsafe or ambiguous input %s%s', (pathname, search) => {
    expect(parseSessionRoute(pathname, search).valid).toBe(false)
  })

  it('rejects oversized URLs and paths', () => {
    expect(parseSessionRoute(`/s/name~abcdefghijklmnop/e/${'a'.repeat(2100)}`).valid).toBe(false)
    expect(() => explorerSessionRoute(session, 'a'.repeat(1025))).toThrow(/too long/u)
  })
})
