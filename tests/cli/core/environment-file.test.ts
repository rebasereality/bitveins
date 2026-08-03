import { describe, expect, it } from 'vitest'
import {
  createBitveinsEnvironment,
  incrementAuthVersion,
  normalizePublicOrigin,
  parseEnvironmentFile,
  parseBitveinsPort,
  serializeEnvironmentFile,
} from '../../../cli/core/environment-file'
import { createEnvironmentFixture } from '../support/release-fixture'

describe('Bitveins environment file', () => {
  it('round-trips escaped values without exposing unquoted syntax', () => {
    const environment = createEnvironmentFixture({
      extensions: {
        A_VALUE: 'hello "world"',
        PATH_VALUE: String.raw`a\b`,
      },
    })
    const serialized = serializeEnvironmentFile(environment)

    expect(parseEnvironmentFile(serialized)).toEqual(environment)
  })

  it('creates a loopback-only production configuration', () => {
    const environment = createBitveinsEnvironment({
      allowedOrigin: 'https://terminal.example.com',
      databasePath: '/data/history.sqlite',
      passwordHash: '$scrypt$hash',
      port: 3456,
    })

    expect(environment.host).toBe('127.0.0.1')
    expect(environment.port).toBe(3456)
    expect(environment.sessionPassword).toHaveLength(64)
    expect(environment.eventToken).toHaveLength(64)
    expect(environment.vapidPrivateKey.length).toBeGreaterThanOrEqual(40)
    expect(environment.vapidPublicKey.length).toBeGreaterThanOrEqual(80)
    expect(environment.allowedOrigins).toEqual([
      'https://terminal.example.com',
      'http://127.0.0.1:3456',
      'http://localhost:3456',
    ])
  })

  it('initializes missing integration secrets when reading a pre-inbox configuration', () => {
    const legacy = serializeEnvironmentFile(createEnvironmentFixture())
      .split('\n')
      .filter(line => !line.startsWith('BITVEINS_EVENT_TOKEN='))
      .filter(line => !line.startsWith('BITVEINS_VAPID_'))
      .join('\n')

    const upgraded = parseEnvironmentFile(legacy)

    expect(upgraded.eventToken).toHaveLength(64)
    expect(upgraded.vapidPrivateKey.length).toBeGreaterThanOrEqual(40)
    expect(upgraded.vapidPublicKey.length).toBeGreaterThanOrEqual(80)
  })

  it('accepts only a bare HTTPS public origin', () => {
    expect(normalizePublicOrigin('https://terminal.example.com/'))
      .toBe('https://terminal.example.com')
    expect(() => normalizePublicOrigin('http://terminal.example.com'))
      .toThrow(/HTTPS/)
    expect(() => normalizePublicOrigin('https://terminal.example.com/path'))
      .toThrow(/must not contain/)
  })

  it('increments numeric auth versions and replaces opaque ones', () => {
    expect(incrementAuthVersion('41')).toBe('42')
    expect(incrementAuthVersion('opaque')).toMatch(/^[0-9a-f]{24}$/)
  })

  it('rejects malformed environment lines and control characters', () => {
    expect(() => parseEnvironmentFile('not-an-assignment'))
      .toThrow(/line 1/)
    expect(() => serializeEnvironmentFile(createEnvironmentFixture({
      extensions: { VALID: 'line\nbreak' },
    })))
      .toThrow(/unsupported character/)
  })

  it('rejects invalid keys, missing required values and partial VAPID pairs', () => {
    const serialized = serializeEnvironmentFile(createEnvironmentFixture())
    expect(parseEnvironmentFile(serialized.replace('HOST="127.0.0.1"', 'HOST=127.0.0.1')).host)
      .toBe('127.0.0.1')
    expect(() => parseEnvironmentFile(`${serialized}invalid-key="value"\n`))
      .toThrow(/Invalid environment key/)
    expect(() => parseEnvironmentFile(
      serialized.split('\n').filter(line => !line.startsWith('HOST=')).join('\n'),
    )).toThrow(/HOST is missing/)
    expect(() => parseEnvironmentFile(
      serialized.split('\n').filter(line => !line.startsWith('BITVEINS_VAPID_PRIVATE_KEY=')).join('\n'),
    )).toThrow(/configured as a pair/)
  })

  it('parses only an exact unprivileged TCP port', () => {
    expect(parseBitveinsPort(undefined)).toBe(3000)
    expect(parseBitveinsPort('3456')).toBe(3456)
    expect(() => parseBitveinsPort('3000junk')).toThrow(/integer/)
    expect(() => parseBitveinsPort('80')).toThrow(/1024/)
    expect(() => parseBitveinsPort('65536')).toThrow(/65535/)
  })
})
