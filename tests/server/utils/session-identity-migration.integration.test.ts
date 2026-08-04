import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteSessionRepository } from '../../../server/modules/sessions/adapters/sqlite-session-repository'
import { closeDatabase, db } from '../../../server/utils/db'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bitveins-session-migration-'))
  process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'history.sqlite')
})

afterEach(() => {
  closeDatabase()
  delete process.env.BITVEINS_DATABASE_PATH
  rmSync(tempDir, { force: true, recursive: true })
})

describe('stable session identity migration', () => {
  it('backfills old session rows and their exact-name attention events', () => {
    const legacy = new Database(process.env.BITVEINS_DATABASE_PATH!)
    legacy.exec(`
      CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, executed_at INTEGER NOT NULL);
      INSERT INTO schema_migrations VALUES (1, 'old', 1), (2, 'old', 1), (3, 'old', 1),
        (4, 'old', 1), (5, 'old', 1), (6, 'old', 1);
      CREATE TABLE sessions (name TEXT PRIMARY KEY, path TEXT NOT NULL, created_at INTEGER NOT NULL);
      INSERT INTO sessions VALUES ('main', '/workspace', 42);
      CREATE TABLE attention_events (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, source TEXT NOT NULL, title TEXT NOT NULL,
        summary TEXT, project TEXT, session_name TEXT, window_id TEXT, pane_id TEXT,
        created_at TEXT NOT NULL, read_at TEXT, dismissed_at TEXT
      );
      INSERT INTO attention_events (id, type, source, title, session_name, created_at)
        VALUES ('evt_123456789012', 'information', 'test', 'Ready', 'main', '2026-01-01T00:00:00.000Z');
    `)
    legacy.close()

    const migrated = db()
    const session = migrated.prepare('SELECT id, name, path, created_at AS createdAt, tmux_bound AS tmuxBound FROM sessions').get() as Record<string, unknown>
    const attention = migrated.prepare('SELECT session_id AS sessionId FROM attention_events').get() as Record<string, unknown>

    expect(session).toMatchObject({ name: 'main', path: '/workspace', createdAt: 42, tmuxBound: 0 })
    expect(session.id).toMatch(/^[A-Za-z0-9_-]{16}$/u)
    expect(attention.sessionId).toBe(session.id)

    const repository = new SqliteSessionRepository(() => migrated)
    repository.markSessionIdInvalid('abcdefghijklmnop', 123)
    expect(repository.isSessionIdInvalid('abcdefghijklmnop')).toBe(true)
    expect(repository.isSessionIdInvalid('qrstuvwxyzABCDEF')).toBe(false)
    repository.clearSessionIdInvalid('abcdefghijklmnop')
    expect(repository.isSessionIdInvalid('abcdefghijklmnop')).toBe(false)
  })
})
