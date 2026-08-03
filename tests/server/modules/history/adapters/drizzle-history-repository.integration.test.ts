import { chmodSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HistoryService } from '../../../../../server/modules/history/application/history-service'
import { DrizzleHistoryRepository } from '../../../../../server/modules/history/adapters/drizzle-history-repository'
import { closeDatabase, useDrizzle } from '../../../../../server/utils/db'

let tempDir = ''

const mainWindow = {
  sessionName: 'main',
  windowId: '@1',
  windowIndex: 0,
}
const otherWindow = {
  sessionName: 'main',
  windowId: '@2',
  windowIndex: 1,
}

function createService(): HistoryService {
  return new HistoryService({
    repository: new DrizzleHistoryRepository(useDrizzle()),
  })
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'bitveins-history-'))
  process.env.BITVEINS_DATABASE_PATH = join(tempDir, 'history.sqlite')
})

afterEach(() => {
  closeDatabase()
  delete process.env.BITVEINS_DATABASE_PATH
  rmSync(tempDir, {
    force: true,
    recursive: true,
  })
})

describe('DrizzleHistoryRepository integration', () => {
  it('saves and lists every message newest-first per tmux window', () => {
    const service = createService()
    service.saveMessage(mainWindow, 'first')
    service.saveMessage(mainWindow, 'second')
    service.saveMessage(otherWindow, 'third')

    for (let index = 0; index < 25; index += 1) {
      service.saveMessage(mainWindow, `message-${index}`)
    }

    expect(service.listMessages(mainWindow)).toHaveLength(27)
    expect(service.listMessages(mainWindow)[0]?.message).toBe('message-24')
    expect(service.listMessages(otherWindow).map(message => message.message)).toEqual(['third'])
  })

  it('migrates older session-scoped databases in place', () => {
    const oldDatabase = new Database(process.env.BITVEINS_DATABASE_PATH!)
    oldDatabase.exec(`
      CREATE TABLE async_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_name TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `)
    oldDatabase.close()
    chmodSync(process.env.BITVEINS_DATABASE_PATH!, 0o600)

    const service = createService()
    service.saveMessage(mainWindow, 'after-migration')

    expect(service.listMessages(mainWindow).map(message => message.message)).toEqual(['after-migration'])
  })
})
