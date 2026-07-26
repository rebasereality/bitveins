import { describe, expect, it } from 'vitest'
import {
  hashBitveinsPassword,
  InvalidBitveinsPasswordError,
  bitveinsPasswordNeedsRehash,
  validateBitveinsPassword,
  verifyBitveinsPassword,
} from '../../../shared/security/password-hasher'

describe('Bitveins password hasher', () => {
  it('creates and verifies a compatible Scrypt hash', async () => {
    const password = 'four words make a solid passphrase'
    const hash = await hashBitveinsPassword(password)

    expect(hash).toMatch(/^\$scrypt\$/)
    await expect(verifyBitveinsPassword(hash, password)).resolves.toBe(true)
    await expect(verifyBitveinsPassword(hash, 'incorrect password')).resolves.toBe(false)
    expect(bitveinsPasswordNeedsRehash(hash)).toBe(false)
  })

  it.each([
    '',
    'short',
    'passwordpassword',
    'aaaaaaaaaaaaaa',
    '              ',
    'long enough but\nunsafe',
  ])('rejects weak password %j', (password) => {
    expect(() => validateBitveinsPassword(password))
      .toThrow(InvalidBitveinsPasswordError)
  })

  it('rejects excessively long passwords', () => {
    expect(() => validateBitveinsPassword('aB3!'.repeat(300)))
      .toThrow(/at most/)
  })
})
