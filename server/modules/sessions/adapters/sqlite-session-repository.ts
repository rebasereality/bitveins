import type { PersistedSession, SessionRepository } from '../ports/session-repository'
import type { RawDatabase } from '../../../utils/db'

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly database: () => RawDatabase) {}

  clearSessionIdInvalid(id: string): void {
    this.database().prepare('DELETE FROM invalidated_session_ids WHERE id = ?').run(id)
  }

  findById(id: string): PersistedSession | null {
    return toSession(this.database().prepare(
      'SELECT id, name, path, created_at AS createdAt, tmux_bound AS tmuxBound FROM sessions WHERE id = ?',
    ).get(id))
  }

  findByName(name: string): PersistedSession | null {
    return toSession(this.database().prepare(
      'SELECT id, name, path, created_at AS createdAt, tmux_bound AS tmuxBound FROM sessions WHERE name = ?',
    ).get(name))
  }

  findPath(name: string): string | null {
    return this.findByName(name)?.path ?? null
  }

  list(): PersistedSession[] {
    return this.database().prepare(
      'SELECT id, name, path, created_at AS createdAt, tmux_bound AS tmuxBound FROM sessions ORDER BY created_at',
    ).all().map(toSession).filter((session): session is PersistedSession => Boolean(session))
  }

  isSessionIdInvalid(id: string): boolean {
    return Boolean(this.database().prepare(
      'SELECT 1 FROM invalidated_session_ids WHERE id = ?',
    ).get(id))
  }

  markSessionIdInvalid(id: string, invalidatedAt: number): void {
    this.database().prepare(
      'INSERT OR IGNORE INTO invalidated_session_ids (id, invalidated_at) VALUES (?, ?)',
    ).run(id, invalidatedAt)
  }

  savePath(name: string, path: string, now: number, id?: string): void {
    const existing = this.findByName(name)
    if (!existing && !id) throw new Error('A session id is required for a new session.')
    this.database()
      .prepare(`INSERT INTO sessions (id, name, path, created_at, tmux_bound) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET path = excluded.path`)
      .run(existing?.id ?? id, name, path, existing?.createdAt ?? now, existing?.tmuxBound ? 1 : 0)
  }

  saveIdentity(session: PersistedSession): void {
    const database = this.database()
    database.transaction(() => {
      database.prepare('DELETE FROM sessions WHERE name = ? AND id <> ?').run(session.name, session.id)
      database.prepare(`INSERT INTO sessions (id, name, path, created_at, tmux_bound) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path, tmux_bound = excluded.tmux_bound`)
        .run(session.id, session.name, session.path, session.createdAt, session.tmuxBound ? 1 : 0)
    })()
  }

  deletePath(name: string): void {
    this.database().prepare('DELETE FROM sessions WHERE name = ?').run(name)
  }

  renamePath(currentName: string, nextName: string, path: string): void {
    this.database().prepare('UPDATE sessions SET name = ?, path = ? WHERE name = ?')
      .run(nextName, path, currentName)
  }
}

function toSession(value: unknown): PersistedSession | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Omit<PersistedSession, 'tmuxBound'> & { tmuxBound: number }
  return { ...row, tmuxBound: row.tmuxBound === 1 }
}
