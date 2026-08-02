import type { TmuxSession, TmuxWindow } from '#shared/contracts/terminal'
import { SessionError } from '../model/session-error'
import { normalizeSessionName, normalizeTerminalTargetName } from '../model/session-validation'
import {
  transferSessionBaseName,
  transferSessionCandidate,
} from '../model/transfer-session-name'
import type { PathInspector } from '../ports/path-inspector'
import type { SessionRepository } from '../ports/session-repository'
import type { SessionPathResolver } from '../ports/session-path-resolver'
import type { TmuxGateway, WindowClientSession } from '../ports/tmux-gateway'

interface ApplicationLogger {
  error(message: string, error: unknown): void
}

interface SessionServiceOptions {
  clock?: () => number
  home: string
  logger: ApplicationLogger
  pathInspector: PathInspector
  repository: SessionRepository
  sessionPathResolver: SessionPathResolver
  tmux: TmuxGateway
}

export class SessionService {
  private readonly clock: () => number

  constructor(private readonly options: SessionServiceOptions) {
    this.clock = options.clock ?? Date.now
  }

  listSessions(): Promise<TmuxSession[]> {
    return this.options.tmux.listSessions()
  }

  async createSession(name: string, path: string): Promise<TmuxSession> {
    const sessionName = normalizeSessionName(name)
    const cwd = this.normalizePath(path)

    if (!await this.options.pathInspector.isDirectory(cwd)) {
      throw new SessionError('Target path must be a directory.')
    }

    await this.options.tmux.createSession(sessionName, cwd)
    this.persist('save session path', () => {
      this.options.repository.savePath(sessionName, cwd, this.clock())
    })

    return { name: sessionName, path: cwd }
  }

  async openTransferSession(name: string, path: string): Promise<{
    created: boolean
    session: TmuxSession
  }> {
    const cwd = this.normalizePath(path)
    if (!await this.options.pathInspector.isDirectory(cwd)) {
      throw new SessionError('Target path must be a directory.')
    }

    const baseName = transferSessionBaseName(name, cwd)
    let sessions = await this.listSessions()

    for (let ordinal = 1; ordinal <= 100; ordinal += 1) {
      const candidate = transferSessionCandidate(baseName, ordinal)
      const existing = sessions.find(session => session.name === candidate)

      if (existing) {
        if (this.normalizePath(existing.path) === cwd) {
          return {
            created: false,
            session: { name: existing.name, path: cwd },
          }
        }
        continue
      }

      try {
        return {
          created: true,
          session: await this.createSession(candidate, cwd),
        }
      }
      catch (error) {
        sessions = await this.listSessions()
        const racedSession = sessions.find(session => session.name === candidate)
        if (!racedSession) throw error
        if (this.normalizePath(racedSession.path) === cwd) {
          return {
            created: false,
            session: { name: racedSession.name, path: cwd },
          }
        }
      }
    }

    throw new SessionError('Unable to find an available tmux session name for this Transfer.')
  }

  async killSession(name: string): Promise<void> {
    const sessionName = normalizeSessionName(name)
    await this.options.tmux.killBitveinsHelpersForBase(sessionName)
    await this.options.tmux.killSession(sessionName)
    this.persist('delete session path', () => {
      this.options.repository.deletePath(sessionName)
    })
  }

  async renameSession(name: string, nextName: string): Promise<TmuxSession> {
    const sessionName = normalizeSessionName(name)
    const newSessionName = normalizeSessionName(nextName)

    if (sessionName === newSessionName) {
      return { name: sessionName, path: '~' }
    }

    const currentPath = await this.getSessionPath(sessionName)
    await this.options.tmux.killBitveinsHelpersForBase(sessionName)
    await this.options.tmux.renameSession(sessionName, newSessionName)
    this.persist('rename session path', () => {
      this.options.repository.renamePath(sessionName, newSessionName, currentPath, this.clock())
    })

    return (await this.listSessions()).find(session => session.name === newSessionName)
      ?? { name: newSessionName, path: '~' }
  }

  listWindows(name: string): Promise<TmuxWindow[]> {
    return this.options.tmux.listWindows(normalizeSessionName(name))
  }

  selectWindow(name: string, index: unknown): Promise<void> {
    return this.options.tmux.selectWindow(normalizeSessionName(name), index)
  }

  async createWindow(name: string): Promise<TmuxWindow> {
    const sessionName = normalizeSessionName(name)
    return this.options.tmux.createWindow(sessionName, await this.getSessionPath(sessionName))
  }

  killWindow(name: string, index: unknown): Promise<void> {
    return this.options.tmux.killWindow(normalizeSessionName(name), index)
  }

  renameWindow(name: string, index: unknown, nextName: string): Promise<TmuxWindow | null> {
    return this.options.tmux.renameWindow(normalizeSessionName(name), index, nextName)
  }

  createWindowClientSession(name: string, index: unknown): Promise<WindowClientSession> {
    return this.options.tmux.createWindowClientSession(normalizeSessionName(name), index)
  }

  captureWindowSnapshot(name: string, index: unknown, lines?: number): Promise<string> {
    return this.options.tmux.captureWindowSnapshot(normalizeSessionName(name), index, lines)
  }

  async prepareTerminalWheel(name: string, direction: 'down' | 'up'): Promise<boolean> {
    return await this.options.tmux.prepareTerminalWheel(normalizeTerminalTargetName(name), direction)
  }

  async resetTerminalScroll(name: string): Promise<void> {
    await this.options.tmux.resetTerminalScroll(normalizeTerminalTargetName(name))
  }

  killBitveinsHelperSession(name: string): Promise<void> {
    return this.options.tmux.killBitveinsHelperSession(name)
  }

  killStaleBitveinsHelpers(activeHelpers?: ReadonlySet<string>, owner?: string): Promise<void> {
    return this.options.tmux.killStaleBitveinsHelpers(activeHelpers, owner)
  }

  killAllBitveinsHelpers(): Promise<void> {
    return this.options.tmux.killAllBitveinsHelpers()
  }

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
        this.persist('save fallback session path', () => {
          this.options.repository.savePath(sessionName, tmuxPath, this.clock())
        })
        return tmuxPath
      }
    }
    catch (error) {
      this.options.logger.error('Tmux display-message query failed for session path.', error)
    }

    return this.options.home
  }

  normalizePath(path: string): string {
    return this.options.sessionPathResolver.normalize(path)
  }

  private persist(action: string, operation: () => void): void {
    try {
      operation()
    }
    catch (error) {
      this.options.logger.error(`Failed to ${action}.`, error)
    }
  }
}
