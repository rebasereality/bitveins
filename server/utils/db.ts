import { chmodSync, existsSync, lstatSync, mkdirSync } from 'node:fs'
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
  const dataDirectory = dirname(nextPath)
  mkdirSync(dataDirectory, { mode: 0o700, recursive: true })
  if (nextPath === DEFAULT_DATABASE_PATH) chmodSync(dataDirectory, 0o700)
  const strictProduction = process.env.NODE_ENV === 'production' && !process.env.BITVEINS_E2E_RUN_ID
  if (strictProduction) assertPrivateDatabaseDirectory(dataDirectory)
  if (existsSync(nextPath)) assertPrivateDatabaseFile(nextPath, strictProduction)

  rawDatabase = new Database(nextPath)
  rawDatabase.pragma('journal_mode = DELETE')
  chmodSync(nextPath, 0o600)
  databasePath = nextPath
  drizzleDatabase = drizzle(rawDatabase, { schema })

  runMigrations(rawDatabase)
  for (const suffix of ['-journal', '-shm', '-wal']) {
    const auxiliaryPath = `${nextPath}${suffix}`
    if (existsSync(auxiliaryPath)) chmodSync(auxiliaryPath, 0o600)
  }
}

function assertPrivateDatabaseDirectory(path: string): void {
  const directory = lstatSync(path)
  const uid = process.getuid?.()
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077) !== 0) {
    throw new Error('Bitveins database directory must be a private directory.')
  }
  if (uid !== undefined && directory.uid !== uid) {
    throw new Error('Bitveins database directory must be owned by the current user.')
  }
}

function assertPrivateDatabaseFile(path: string, strictPermissions: boolean): void {
  const file = lstatSync(path)
  const uid = process.getuid?.()
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error('Bitveins database must be a regular file.')
  }
  if (uid !== undefined && file.uid !== uid) {
    throw new Error('Bitveins database must be owned by the current user.')
  }
  if (strictPermissions && (file.mode & 0o077) !== 0) {
    throw new Error('Bitveins database file must be private.')
  }
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
    {
      id: 3,
      name: '003_add_attention_inbox_and_web_push',
      up: () => {
        dbInstance.exec(`
          CREATE TABLE IF NOT EXISTS attention_events (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT,
            project TEXT,
            session_name TEXT,
            window_id TEXT,
            pane_id TEXT,
            created_at TEXT NOT NULL,
            read_at TEXT,
            dismissed_at TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_attention_events_created_at
            ON attention_events (created_at DESC);

          CREATE TABLE IF NOT EXISTS web_push_subscriptions (
            endpoint TEXT PRIMARY KEY,
            expiration_time INTEGER,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
        `)
      },
    },
    {
      id: 4,
      name: '004_add_per_subscription_notification_preference',
      up: () => {
        const columns = dbInstance.prepare('PRAGMA table_info(web_push_subscriptions)').all() as Array<{ name: string }>
        if (!columns.some(column => column.name === 'show_details')) {
          dbInstance.exec('ALTER TABLE web_push_subscriptions ADD COLUMN show_details INTEGER NOT NULL DEFAULT 0')
        }
        const legacyPreferenceTable = dbInstance.prepare(
          `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notification_preferences'`,
        ).get()
        if (legacyPreferenceTable) {
          dbInstance.exec(`
            UPDATE web_push_subscriptions
            SET show_details = COALESCE(
              (SELECT show_details FROM notification_preferences WHERE id = 1),
              0
            );
            DROP TABLE notification_preferences;
          `)
        }
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
