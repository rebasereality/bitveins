import { describe, expect, it, vi } from 'vitest'
import { SessionService } from '../../../../../server/modules/sessions/application/session-service'
import type { PathInspector } from '../../../../../server/modules/sessions/ports/path-inspector'
import type { SessionRepository } from '../../../../../server/modules/sessions/ports/session-repository'
import type { SessionPathResolver } from '../../../../../server/modules/sessions/ports/session-path-resolver'
import type { TmuxGateway } from '../../../../../server/modules/sessions/ports/tmux-gateway'

class MemorySessionRepository implements SessionRepository {
  readonly paths = new Map<string, string>()
  failSave = false

  deletePath(name: string): void {
    this.paths.delete(name)
  }

  findPath(name: string): string | null {
    return this.paths.get(name) ?? null
  }

  renamePath(currentName: string, nextName: string, path: string, _now: number): void {
    this.paths.delete(currentName)
    this.paths.set(nextName, path)
  }

  savePath(name: string, path: string, _now: number): void {
    if (this.failSave) throw new Error('database unavailable')
    this.paths.set(name, path)
  }
}

function createTmux(overrides: Partial<TmuxGateway> = {}): TmuxGateway {
  return {
    captureWindowSnapshot: vi.fn(async () => ''),
    createSession: vi.fn(async () => {}),
    createWindow: vi.fn(async () => ({
      active: true,
      id: '@1',
      index: 1,
      name: 'shell',
      path: '/workspace',
    })),
    createWindowClientSession: vi.fn(async () => ({
      helperSessionName: '_bitveins_test',
      sessionName: 'main',
      windowIndex: 1,
    })),
    displaySessionPath: vi.fn(async () => null),
    killAllBitveinsHelpers: vi.fn(async () => {}),
    killSession: vi.fn(async () => {}),
    killBitveinsHelperSession: vi.fn(async () => {}),
    killBitveinsHelpersForBase: vi.fn(async () => {}),
    killStaleBitveinsHelpers: vi.fn(async () => {}),
    killWindow: vi.fn(async () => {}),
    listSessions: vi.fn(async () => []),
    listWindows: vi.fn(async () => []),
    renameSession: vi.fn(async () => {}),
    renameWindow: vi.fn(async () => null),
    selectWindow: vi.fn(async () => {}),
    ...overrides,
  }
}

function setup(tmux = createTmux()) {
  const repository = new MemorySessionRepository()
  const errors: Array<{ error: unknown, message: string }> = []
  const pathInspector: PathInspector = {
    isDirectory: vi.fn(async () => true),
  }
  const sessionPathResolver: SessionPathResolver = {
    normalize: path => path === '~' ? '/home/test' : path,
  }
  const service = new SessionService({
    clock: () => 123,
    home: '/home/test',
    logger: {
      error(message, error) {
        errors.push({ error, message })
      },
    },
    pathInspector,
    repository,
    sessionPathResolver,
    tmux,
  })
  return {
    errors,
    pathInspector,
    repository,
    service,
    sessionPathResolver,
    tmux,
  }
}

describe('SessionService', () => {
  it('creates tmux before persisting its normalized path', async () => {
    const order: string[] = []
    const tmux = createTmux({
      createSession: vi.fn(async () => {
        order.push('tmux')
      }),
    })
    const context = setup(tmux)
    const originalSave = context.repository.savePath.bind(context.repository)
    context.repository.savePath = (name, path, now) => {
      order.push('repository')
      originalSave(name, path, now)
    }

    await expect(context.service.createSession('main', '~')).resolves.toEqual({
      name: 'main',
      path: '/home/test',
    })
    expect(order).toEqual(['tmux', 'repository'])
    expect(context.repository.findPath('main')).toBe('/home/test')
  })

  it('keeps a created tmux session when persistence is unavailable', async () => {
    const context = setup()
    context.repository.failSave = true

    await expect(context.service.createSession('main', '/workspace')).resolves.toEqual({
      name: 'main',
      path: '/workspace',
    })
    expect(context.tmux.createSession).toHaveBeenCalledOnce()
    expect(context.tmux.killSession).not.toHaveBeenCalled()
    expect(context.errors[0]?.message).toBe('Failed to save session path.')
  })

  it('rejects a target that is not a directory before calling tmux', async () => {
    const context = setup()
    vi.mocked(context.pathInspector.isDirectory).mockResolvedValue(false)

    await expect(context.service.createSession('main', '/missing'))
      .rejects.toThrow('Target path must be a directory.')
    expect(context.tmux.createSession).not.toHaveBeenCalled()
  })

  it('creates a slugged Transfer session in its normalized directory', async () => {
    const context = setup()

    await expect(context.service.openTransferSession('Dépôt Documentation', '~'))
      .resolves.toEqual({
        created: true,
        session: {
          name: 'depot-documentation',
          path: '/home/test',
        },
      })
    expect(context.tmux.createSession).toHaveBeenCalledWith('depot-documentation', '/home/test')
  })

  it('reuses a Transfer session with the same normalized directory', async () => {
    const tmux = createTmux({
      listSessions: vi.fn(async () => [{
        name: 'docs',
        path: '/home/test',
      }]),
    })
    const context = setup(tmux)

    await expect(context.service.openTransferSession('Docs', '~')).resolves.toEqual({
      created: false,
      session: {
        name: 'docs',
        path: '/home/test',
      },
    })
    expect(context.tmux.createSession).not.toHaveBeenCalled()
  })

  it('uses and reuses suffixes when a Transfer name belongs to another directory', async () => {
    const tmux = createTmux({
      listSessions: vi.fn(async () => [
        { name: 'docs', path: '/workspace/other' },
        { name: 'docs-2', path: '/workspace/docs' },
      ]),
    })
    const context = setup(tmux)

    await expect(context.service.openTransferSession('Docs', '/workspace/docs')).resolves.toEqual({
      created: false,
      session: {
        name: 'docs-2',
        path: '/workspace/docs',
      },
    })
    expect(context.tmux.createSession).not.toHaveBeenCalled()
  })

  it('creates the first free suffix for a Transfer name collision', async () => {
    const tmux = createTmux({
      listSessions: vi.fn(async () => [{
        name: 'docs',
        path: '/workspace/other',
      }]),
    })
    const context = setup(tmux)

    await expect(context.service.openTransferSession('Docs', '/workspace/docs')).resolves.toEqual({
      created: true,
      session: {
        name: 'docs-2',
        path: '/workspace/docs',
      },
    })
    expect(context.tmux.createSession).toHaveBeenCalledWith('docs-2', '/workspace/docs')
  })

  it('recovers when another request creates the same Transfer session first', async () => {
    const listSessions = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        name: 'docs',
        path: '/workspace/docs',
      }])
    const tmux = createTmux({
      createSession: vi.fn(async () => {
        throw new Error('duplicate session')
      }),
      listSessions,
    })
    const context = setup(tmux)

    await expect(context.service.openTransferSession('Docs', '/workspace/docs')).resolves.toEqual({
      created: false,
      session: {
        name: 'docs',
        path: '/workspace/docs',
      },
    })
    expect(listSessions).toHaveBeenCalledTimes(2)
  })

  it('rejects an invalid Transfer directory before listing sessions', async () => {
    const context = setup()
    vi.mocked(context.pathInspector.isDirectory).mockResolvedValue(false)

    await expect(context.service.openTransferSession('Docs', '/missing'))
      .rejects.toThrow('Target path must be a directory.')
    expect(context.tmux.listSessions).not.toHaveBeenCalled()
  })

  it('renames helpers, tmux, and repository in a defined order', async () => {
    const order: string[] = []
    const tmux = createTmux({
      killBitveinsHelpersForBase: vi.fn(async () => {
        order.push('helpers')
      }),
      listSessions: vi.fn(async () => [{
        name: 'next',
        path: '/workspace',
      }]),
      renameSession: vi.fn(async () => {
        order.push('tmux')
      }),
    })
    const context = setup(tmux)
    context.repository.paths.set('main', '/workspace')
    const originalRename = context.repository.renamePath.bind(context.repository)
    context.repository.renamePath = (current, next, path, now) => {
      order.push('repository')
      originalRename(current, next, path, now)
    }

    await expect(context.service.renameSession('main', 'next')).resolves.toEqual({
      name: 'next',
      path: '/workspace',
    })
    expect(order).toEqual(['helpers', 'tmux', 'repository'])
    expect(context.repository.findPath('main')).toBeNull()
    expect(context.repository.findPath('next')).toBe('/workspace')
  })

  it('falls back to tmux and caches a missing session path', async () => {
    const tmux = createTmux({
      displaySessionPath: vi.fn(async () => '/from/tmux'),
    })
    const context = setup(tmux)

    await expect(context.service.getSessionPath('main')).resolves.toBe('/from/tmux')
    expect(context.repository.findPath('main')).toBe('/from/tmux')
  })

  it('uses the persisted path when creating a window', async () => {
    const context = setup()
    context.repository.paths.set('main', '/workspace')

    await context.service.createWindow('main')

    expect(context.tmux.createWindow).toHaveBeenCalledWith('main', '/workspace')
    expect(context.tmux.displaySessionPath).not.toHaveBeenCalled()
  })

  it('removes helpers before killing a session and then forgets its path', async () => {
    const order: string[] = []
    const tmux = createTmux({
      killSession: vi.fn(async () => {
        order.push('session')
      }),
      killBitveinsHelpersForBase: vi.fn(async () => {
        order.push('helpers')
      }),
    })
    const context = setup(tmux)
    context.repository.paths.set('main', '/workspace')
    const originalDelete = context.repository.deletePath.bind(context.repository)
    context.repository.deletePath = (name) => {
      order.push('repository')
      originalDelete(name)
    }

    await context.service.killSession('main')

    expect(order).toEqual(['helpers', 'session', 'repository'])
    expect(context.repository.findPath('main')).toBeNull()
  })

  it('treats an unchanged rename as a no-op', async () => {
    const context = setup()

    await expect(context.service.renameSession('main', ' main ')).resolves.toEqual({
      name: 'main',
      path: '~',
    })
    expect(context.tmux.renameSession).not.toHaveBeenCalled()
  })

  it('returns a stable fallback when tmux does not list the renamed session', async () => {
    const context = setup()
    context.repository.paths.set('main', '/workspace')

    await expect(context.service.renameSession('main', 'next')).resolves.toEqual({
      name: 'next',
      path: '~',
    })
  })

  it('falls back to HOME and reports both lookup failures', async () => {
    const tmux = createTmux({
      displaySessionPath: vi.fn(async () => {
        throw new Error('tmux unavailable')
      }),
    })
    const context = setup(tmux)
    context.repository.findPath = () => {
      throw new Error('database unavailable')
    }

    await expect(context.service.getSessionPath('main')).resolves.toBe('/home/test')
    expect(context.errors.map(error => error.message)).toEqual([
      'Database query failed for session path.',
      'Tmux display-message query failed for session path.',
    ])
  })

  it('delegates window, snapshot, and helper operations through its gateway', async () => {
    const context = setup()
    const activeHelpers = new Set(['_bitveins_active'])

    await context.service.listSessions()
    await context.service.listWindows('main')
    await context.service.selectWindow('main', 2)
    await context.service.killWindow('main', 2)
    await context.service.renameWindow('main', 2, 'logs')
    await context.service.createWindowClientSession('main', 2)
    await context.service.captureWindowSnapshot('main', 2, 50)
    await context.service.killBitveinsHelperSession('_bitveins_helper')
    await context.service.killStaleBitveinsHelpers(activeHelpers, 'owner')
    await context.service.killAllBitveinsHelpers()

    expect(context.tmux.listWindows).toHaveBeenCalledWith('main')
    expect(context.tmux.renameWindow).toHaveBeenCalledWith('main', 2, 'logs')
    expect(context.tmux.captureWindowSnapshot).toHaveBeenCalledWith('main', 2, 50)
    expect(context.tmux.killStaleBitveinsHelpers).toHaveBeenCalledWith(activeHelpers, 'owner')
  })

  it('uses the system clock when no clock is injected', async () => {
    const context = setup()
    const service = new SessionService({
      home: '/home/test',
      logger: {
        error: vi.fn(),
      },
      pathInspector: context.pathInspector,
      repository: context.repository,
      sessionPathResolver: context.sessionPathResolver,
      tmux: context.tmux,
    })

    await service.createSession('main', '/workspace')

    expect(context.repository.findPath('main')).toBe('/workspace')
  })
})
