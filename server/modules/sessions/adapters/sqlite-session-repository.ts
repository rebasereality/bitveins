import type { SessionRepository } from '../ports/session-repository'
import type { RawDatabase } from '../../../utils/db'

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly database: () => RawDatabase) {}

  findPath(name: string): string | null {
    const row = this.database()
      .prepare('SELECT path FROM sessions WHERE name = ?')
      .get(name) as { path: string } | undefined

    return row?.path ?? null
  }

  savePath(name: string, path: string, now: number): void {
    this.database()
      .prepare('INSERT OR REPLACE INTO sessions (name, path, created_at) VALUES (?, ?, ?)')
      .run(name, path, now)
  }

  deletePath(name: string): void {
    this.database().prepare('DELETE FROM sessions WHERE name = ?').run(name)
  }

  renamePath(currentName: string, nextName: string, path: string, now: number): void {
    const database = this.database()
    database.transaction(() => {
      database.prepare('DELETE FROM sessions WHERE name = ?').run(currentName)
      database
        .prepare('INSERT OR REPLACE INTO sessions (name, path, created_at) VALUES (?, ?, ?)')
        .run(nextName, path, now)
    })()
  }
}
