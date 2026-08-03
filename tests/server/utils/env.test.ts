import { describe, expect, it } from 'vitest'
import { assertProductionEnv, getValidatedEnv } from '../../../server/utils/env'

describe('server/utils/env', () => {
  it('parses valid environment variables with defaults', () => {
    const env = getValidatedEnv({
      BITVEINS_AUTH_VERSION: '1',
    })

    expect(env.BITVEINS_AUTH_VERSION).toBe('1')
    expect(env.BITVEINS_AUTH_PASSWORD_HASH).toBe('')
  })

  it('rejects invalid BITVEINS_AUTH_VERSION characters', () => {
    expect(() => getValidatedEnv({
      BITVEINS_AUTH_VERSION: '1; DROP TABLE sessions;',
    })).toThrow(/Invalid Bitveins environment configuration/)
  })

  it('accepts safe tmux socket names and rejects argument-like values', () => {
    expect(getValidatedEnv({
      BITVEINS_TMUX_SOCKET_NAME: 'bitveins-e2e.1',
    }).BITVEINS_TMUX_SOCKET_NAME).toBe('bitveins-e2e.1')
    expect(() => getValidatedEnv({
      BITVEINS_TMUX_SOCKET_NAME: '--bad socket',
    })).toThrow(/BITVEINS_TMUX_SOCKET_NAME contains unsupported characters/)
  })

  it('requires production authentication secrets', () => {
    const env = getValidatedEnv({
      BITVEINS_AUTH_VERSION: '1',
    })

    expect(() => assertProductionEnv(env, 'production'))
      .toThrow('NUXT_SESSION_PASSWORD must contain at least 32 characters')
  })

  it('accepts complete production authentication configuration', () => {
    const env = getValidatedEnv({
      HOST: '127.0.0.1',
      NUXT_SESSION_PASSWORD: 'a'.repeat(32),
      BITVEINS_AUTH_PASSWORD_HASH: 'hashed-password',
      BITVEINS_AUTH_VERSION: '1',
      BITVEINS_EVENT_TOKEN: 'b'.repeat(32),
      BITVEINS_VAPID_PRIVATE_KEY: 'c'.repeat(43),
      BITVEINS_VAPID_PUBLIC_KEY: 'd'.repeat(87),
    })

    expect(() => assertProductionEnv(env, 'production')).not.toThrow()
    expect(() => assertProductionEnv({
      ...env,
      BITVEINS_VAPID_PUBLIC_KEY: 'invalid',
    }, 'production')).toThrow('canonical P-256 Base64URL')
  })

  it('requires a password hash even when the session secret is valid', () => {
    const env = getValidatedEnv({
      HOST: '127.0.0.1',
      NUXT_SESSION_PASSWORD: 'a'.repeat(32),
    })

    expect(() => assertProductionEnv(env, 'production'))
      .toThrow('BITVEINS_AUTH_PASSWORD_HASH is required in production.')
  })

  it('does not require production secrets during development', () => {
    expect(() => assertProductionEnv(getValidatedEnv({}), 'development')).not.toThrow()
  })

  it('rejects production bindings outside loopback', () => {
    const env = getValidatedEnv({
      HOST: '0.0.0.0',
      NUXT_SESSION_PASSWORD: 'a'.repeat(32),
      BITVEINS_AUTH_PASSWORD_HASH: 'hashed-password',
    })

    expect(() => assertProductionEnv(env, 'production'))
      .toThrow('HOST must be exactly 127.0.0.1 in production.')
  })
})
