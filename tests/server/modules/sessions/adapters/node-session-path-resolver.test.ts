import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NodeSessionPathResolver } from '../../../../../server/modules/sessions/adapters/node-session-path-resolver'

const pathResolver = new NodeSessionPathResolver({
  cwd: process.cwd(),
  home: process.env.HOME || process.cwd(),
})

describe('NodeSessionPathResolver', () => {
  it('resolves empty paths and home shorthand to HOME', () => {
    const home = process.env.HOME || process.cwd()

    expect(pathResolver.normalize('')).toBe(home)
    expect(pathResolver.normalize('~')).toBe(home)
  })

  it('expands ~/ paths', () => {
    const home = process.env.HOME || process.cwd()

    expect(pathResolver.normalize('~/code')).toBe(join(home, 'code'))
  })

  it('preserves absolute paths', () => {
    expect(pathResolver.normalize('/tmp')).toBe('/tmp')
  })

  it('resolves relative paths against the server cwd', () => {
    expect(pathResolver.normalize('relative')).toBe(resolve(process.cwd(), 'relative'))
  })

  it('rejects unsupported user-home shorthand', () => {
    expect(() => pathResolver.normalize('~someone')).toThrow(
      'Only ~ for the current user home directory is supported.',
    )
  })
})
