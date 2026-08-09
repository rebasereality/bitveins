import type { TmuxSession, TmuxWindow } from '#shared/contracts/terminal'
import { SessionError } from '../model/session-error'
import { createSessionId, normalizeSessionId } from '../model/session-identity'
import { normalizeSessionName, normalizeTerminalTargetName } from '../model/session-validation'
import { transferSessionBaseName, transferSessionCandidate } from '../model/transfer-session-name'
import type { PathInspector } from '../ports/path-inspector'
import type { PersistedSession, SessionRepository } from '../ports/session-repository'
import type { SessionPathResolver } from '../ports/session-path-resolver'
import type { TmuxGateway, WindowClientSession } from '../ports/tmux-gateway'

interface ApplicationLogger { error(message: string, error: unknown): void }

interface SessionServiceOptions {
  clock?: () => number
  createId?: () => string
  home: string
  logger: ApplicationLogger
  pathInspector: PathInspector
  repository: SessionRepository
  sessionPathResolver: SessionPathResolver
  tmux: TmuxGateway
}

export class SessionService {
  private readonly clock: () => number
  private readonly createId: () => string
  private identityQueue: Promise<void> = Promise.resolve()

  constructor(private readonly options: SessionServiceOptions) {
    this.clock = options.clock ?? Date.now
    this.createId = options.createId ?? createSessionId
  }

  async listSessions(): Promise<TmuxSession[]> {
    return this.withIdentityLock(() => this.reconcileSessions())
  }

  private async reconcileSessions(): Promise<TmuxSession[]> {
    const discovered = await this.options.tmux.listSessions()
    const optionCounts = new Map<string, number>()
    for (const session of discovered) {
      const id = normalizeSessionId(session.sessionId)
      if (id) optionCounts.set(id, (optionCounts.get(id) ?? 0) + 1)
    }

    const stored = this.options.repository.list()
    const byId = new Map(stored.map(session => [session.id, session]))
    const byName = new Map(stored.map(session => [session.name, session]))
    const matched = new Set<string>()
    const reservedIds = new Set(stored.map(session => session.id))
    for (const session of discovered) {
      const id = normalizeSessionId(session.sessionId)
      if (id) reservedIds.add(id)
    }
    const sessions: TmuxSession[] = []

    for (const live of discovered) {
      const optionId = normalizeSessionId(live.sessionId)
      const uniqueOptionId = optionId
        && optionCounts.get(optionId) === 1
        && !this.options.repository.isSessionIdInvalid(optionId)
        ? optionId
        : null
      const optionRecord = uniqueOptionId ? byId.get(uniqueOptionId) : undefined
      const nameRecord = byName.get(live.name)
      const existing = optionRecord
        ?? (nameRecord
          && !nameRecord.tmuxBound
          && !matched.has(nameRecord.id)
          && !this.options.repository.isSessionIdInvalid(nameRecord.id)
          && optionId !== nameRecord.id
          ? nameRecord
          : undefined)
      const identity: PersistedSession = {
        id: uniqueOptionId ?? existing?.id ?? this.allocateSessionId(reservedIds),
        name: live.name,
        path: live.path,
        createdAt: existing?.createdAt ?? this.clock(),
        tmuxBound: Boolean(uniqueOptionId),
      }
      reservedIds.add(identity.id)

      matched.add(identity.id)
      if (uniqueOptionId) {
        this.options.repository.saveIdentity(identity)
      }
      else {
        await this.bindSessionIdentity(live.name, identity)
      }
      sessions.push({ id: identity.id, name: live.name, path: live.path })
    }

    const liveNames = new Set(discovered.map(session => session.name))
    for (const session of stored) {
      if (!matched.has(session.id) && !liveNames.has(session.name)) this.options.repository.deletePath(session.name)
    }
    return sessions.sort((left, right) => left.name.localeCompare(right.name))
  }

  async findSessionNameByWindowId(windowId: string): Promise<string | null> {
    return this.options.tmux.findSessionNameByWindowId(windowId)
  }

  async findSessionIdByName(name: string): Promise<string | null> {
    const normalized = normalizeSessionName(name)
    const live = (await this.listSessions()).find(session => session.name === normalized)
    return live?.id ?? null
  }

  async createSession(name: string, path: string): Promise<TmuxSession> {
    const sessionName = normalizeSessionName(name)
    const cwd = this.normalizePath(path)
    if (!await this.options.pathInspector.isDirectory(cwd)) throw new SessionError('Target path must be a directory.')

    return this.withIdentityLock(async () => {
      const id = this.allocateSessionId(new Set(this.options.repository.list().map(session => session.id)))
      await this.options.tmux.createSession(sessionName, cwd)
      const identity = { id, name: sessionName, path: cwd, createdAt: this.clock(), tmuxBound: false }
      await this.bindSessionIdentity(sessionName, identity, true)
      return { id, name: sessionName, path: cwd }
    })
  }

  async openTransferSession(name: string, path: string): Promise<{ created: boolean, session: TmuxSession }> {
    const cwd = this.normalizePath(path)
    if (!await this.options.pathInspector.isDirectory(cwd)) throw new SessionError('Target path must be a directory.')
    const baseName = transferSessionBaseName(name, cwd)
    let sessions = await this.listSessions()

    for (let ordinal = 1; ordinal <= 100; ordinal += 1) {
      const candidate = transferSessionCandidate(baseName, ordinal)
      const existing = sessions.find(session => session.name === candidate)
      if (existing) {
        if (this.normalizePath(existing.path) === cwd) return { created: false, session: { ...existing, path: cwd } }
        continue
      }
      try {
        return { created: true, session: await this.createSession(candidate, cwd) }
      }
      catch (error) {
        sessions = await this.listSessions()
        const raced = sessions.find(session => session.name === candidate)
        if (!raced) throw error
        if (this.normalizePath(raced.path) === cwd) return { created: false, session: { ...raced, path: cwd } }
      }
    }
    throw new SessionError('Unable to find an available tmux session name for this Transfer.')
  }

  async killSession(name: string): Promise<void> {
    const sessionName = normalizeSessionName(name)
    await this.options.tmux.killBitveinsHelpersForBase(sessionName)
    await this.options.tmux.killSession(sessionName)
    this.options.repository.deletePath(sessionName)
  }

  async renameSession(name: string, nextName: string): Promise<TmuxSession> {
    const sessionName = normalizeSessionName(name)
    const newSessionName = normalizeSessionName(nextName)
    const current = (await this.listSessions()).find(session => session.name === sessionName)
    if (!current) throw new SessionError('Tmux session is no longer available.')
    if (sessionName === newSessionName) return current

    const currentPath = await this.getSessionPath(sessionName)
    await this.options.tmux.killBitveinsHelpersForBase(sessionName)
    await this.options.tmux.renameSession(sessionName, newSessionName)
    this.options.repository.renamePath(sessionName, newSessionName, currentPath)
    return { id: current.id, name: newSessionName, path: currentPath }
  }

  listWindows(name: string): Promise<TmuxWindow[]> { return this.options.tmux.listWindows(normalizeSessionName(name)) }
  selectWindow(name: string, index: unknown): Promise<void> { return this.options.tmux.selectWindow(normalizeSessionName(name), index) }
  async createWindow(name: string): Promise<TmuxWindow> {
    const sessionName = normalizeSessionName(name)
    return this.options.tmux.createWindow(sessionName, await this.getSessionPath(sessionName))
  }

  killWindow(name: string, index: unknown): Promise<void> { return this.options.tmux.killWindow(normalizeSessionName(name), index) }
  renameWindow(name: string, index: unknown, nextName: string): Promise<TmuxWindow | null> {
    return this.options.tmux.renameWindow(normalizeSessionName(name), index, nextName)
  }

  createWindowClientSession(name: string, index: unknown): Promise<WindowClientSession> {
    return this.options.tmux.createWindowClientSession(normalizeSessionName(name), index)
  }

  captureWindowSnapshot(name: string, index: unknown, lines?: number): Promise<string> {
    return this.options.tmux.captureWindowSnapshot(normalizeSessionName(name), index, lines)
  }

  async prepareTerminalWheel(name: string, direction: 'down' | 'up', lineCount?: 1): Promise<boolean> {
    return this.options.tmux.prepareTerminalWheel(
      normalizeTerminalTargetName(name),
      direction,
      lineCount,
    )
  }

  async resetTerminalScroll(name: string): Promise<void> {
    await this.options.tmux.resetTerminalScroll(normalizeTerminalTargetName(name))
  }

  killBitveinsHelperSession(name: string): Promise<void> { return this.options.tmux.killBitveinsHelperSession(name) }
  killStaleBitveinsHelpers(active?: ReadonlySet<string>, owner?: string): Promise<void> {
    return this.options.tmux.killStaleBitveinsHelpers(active, owner)
  }

  killAllBitveinsHelpers(): Promise<void> { return this.options.tmux.killAllBitveinsHelpers() }

  async getSessionPath(name: string): Promise<string> {
    const sessionName = normalizeSessionName(name)
    try {
      const storedPath = this.options.repository.findPath(sessionName)
      if (storedPath) return storedPath
    }
    catch (error) {
      this.options.logger.error('Database query failed for session path.', error)
    }
    try {
      const tmuxPath = await this.options.tmux.displaySessionPath(sessionName)
      if (tmuxPath) {
        const id = await this.findSessionIdByName(sessionName)
        if (id) this.options.repository.savePath(sessionName, tmuxPath, this.clock(), id)
        return tmuxPath
      }
    }
    catch (error) {
      this.options.logger.error('Tmux display-message query failed for session path.', error)
    }
    return this.options.home
  }

  normalizePath(path: string): string { return this.options.sessionPathResolver.normalize(path) }

  private async withIdentityLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.identityQueue
    let release!: () => void
    this.identityQueue = new Promise((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    }
    finally {
      release()
    }
  }

  private allocateSessionId(reservedIds: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const id = normalizeSessionId(this.createId())
      if (id && !reservedIds.has(id) && !this.options.repository.isSessionIdInvalid(id)) return id
    }
    throw new SessionError('Unable to allocate a unique tmux session identity.')
  }

  private async bindSessionIdentity(
    name: string,
    identity: PersistedSession,
    killCreated = false,
  ): Promise<void> {
    try {
      this.options.repository.markSessionIdInvalid(identity.id, this.clock())
    }
    catch (error) {
      await this.cleanupUnreservedIdentity(name, error, killCreated)
    }

    try {
      this.options.repository.saveIdentity(identity)
      await this.options.tmux.setSessionId(name, identity.id)
      identity.tmuxBound = true
      this.options.repository.saveIdentity(identity)
      this.options.repository.clearSessionIdInvalid(identity.id)
    }
    catch (error) {
      await this.invalidateFailedBinding(name, error, killCreated)
    }
  }

  private async cleanupUnreservedIdentity(name: string, cause: unknown, killCreated: boolean): Promise<never> {
    try {
      this.options.repository.deletePath(name)
    }
    catch (error) {
      this.options.logger.error('Failed to remove an unreserved session identity.', error)
    }
    if (killCreated) {
      try {
        await this.options.tmux.killSession(name)
      }
      catch (error) {
        this.options.logger.error('Failed to remove a session after identity reservation failed.', error)
      }
    }
    const detail = cause instanceof Error ? cause.message : undefined
    throw new SessionError('Unable to reserve a stable tmux session identity.', detail)
  }

  private async invalidateFailedBinding(
    name: string,
    cause: unknown,
    killCreated = false,
  ): Promise<never> {
    try {
      this.options.repository.deletePath(name)
    }
    catch (error) {
      this.options.logger.error('Failed to remove an invalid session identity.', error)
    }
    try {
      await this.options.tmux.clearSessionId(name)
    }
    catch (error) {
      this.options.logger.error('Failed to clear an invalid tmux session id.', error)
    }
    if (killCreated) {
      try {
        await this.options.tmux.killSession(name)
      }
      catch (error) {
        this.options.logger.error('Failed to remove a session after identity binding failed.', error)
      }
    }
    const detail = cause instanceof Error ? cause.message : undefined
    throw new SessionError('Unable to establish a stable tmux session identity.', detail)
  }
}
