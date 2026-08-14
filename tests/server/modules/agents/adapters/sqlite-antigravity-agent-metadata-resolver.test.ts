import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteAntigravityAgentMetadataResolver } from '../../../../../server/modules/agents/adapters/sqlite-antigravity-agent-metadata-resolver'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    async directory => await rm(directory, { force: true, recursive: true }),
  ))
})

describe('SqliteAntigravityAgentMetadataResolver', () => {
  it('resolves conversation title from conversation_summaries.db via /proc/<pid>/fd', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-antigravity-meta-'))
    temporaryDirectories.push(root)

    const home = join(root, 'home')
    const procRoot = join(root, 'proc')
    const convId = '36f69b60-ae2f-4da5-9f63-90a27f10cf7c'

    const geminiDir = join(home, '.gemini', 'antigravity-cli')
    await mkdir(geminiDir, { recursive: true })

    const db = new Database(join(geminiDir, 'conversation_summaries.db'))
    db.exec(`
      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        title TEXT,
        preview TEXT
      );
    `)
    db.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?)')
      .run(convId, 'Fixing TUI Scroll Issues', 'Preview text')
    db.close()

    const resolver = new SqliteAntigravityAgentMetadataResolver({
      filesystem: {
        readdir: async () => ['0', '1', '18'],
        readlink: async path => (path.endsWith('/18')
          ? `/home/theman/.gemini/antigravity-cli/conversations/${convId}.db`
          : '/dev/null'),
      },
      homeDirectory: home,
      procRoot,
    })

    const label = await resolver.labelFor(1234)
    expect(label).toBe('Fixing TUI Scroll Issues')
  })

  it('falls back to preview when title is empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-antigravity-meta-'))
    temporaryDirectories.push(root)

    const home = join(root, 'home')
    const convId = 'b5e9e277-8c4e-4900-ac5e-1e3955f7c0ed'

    const geminiDir = join(home, '.gemini', 'antigravity-cli')
    await mkdir(geminiDir, { recursive: true })

    const db = new Database(join(geminiDir, 'conversation_summaries.db'))
    db.exec(`
      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        title TEXT,
        preview TEXT
      );
    `)
    db.prepare('INSERT INTO conversation_summaries VALUES (?, ?, ?)')
      .run(convId, '', 'Analyse de performance')
    db.close()

    const resolver = new SqliteAntigravityAgentMetadataResolver({
      filesystem: {
        readdir: async () => ['3'],
        readlink: async () => `/home/theman/.gemini/antigravity-cli/presence/${convId}.lock`,
      },
      homeDirectory: home,
    })

    const label = await resolver.labelFor(5678)
    expect(label).toBe('Analyse de performance')
  })

  it('returns null for missing process or non-existent conversation', async () => {
    const resolver = new SqliteAntigravityAgentMetadataResolver({
      filesystem: {
        readdir: async () => { throw new Error('Process not found') },
        readlink: async () => '',
      },
      homeDirectory: '/nonexistent',
    })

    expect(await resolver.labelFor(99999)).toBeNull()
    expect(await resolver.labelFor(-1)).toBeNull()
  })
})
