import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteGrokAgentMetadataResolver } from '../../../../../server/modules/agents/adapters/sqlite-grok-agent-metadata-resolver'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    async directory => await rm(directory, { force: true, recursive: true }),
  ))
})

describe('SqliteGrokAgentMetadataResolver', () => {
  it('resolves session title from session_search.sqlite via session ID in /proc/<pid>/fd', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-grok-meta-'))
    temporaryDirectories.push(root)

    const home = join(root, 'home')
    const sessionId = '019fff69-b8cd-7010-9d89-e7da4e483b2d'

    const grokDir = join(home, '.grok', 'sessions')
    await mkdir(grokDir, { recursive: true })

    const db = new Database(join(grokDir, 'session_search.sqlite'))
    db.exec(`
      CREATE TABLE session_docs (
        session_id TEXT PRIMARY KEY,
        cwd TEXT,
        updated_at INTEGER,
        title TEXT
      );
    `)
    db.prepare('INSERT INTO session_docs VALUES (?, ?, ?, ?)')
      .run(sessionId, '/home/user/code/project', 100, 'Bitveins Grok Build Fix')
    db.close()

    const resolver = new SqliteGrokAgentMetadataResolver({
      filesystem: {
        readdir: async () => ['0', '5'],
        readlink: async path => (path.endsWith('/5')
          ? `/home/user/.grok/sessions/%2Fhome%2Fuser%2Fcode%2Fproject/${sessionId}/updates.jsonl`
          : '/dev/null'),
      },
      homeDirectory: home,
    })

    const label = await resolver.labelFor(1234)
    expect(label).toBe('Bitveins Grok Build Fix')
  })

  it('falls back to workspace path when session ID is not in fd descriptors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bitveins-grok-meta-'))
    temporaryDirectories.push(root)

    const home = join(root, 'home')
    const grokDir = join(home, '.grok', 'sessions')
    await mkdir(grokDir, { recursive: true })

    const db = new Database(join(grokDir, 'session_search.sqlite'))
    db.exec(`
      CREATE TABLE session_docs (
        session_id TEXT PRIMARY KEY,
        cwd TEXT,
        updated_at INTEGER,
        title TEXT
      );
    `)
    db.prepare('INSERT INTO session_docs VALUES (?, ?, ?, ?)')
      .run('session-1', '/home/user/code/app', 200, 'Workspace Fallback Title')
    db.close()

    const resolver = new SqliteGrokAgentMetadataResolver({
      filesystem: {
        readdir: async () => ['0', '1'],
        readlink: async () => '/dev/null',
      },
      homeDirectory: home,
    })

    const label = await resolver.labelFor(5678, '/home/user/code/app')
    expect(label).toBe('Workspace Fallback Title')
  })

  it('returns null for missing process or non-existent session', async () => {
    const resolver = new SqliteGrokAgentMetadataResolver({
      filesystem: {
        readdir: async () => { throw new Error('Process not found') },
        readlink: async () => '',
      },
      homeDirectory: '/nonexistent',
    })

    expect(await resolver.labelFor(99999)).toBeNull()
  })
})
