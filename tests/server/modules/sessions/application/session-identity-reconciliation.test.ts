import { describe, expect, it, vi } from 'vitest'
import { SessionService } from '../../../../../server/modules/sessions/application/session-service'
import type { PersistedSession, SessionRepository } from '../../../../../server/modules/sessions/ports/session-repository'
import type { DiscoveredTmuxSession, TmuxGateway } from '../../../../../server/modules/sessions/ports/tmux-gateway'

const OLD_ID = 'abcdefghijklmnop'
const NEXT_ID = 'qrstuvwxyzABCDEF'
const THIRD_ID = '0123456789_-ABCD'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

class MemoryRepository implements SessionRepository {
  failBoundSaveOnce = false
  failClearInvalidOnce = false
  failMarkInvalidOnce = false
  readonly invalidIds = new Set<string>()
  readonly rows = new Map<string, PersistedSession>()
  clearSessionIdInvalid(id: string): void {
    if (this.failClearInvalidOnce) {
      this.failClearInvalidOnce = false
      throw new Error('tombstone clear failed')
    }
    this.invalidIds.delete(id)
  }

  deletePath(name: string): void {
    const row = this.findByName(name)
    if (row) this.rows.delete(row.id)
  }

  findById(id: string): PersistedSession | null { return this.rows.get(id) ?? null }
  findByName(name: string): PersistedSession | null {
    return [...this.rows.values()].find(row => row.name === name) ?? null
  }

  findPath(name: string): string | null { return this.findByName(name)?.path ?? null }
  isSessionIdInvalid(id: string): boolean { return this.invalidIds.has(id) }
  list(): PersistedSession[] { return [...this.rows.values()] }
  markSessionIdInvalid(id: string): void {
    if (this.failMarkInvalidOnce) {
      this.failMarkInvalidOnce = false
      throw new Error('tombstone write failed')
    }
    this.invalidIds.add(id)
  }

  renamePath(currentName: string, nextName: string, path: string): void {
    const row = this.findByName(currentName)
    if (row) this.rows.set(row.id, { ...row, name: nextName, path })
  }

  saveIdentity(session: PersistedSession): void {
    if (session.tmuxBound && this.failBoundSaveOnce) {
      this.failBoundSaveOnce = false
      throw new Error('bound identity save failed')
    }
    const collision = this.findByName(session.name)
    if (collision && collision.id !== session.id) this.rows.delete(collision.id)
    this.rows.set(session.id, session)
  }

  savePath(name: string, path: string): void {
    const row = this.findByName(name)
    if (row) this.rows.set(row.id, { ...row, path })
  }
}

function setup(initial: DiscoveredTmuxSession[], ids = [NEXT_ID, THIRD_ID]) {
  const live = [...initial]
  const repository = new MemoryRepository()
  const setSessionId = vi.fn(async (name: string, id: string) => {
    const session = live.find(candidate => candidate.name === name)
    if (session) session.sessionId = id
  })
  const clearSessionId = vi.fn(async (name: string) => {
    const session = live.find(candidate => candidate.name === name)
    if (session) delete session.sessionId
  })
  const tmux = {
    captureWindowSnapshot: vi.fn(async () => ''),
    clearSessionId,
    applyClientAppearance: vi.fn(async () => {}),
    createSession: vi.fn(async (name: string, path: string) => { live.push({ name, path }) }),
    createWindow: vi.fn(),
    createWindowClientSession: vi.fn(),
    displaySessionPath: vi.fn(async () => null),
    findSessionNameByWindowId: vi.fn(async () => null),
    killAllBitveinsHelpers: vi.fn(),
    killBitveinsHelperSession: vi.fn(),
    killBitveinsHelpersForBase: vi.fn(),
    killSession: vi.fn(async (name: string) => { live.splice(live.findIndex(item => item.name === name), 1) }),
    killStaleBitveinsHelpers: vi.fn(),
    killWindow: vi.fn(),
    listAgents: vi.fn(async () => []),
    listSessions: vi.fn(async () => live),
    listWindows: vi.fn(async () => []),
    prepareTerminalWheel: vi.fn(async () => false),
    renameAgent: vi.fn(async () => {}),
    renameSession: vi.fn(async (name: string, next: string) => { live.find(item => item.name === name)!.name = next }),
    renameWindow: vi.fn(),
    resetTerminalScroll: vi.fn(),
    selectWindow: vi.fn(),
    setSessionId,
  } satisfies TmuxGateway
  let cursor = 0
  const service = new SessionService({
    clock: () => 200,
    createId: () => ids[cursor++]!,
    home: '/home/test',
    logger: { error: vi.fn() },
    pathInspector: { isDirectory: vi.fn(async () => true) },
    repository,
    sessionPathResolver: { normalize: path => path },
    tmux,
  })
  return { clearSessionId, live, repository, service, setSessionId, tmux }
}

describe('stable session identity reconciliation', () => {
  it('migrates a same-name row and writes its id to tmux', async () => {
    const context = setup([{ name: 'main', path: '/workspace' }])
    context.repository.rows.set(OLD_ID, { id: OLD_ID, name: 'main', path: '/old', createdAt: 100, tmuxBound: false })

    await expect(context.service.listSessions()).resolves.toEqual([
      { id: OLD_ID, name: 'main', path: '/workspace' },
    ])
    expect(context.setSessionId).toHaveBeenCalledWith('main', OLD_ID)
    expect(context.repository.findById(OLD_ID)?.createdAt).toBe(100)
  })

  it('keeps identity and creation time after an external tmux rename', async () => {
    const context = setup([{ name: 'renamed', path: '/workspace', sessionId: OLD_ID }])
    context.repository.rows.set(OLD_ID, { id: OLD_ID, name: 'main', path: '/workspace', createdAt: 100, tmuxBound: true })

    await expect(context.service.listSessions()).resolves.toEqual([
      { id: OLD_ID, name: 'renamed', path: '/workspace' },
    ])
    expect(context.repository.findById(OLD_ID)).toMatchObject({ name: 'renamed', createdAt: 100 })
  })

  it('repairs invalid and colliding tmux options with distinct ids', async () => {
    const context = setup([
      { name: 'first', path: '/one', sessionId: OLD_ID },
      { name: 'second', path: '/two', sessionId: OLD_ID },
      { name: 'third', path: '/three', sessionId: 'invalid' },
    ], [NEXT_ID, THIRD_ID, 'ZYXWVUTSRQPONMLK'])

    const sessions = await context.service.listSessions()
    expect(new Set(sessions.map(session => session.id)).size).toBe(3)
    expect(sessions.map(session => session.id)).toEqual([NEXT_ID, THIRD_ID, 'ZYXWVUTSRQPONMLK'])
    expect(context.setSessionId).toHaveBeenCalledTimes(3)
  })

  it('serializes concurrent reconciliation around one stable identity binding', async () => {
    const context = setup([{ name: 'main', path: '/workspace' }], [NEXT_ID, THIRD_ID])
    const binding = deferred()
    context.setSessionId.mockImplementationOnce(async (name, id) => {
      await binding.promise
      context.live.find(session => session.name === name)!.sessionId = id
    })

    const first = context.service.listSessions()
    await vi.waitFor(() => expect(context.setSessionId).toHaveBeenCalledWith('main', NEXT_ID))
    const second = context.service.listSessions()
    await Promise.resolve()

    expect(context.tmux.listSessions).toHaveBeenCalledTimes(1)
    expect(context.setSessionId).toHaveBeenCalledTimes(1)
    binding.resolve()

    await expect(Promise.all([first, second])).resolves.toEqual([
      [{ id: NEXT_ID, name: 'main', path: '/workspace' }],
      [{ id: NEXT_ID, name: 'main', path: '/workspace' }],
    ])
    expect(context.tmux.listSessions).toHaveBeenCalledTimes(2)
    expect(context.setSessionId).toHaveBeenCalledTimes(1)
    expect(context.repository.findById(NEXT_ID)).toMatchObject({ tmuxBound: true })
    expect(context.repository.findById(THIRD_ID)).toBeNull()
  })

  it('assigns a new identity when an app-killed name is recreated', async () => {
    const context = setup([{ name: 'main', path: '/workspace', sessionId: OLD_ID }], [NEXT_ID])
    context.repository.rows.set(OLD_ID, { id: OLD_ID, name: 'main', path: '/workspace', createdAt: 100, tmuxBound: true })

    await context.service.killSession('main')
    const recreated = await context.service.createSession('main', '/workspace')

    expect(recreated.id).toBe(NEXT_ID)
    expect(context.repository.findById(OLD_ID)).toBeNull()
  })

  it('does not mistake an externally recreated same-name session for first migration', async () => {
    const context = setup([{ name: 'main', path: '/workspace' }], [NEXT_ID])
    context.repository.rows.set(OLD_ID, {
      id: OLD_ID,
      name: 'main',
      path: '/workspace',
      createdAt: 100,
      tmuxBound: true,
    })

    await expect(context.service.listSessions()).resolves.toEqual([
      { id: NEXT_ID, name: 'main', path: '/workspace' },
    ])
    expect(context.repository.findById(OLD_ID)).toBeNull()
  })

  it('invalidates a failed migration binding before retrying the same name', async () => {
    const context = setup([{ name: 'main', path: '/workspace' }], [NEXT_ID])
    context.repository.rows.set(OLD_ID, {
      id: OLD_ID,
      name: 'main',
      path: '/workspace',
      createdAt: 100,
      tmuxBound: false,
    })
    context.setSessionId.mockRejectedValueOnce(new Error('set-option failed'))

    await expect(context.service.listSessions())
      .rejects.toThrow('Unable to establish a stable tmux session identity.')
    expect(context.repository.findById(OLD_ID)).toBeNull()

    await expect(context.service.listSessions()).resolves.toEqual([
      { id: NEXT_ID, name: 'main', path: '/workspace' },
    ])
    expect(context.repository.findById(OLD_ID)).toBeNull()
  })

  it('never readopts a tombstoned id left in tmux after binding and cleanup both fail', async () => {
    const context = setup([{ name: 'main', path: '/workspace' }], [NEXT_ID])
    context.repository.rows.set(OLD_ID, {
      id: OLD_ID,
      name: 'main',
      path: '/workspace',
      createdAt: 100,
      tmuxBound: false,
    })
    context.setSessionId.mockImplementationOnce(async (name, id) => {
      context.live.find(session => session.name === name)!.sessionId = id
      throw new Error('set-option response lost after applying')
    })
    context.clearSessionId.mockRejectedValueOnce(new Error('clear-option failed'))

    await expect(context.service.listSessions())
      .rejects.toThrow('Unable to establish a stable tmux session identity.')
    expect(context.repository.isSessionIdInvalid(OLD_ID)).toBe(true)
    expect(context.live[0]?.sessionId).toBe(OLD_ID)

    await expect(context.service.listSessions()).resolves.toEqual([
      { id: NEXT_ID, name: 'main', path: '/workspace' },
    ])
    expect(context.live[0]?.sessionId).toBe(NEXT_ID)
    expect(context.repository.findById(OLD_ID)).toBeNull()
  })

  it('does not touch tmux or later reuse an id when its pre-tombstone cannot be persisted', async () => {
    const context = setup([{ name: 'main', path: '/workspace' }], [NEXT_ID])
    context.repository.rows.set(OLD_ID, {
      id: OLD_ID,
      name: 'main',
      path: '/workspace',
      createdAt: 100,
      tmuxBound: false,
    })
    context.repository.failMarkInvalidOnce = true

    await expect(context.service.listSessions())
      .rejects.toThrow('Unable to reserve a stable tmux session identity.')
    expect(context.setSessionId).not.toHaveBeenCalled()
    expect(context.repository.findById(OLD_ID)).toBeNull()

    await expect(context.service.listSessions()).resolves.toEqual([
      { id: NEXT_ID, name: 'main', path: '/workspace' },
    ])
    expect(context.setSessionId).toHaveBeenCalledWith('main', NEXT_ID)
    expect(context.repository.findById(OLD_ID)).toBeNull()
  })

  it.each([
    ['bound identity save', (repository: MemoryRepository) => { repository.failBoundSaveOnce = true }],
    ['tombstone clear', (repository: MemoryRepository) => { repository.failClearInvalidOnce = true }],
  ])('keeps the id tombstoned when %s fails after tmux binding', async (_label, fail) => {
    const context = setup([{ name: 'main', path: '/workspace' }], [NEXT_ID])
    context.repository.rows.set(OLD_ID, {
      id: OLD_ID,
      name: 'main',
      path: '/workspace',
      createdAt: 100,
      tmuxBound: false,
    })
    fail(context.repository)

    await expect(context.service.listSessions())
      .rejects.toThrow('Unable to establish a stable tmux session identity.')
    expect(context.repository.isSessionIdInvalid(OLD_ID)).toBe(true)
    expect(context.repository.findById(OLD_ID)).toBeNull()

    await expect(context.service.listSessions()).resolves.toEqual([
      { id: NEXT_ID, name: 'main', path: '/workspace' },
    ])
  })
})
