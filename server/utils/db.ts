import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema'

export type RawDatabase = InstanceType<typeof Database>
export type DrizzleDatabase = BetterSQLite3Database<typeof schema>

const DEFAULT_DATABASE_PATH = join(process.env.HOME || process.cwd(), '.local/share/bitveins/history.sqlite')

let rawDatabase: RawDatabase | null = null
let drizzleDatabase: DrizzleDatabase | null = null
let databasePath: string | null = null

function dbPath(): string {
  return process.env.BITVEINS_DATABASE_PATH || DEFAULT_DATABASE_PATH
}

function initDb(): void {
  const nextPath = dbPath()

  if (rawDatabase && drizzleDatabase && databasePath === nextPath) {
    return
  }

  rawDatabase?.close()
  mkdirSync(dirname(nextPath), { recursive: true })

  rawDatabase = new Database(nextPath)
  databasePath = nextPath
  drizzleDatabase = drizzle(rawDatabase, { schema })

  runMigrations(rawDatabase)
}

function ensureColumn(dbInstance: RawDatabase, tableName: string, name: string, type: 'INTEGER' | 'TEXT'): void {
  const columns = dbInstance.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>

  if (columns.some(column => column.name === name)) {
    return
  }

  dbInstance.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`)
}

function runMigrations(dbInstance: RawDatabase): void {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at INTEGER NOT NULL
    );
  `)

  const executed = new Set(
    (dbInstance.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: number }>).map(m => m.id),
  )

  const migrations = [
    {
      id: 1,
      name: '001_initial_schema',
      up: () => {
        dbInstance.exec(`
          CREATE TABLE IF NOT EXISTS async_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_name TEXT NOT NULL,
            window_id TEXT,
            window_index INTEGER,
            message TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_async_messages_session_id
            ON async_messages (session_name, id DESC);

          CREATE TABLE IF NOT EXISTS dropzones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            path TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );

          CREATE TABLE IF NOT EXISTS sessions (
            name TEXT PRIMARY KEY,
            path TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );
        `)
      },
    },
    {
      id: 2,
      name: '002_add_window_columns_to_async_messages',
      up: () => {
        ensureColumn(dbInstance, 'async_messages', 'window_id', 'TEXT')
        ensureColumn(dbInstance, 'async_messages', 'window_index', 'INTEGER')
        dbInstance.exec(`
          CREATE INDEX IF NOT EXISTS idx_async_messages_window_id
            ON async_messages (session_name, window_id, window_index, id DESC);
        `)
      },
    },
  ]

  for (const migration of migrations) {
    if (!executed.has(migration.id)) {
      const applyMigration = dbInstance.transaction(() => {
        migration.up()
        dbInstance.prepare('INSERT INTO schema_migrations (id, name, executed_at) VALUES (?, ?, ?)')
          .run(migration.id, migration.name, Date.now())
      })
      applyMigration()
    }
  }
}

export function db(): RawDatabase {
  initDb()
  return rawDatabase!
}

export function useDrizzle(): DrizzleDatabase {
  initDb()
  return drizzleDatabase!
}

export function closeDatabase(): void {
  rawDatabase?.close()
  rawDatabase = null
  drizzleDatabase = null
  databasePath = null
}
