import { Hash } from '@adonisjs/hash'
import { Scrypt } from '@adonisjs/hash/drivers/scrypt'

export const MIN_BITVEINS_PASSWORD_LENGTH = 14
export const MAX_BITVEINS_PASSWORD_LENGTH = 1024

const forbiddenPasswords = new Set([
  'changeme',
  'letmein',
  'password',
  'password123',
  'passwordpassword',
  'bitveins',
  'bitveins-password',
  'bitveins123',
])

const hasher = new Hash(new Scrypt({}))

export class InvalidBitveinsPasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBitveinsPasswordError'
  }
}

export function validateBitveinsPassword(password: string): void {
  if (password.length < MIN_BITVEINS_PASSWORD_LENGTH) {
    throw new InvalidBitveinsPasswordError(
      `The Bitveins password must contain at least ${MIN_BITVEINS_PASSWORD_LENGTH} characters.`,
    )
  }

  if (password.length > MAX_BITVEINS_PASSWORD_LENGTH) {
    throw new InvalidBitveinsPasswordError(
      `The Bitveins password must contain at most ${MAX_BITVEINS_PASSWORD_LENGTH} characters.`,
    )
  }

  if (!password.trim()) {
    throw new InvalidBitveinsPasswordError('The Bitveins password cannot contain only whitespace.')
  }

  if (/[\u0000-\u001F\u007F]/u.test(password)) {
    throw new InvalidBitveinsPasswordError('The Bitveins password cannot contain control characters.')
  }

  if (forbiddenPasswords.has(password.toLowerCase())) {
    throw new InvalidBitveinsPasswordError('Choose a less predictable Bitveins password.')
  }

  if (/^(.)\1+$/u.test(password)) {
    throw new InvalidBitveinsPasswordError('Choose a less repetitive Bitveins password.')
  }
}

export async function hashBitveinsPassword(password: string): Promise<string> {
  validateBitveinsPassword(password)
  return await hasher.make(password)
}

export async function verifyBitveinsPassword(hash: string, password: string): Promise<boolean> {
  return await hasher.verify(hash, password)
}

export function bitveinsPasswordNeedsRehash(hash: string): boolean {
  return hasher.needsReHash(hash)
}
