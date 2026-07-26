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
    expect(environment.allowedOrigins).toEqual([
      'https://terminal.example.com',
      'http://127.0.0.1:3456',
      'http://localhost:3456',
    ])
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

  it('parses only an exact unprivileged TCP port', () => {
    expect(parseBitveinsPort(undefined)).toBe(3000)
    expect(parseBitveinsPort('3456')).toBe(3456)
    expect(() => parseBitveinsPort('3000junk')).toThrow(/integer/)
    expect(() => parseBitveinsPort('80')).toThrow(/1024/)
    expect(() => parseBitveinsPort('65536')).toThrow(/65535/)
  })
})
