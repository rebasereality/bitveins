import { describe, expect, it, vi } from 'vitest'
import { SessionService } from '../../../../../server/modules/sessions/application/session-service'
import type { PathInspector } from '../../../../../server/modules/sessions/ports/path-inspector'
import type { PersistedSession, SessionRepository } from '../../../../../server/modules/sessions/ports/session-repository'
import type { SessionPathResolver } from '../../../../../server/modules/sessions/ports/session-path-resolver'
import type { TmuxGateway } from '../../../../../server/modules/sessions/ports/tmux-gateway'

class MemorySessionRepository implements SessionRepository {
  readonly invalidIds = new Set<string>()
  readonly paths = new Map<string, string>()
  readonly ids = new Map<string, string>()
  failSave = false

  clearSessionIdInvalid(id: string): void {
    this.invalidIds.delete(id)
  }

  deletePath(name: string): void {
    this.paths.delete(name)
    this.ids.delete(name)
  }

  findById(id: string): PersistedSession | null {
    const name = [...this.ids].find(([, candidate]) => candidate === id)?.[0]
    return name ? this.findByName(name) : null
  }

  findByName(name: string): PersistedSession | null {
    const path = this.paths.get(name)
    if (!path) return null
    return { createdAt: 123, id: this.ids.get(name) ?? 'abcdefghijklmnop', name, path, tmuxBound: false }
  }

  findPath(name: string): string | null {
    return this.paths.get(name) ?? null
  }

  list(): PersistedSession[] {
    return [...this.paths.keys()].map(name => this.findByName(name)!)
  }

  isSessionIdInvalid(id: string): boolean {
    return this.invalidIds.has(id)
  }

  markSessionIdInvalid(id: string): void {
    this.invalidIds.add(id)
  }

  renamePath(currentName: string, nextName: string, path: string): void {
    const id = this.ids.get(currentName) ?? 'abcdefghijklmnop'
    this.paths.delete(currentName)
    this.ids.delete(currentName)
    this.paths.set(nextName, path)
    this.ids.set(nextName, id)
  }

  saveIdentity(session: PersistedSession): void {
    if (this.failSave) throw new Error('database unavailable')
    this.paths.set(session.name, session.path)
    this.ids.set(session.name, session.id)
  }

  savePath(name: string, path: string, _now: number, id?: string): void {
    if (this.failSave) throw new Error('database unavailable')
    this.paths.set(name, path)
    if (id) this.ids.set(name, id)
  }
}

function createTmux(overrides: Partial<TmuxGateway> = {}): TmuxGateway {
  return {
    capturePaneViewport: vi.fn(async () => ({
      cursorVisible: true,
      cursorX: 0,
      cursorY: 0,
      data: '',
      inMode: false,
      scrollPosition: 0,
    })),
    captureWindowSnapshot: vi.fn(async () => ''),
    clearSessionId: vi.fn(async () => {}),
    applyClientAppearance: vi.fn(async () => {}),
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
    findSessionNameByWindowId: vi.fn(async () => null),
    killAllBitveinsHelpers: vi.fn(async () => {}),
    killSession: vi.fn(async () => {}),
    killBitveinsHelperSession: vi.fn(async () => {}),
    killBitveinsHelpersForBase: vi.fn(async () => {}),
    killPane: vi.fn(async () => []),
    killStaleBitveinsHelpers: vi.fn(async () => {}),
    killWindow: vi.fn(async () => {}),
    listAgents: vi.fn(async () => []),
    listSessions: vi.fn(async () => []),
    listPanes: vi.fn(async () => []),
    listWindows: vi.fn(async () => []),
    prepareTerminalWheel: vi.fn(async () => false),
    renameAgent: vi.fn(async () => {}),
    renameSession: vi.fn(async () => {}),
    renameWindow: vi.fn(async () => null),
    resetTerminalScroll: vi.fn(async () => {}),
    resizePane: vi.fn(async () => []),
    selectPane: vi.fn(async () => {}),
    selectWindow: vi.fn(async () => {}),
    sendPaneInput: vi.fn(async () => {}),
    sendPaneInputBinary: vi.fn(async () => {}),
    setSessionId: vi.fn(async () => {}),
    splitWindow: vi.fn(async () => []),
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
  const generatedIds = ['abcdefghijklmnop', 'qrstuvwxyzABCDEF', '0123456789_-ABCD']
  let generatedIdIndex = 0
  const service = new SessionService({
    clock: () => 123,
    createId: () => generatedIds[generatedIdIndex++]!,
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
    const originalSave = context.repository.saveIdentity.bind(context.repository)
    context.repository.saveIdentity = (session) => {
      order.push('repository')
      originalSave(session)
    }

    await expect(context.service.createSession('main', '~')).resolves.toMatchObject({
      name: 'main',
      path: '/home/test',
    })
    expect(order).toEqual(['tmux', 'repository', 'repository'])
    expect(context.repository.findPath('main')).toBe('/home/test')
    expect(context.repository.isSessionIdInvalid('abcdefghijklmnop')).toBe(false)
  })

  it('never returns a created tmux session with an unpersisted identity', async () => {
    const context = setup()
    context.repository.failSave = true

    await expect(context.service.createSession('main', '/workspace'))
      .rejects.toThrow('Unable to establish a stable tmux session identity.')
    expect(context.tmux.createSession).toHaveBeenCalledOnce()
    expect(context.tmux.clearSessionId).toHaveBeenCalledWith('main')
    expect(context.tmux.killSession).toHaveBeenCalledWith('main')
    expect(context.repository.isSessionIdInvalid('abcdefghijklmnop')).toBe(true)
  })

  it('kills a created session without touching its tmux option when identity reservation fails', async () => {
    const context = setup()
    context.repository.markSessionIdInvalid = vi.fn(() => {
      throw new Error('database unavailable')
    })

    await expect(context.service.createSession('main', '/workspace'))
      .rejects.toThrow('Unable to reserve a stable tmux session identity.')
    expect(context.tmux.setSessionId).not.toHaveBeenCalled()
    expect(context.tmux.clearSessionId).not.toHaveBeenCalled()
    expect(context.tmux.killSession).toHaveBeenCalledWith('main')
    expect(context.repository.findByName('main')).toBeNull()
  })

  it('removes the row and created tmux session when set-option fails', async () => {
    const tmux = createTmux({
      setSessionId: vi.fn(async () => { throw new Error('set-option failed') }),
    })
    const context = setup(tmux)

    await expect(context.service.createSession('main', '/workspace'))
      .rejects.toThrow('Unable to establish a stable tmux session identity.')
    expect(context.repository.findByName('main')).toBeNull()
    expect(tmux.clearSessionId).toHaveBeenCalledWith('main')
    expect(tmux.killSession).toHaveBeenCalledWith('main')
    expect(context.repository.isSessionIdInvalid('abcdefghijklmnop')).toBe(true)
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
      .resolves.toMatchObject({
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

    await expect(context.service.openTransferSession('Docs', '~')).resolves.toMatchObject({
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

    await expect(context.service.openTransferSession('Docs', '/workspace/docs')).resolves.toMatchObject({
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

    await expect(context.service.openTransferSession('Docs', '/workspace/docs')).resolves.toMatchObject({
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

    await expect(context.service.openTransferSession('Docs', '/workspace/docs')).resolves.toMatchObject({
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
        name: 'main',
        path: '/workspace',
      }]),
      renameSession: vi.fn(async () => {
        order.push('tmux')
      }),
    })
    const context = setup(tmux)
    context.repository.paths.set('main', '/workspace')
    const originalRename = context.repository.renamePath.bind(context.repository)
    context.repository.renamePath = (current, next, path) => {
      order.push('repository')
      originalRename(current, next, path)
    }

    await expect(context.service.renameSession('main', 'next')).resolves.toMatchObject({
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
      listSessions: vi.fn(async () => [{ name: 'main', path: '/from/tmux' }]),
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
    const context = setup(createTmux({
      listSessions: vi.fn(async () => [{ name: 'main', path: '~' }]),
    }))

    await expect(context.service.renameSession('main', ' main ')).resolves.toMatchObject({
      name: 'main',
      path: '~',
    })
    expect(context.tmux.renameSession).not.toHaveBeenCalled()
  })

  it('returns a stable fallback when tmux does not list the renamed session', async () => {
    const context = setup(createTmux({
      listSessions: vi.fn(async () => [{ name: 'main', path: '/workspace' }]),
    }))
    context.repository.paths.set('main', '/workspace')

    await expect(context.service.renameSession('main', 'next')).resolves.toMatchObject({
      name: 'next',
      path: '/workspace',
    })
  })

  it('maps discovered agents to stable session ids and persists their labels', async () => {
    let customLabel: string | undefined
    const agent = () => ({
      ...(customLabel ? { customLabel } : {}),
      defaultLabel: 'Codex',
      id: '%9',
      kind: 'codex' as const,
      label: customLabel ?? 'Codex',
      paneId: '%9',
      paneIndex: 0,
      path: '/workspace',
      sessionName: 'main',
      status: 'idle' as const,
      windowId: '@7',
      windowIndex: 1,
      windowName: 'work',
    })
    const tmux = createTmux({
      listAgents: vi.fn(async () => [agent()]),
      listSessions: vi.fn(async () => [{
        name: 'main',
        path: '/workspace',
        sessionId: 'abcdefghijklmnop',
      }]),
      renameAgent: vi.fn(async (_paneId, label) => { customLabel = label ?? undefined }),
    })
    const context = setup(tmux)

    await expect(context.service.listAgents()).resolves.toEqual([
      expect.objectContaining({ paneId: '%9', sessionId: 'abcdefghijklmnop' }),
    ])
    await expect(context.service.renameAgent('%9', 'Reviewer')).resolves.toEqual(
      expect.objectContaining({ label: 'Reviewer', sessionId: 'abcdefghijklmnop' }),
    )
    expect(tmux.renameAgent).toHaveBeenCalledWith('%9', 'Reviewer')
  })

  it('filters agents from unknown sessions and rejects stale rename targets', async () => {
    const agent = {
      defaultLabel: 'Codex',
      id: '%9',
      kind: 'codex' as const,
      label: 'Codex',
      paneId: '%9',
      paneIndex: 0,
      path: '/workspace',
      sessionName: 'unknown',
      status: 'idle' as const,
      windowId: '@7',
      windowIndex: 1,
      windowName: 'work',
    }
    const context = setup(createTmux({
      listAgents: vi.fn(async () => [agent]),
      listSessions: vi.fn(async () => [{
        name: 'main',
        path: '/workspace',
        sessionId: 'abcdefghijklmnop',
      }]),
    }))

    await expect(context.service.listAgents()).resolves.toEqual([])
    await expect(context.service.renameAgent('%9', 'Reviewer'))
      .rejects.toThrow('Tmux agent is no longer available.')
    expect(context.tmux.renameAgent).not.toHaveBeenCalled()
  })

  it('rejects an agent that disappears while its label is being changed', async () => {
    const agent = {
      defaultLabel: 'Codex',
      id: '%9',
      kind: 'codex' as const,
      label: 'Codex',
      paneId: '%9',
      paneIndex: 0,
      path: '/workspace',
      sessionName: 'main',
      status: 'idle' as const,
      windowId: '@7',
      windowIndex: 1,
      windowName: 'work',
    }
    let calls = 0
    const context = setup(createTmux({
      listAgents: vi.fn(async () => calls++ === 0 ? [agent] : []),
      listSessions: vi.fn(async () => [{
        name: 'main',
        path: '/workspace',
        sessionId: 'abcdefghijklmnop',
      }]),
    }))

    await expect(context.service.renameAgent('%9', 'Reviewer'))
      .rejects.toThrow('Tmux agent is no longer available.')
    expect(context.tmux.renameAgent).toHaveBeenCalledWith('%9', 'Reviewer')
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

  it('delegates window, pane, snapshot, input, and helper operations through its gateway', async () => {
    const context = setup()
    const activeHelpers = new Set(['_bitveins_active'])

    await context.service.listSessions()
    await context.service.findSessionNameByWindowId('@1')
    await context.service.listWindows('main')
    await context.service.selectWindow('main', 2)
    await context.service.killWindow('main', 2)
    await context.service.renameWindow('main', 2, 'logs')
    await context.service.createWindowClientSession('main', 2)
    await context.service.captureWindowSnapshot('main', 2, 50)
    await context.service.captureWindowSnapshot('main', 2, 50, '%7')
    await context.service.listPanes('main', 2)
    await context.service.splitWindow('main', 2, '%7', 'horizontal')
    await context.service.killPane('main', 2, '%8')
    await context.service.selectPane('main', 2, '%7')
    await context.service.resizePane('main', 2, '%7', 'height', 20)
    await context.service.sendPaneInput('%7', 'text')
    await context.service.sendPaneInputBinary('%7', 'binary')
    await context.service.capturePaneViewport('%7')
    await context.service.prepareTerminalWheel('%7', 'up', 1)
    await context.service.prepareTerminalWheel('main', 'down')
    await context.service.resetTerminalScroll('%7')
    await context.service.resetTerminalScroll('main')
    await context.service.killBitveinsHelperSession('_bitveins_helper')
    await context.service.killStaleBitveinsHelpers(activeHelpers, 'owner')
    await context.service.killAllBitveinsHelpers()

    expect(context.tmux.listWindows).toHaveBeenCalledWith('main')
    expect(context.tmux.listPanes).toHaveBeenCalledWith('main', 2)
    expect(context.tmux.splitWindow).toHaveBeenCalledWith('main', 2, '%7', 'horizontal')
    expect(context.tmux.killPane).toHaveBeenCalledWith('main', 2, '%8')
    expect(context.tmux.selectPane).toHaveBeenCalledWith('main', 2, '%7')
    expect(context.tmux.resizePane).toHaveBeenCalledWith('main', 2, '%7', 'height', 20)
    expect(context.tmux.renameWindow).toHaveBeenCalledWith('main', 2, 'logs')
    expect(context.tmux.captureWindowSnapshot).toHaveBeenCalledWith('main', 2, 50)
    expect(context.tmux.captureWindowSnapshot).toHaveBeenCalledWith('main', 2, 50, '%7')
    expect(context.tmux.prepareTerminalWheel).toHaveBeenCalledWith('%7', 'up', 1)
    expect(context.tmux.prepareTerminalWheel).toHaveBeenCalledWith('main', 'down', undefined)
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
