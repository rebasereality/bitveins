import { existsSync } from 'node:fs'
import { readdir, readlink } from 'node:fs/promises'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { normalizeAgentLabel } from '../model/agent-label'
import type { GrokAgentMetadataResolver } from '../ports/grok-agent-metadata-resolver'

interface ProcFilesystem {
  readdir(path: string): Promise<string[]>
  readlink(path: string): Promise<string>
}

export interface SqliteGrokAgentMetadataResolverOptions {
  filesystem?: ProcFilesystem
  homeDirectory?: string
  procRoot?: string
}

const nodeProcFilesystem: ProcFilesystem = { readdir, readlink }
const GROK_SESSION_PATH_PATTERN = /[/\\]sessions[/\\](?:%[0-9a-fA-F]{2}|[^/\\])+[/\\]([0-9a-fA-F-]{36})/u

export class SqliteGrokAgentMetadataResolver implements GrokAgentMetadataResolver {
  private readonly filesystem: ProcFilesystem
  private readonly homeDirectory: string
  private readonly procRoot: string

  constructor(options: SqliteGrokAgentMetadataResolverOptions = {}) {
    this.filesystem = options.filesystem ?? nodeProcFilesystem
    this.homeDirectory = options.homeDirectory ?? (process.env.HOME || process.cwd())
    this.procRoot = options.procRoot ?? '/proc'
  }

  async labelFor(processId: number, workspacePath?: string): Promise<string | null> {
    if (!Number.isSafeInteger(processId) || processId <= 0) return null

    const sessionId = await this.findSessionId(processId)
    return this.readSessionTitle(sessionId, workspacePath)
  }

  private async findSessionId(processId: number): Promise<string | null> {
    const fdDirectory = join(this.procRoot, String(processId), 'fd')
    try {
      const descriptors = await this.filesystem.readdir(fdDirectory)
      for (const descriptor of descriptors) {
        try {
          const target = await this.filesystem.readlink(join(fdDirectory, descriptor))
          const match = target.match(GROK_SESSION_PATH_PATTERN)
          if (match?.[1]) return match[1]
        }
        catch {
          // Individual fd may close or be inaccessible.
        }
      }
    }
    catch {
      // Process may exit or be permission-isolated.
    }
    return null
  }

  private readSessionTitle(sessionId: string | null, workspacePath?: string): string | null {
    const dbPath = join(this.homeDirectory, '.grok', 'sessions', 'session_search.sqlite')
    if (!existsSync(dbPath)) return null

    let db: InstanceType<typeof Database> | null = null
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 500 })

      if (sessionId) {
        const row = db
          .prepare('SELECT title FROM session_docs WHERE session_id = ?')
          .get(sessionId) as { title?: string } | undefined
        if (row?.title?.trim()) {
          const normalized = normalizeAgentLabel(row.title)
          if (normalized) return normalized
        }
      }

      if (workspacePath) {
        const row = db
          .prepare('SELECT title FROM session_docs WHERE cwd = ? ORDER BY updated_at DESC LIMIT 1')
          .get(workspacePath) as { title?: string } | undefined
        if (row?.title?.trim()) {
          const normalized = normalizeAgentLabel(row.title)
          if (normalized) return normalized
        }
      }
    }
    catch {
      return null
    }
    finally {
      db?.close()
    }
    return null
  }
}
