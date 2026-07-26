import { isAbsolute, join, resolve } from 'node:path'
import { SessionError } from '../model/session-error'
import type { SessionPathResolver } from '../ports/session-path-resolver'

interface NodeSessionPathResolverOptions {
  cwd: string
  home: string
}

export class NodeSessionPathResolver implements SessionPathResolver {
  constructor(private readonly options: NodeSessionPathResolverOptions) {}

  normalize(path: string): string {
    const trimmed = path.trim()

    if (!trimmed || trimmed === '~') {
      return this.options.home
    }

    if (trimmed.startsWith('~/')) {
      return join(this.options.home, trimmed.slice(2))
    }

    if (trimmed.startsWith('~')) {
      throw new SessionError('Only ~ for the current user home directory is supported.')
    }

    return isAbsolute(trimmed) ? trimmed : resolve(this.options.cwd, trimmed)
  }
}
