import { existsSync, readFileSync } from 'node:fs'
import { readdir, readlink } from 'node:fs/promises'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { normalizeAgentLabel } from '../model/agent-label'
import type { AntigravityAgentMetadataResolver } from '../ports/antigravity-agent-metadata-resolver'

interface ProcFilesystem {
  readdir(path: string): Promise<string[]>
  readlink(path: string): Promise<string>
}

export interface SqliteAntigravityAgentMetadataResolverOptions {
  filesystem?: ProcFilesystem
  homeDirectory?: string
  procRoot?: string
}

const nodeProcFilesystem: ProcFilesystem = { readdir, readlink }
const CONVERSATION_PATH_PATTERN = /[/\\](?:conversations|presence)[/\\]([0-9a-fA-F-]{36})\.(?:db|lock)/u

export class SqliteAntigravityAgentMetadataResolver implements AntigravityAgentMetadataResolver {
  private readonly filesystem: ProcFilesystem
  private readonly homeDirectory: string
  private readonly procRoot: string

  constructor(options: SqliteAntigravityAgentMetadataResolverOptions = {}) {
    this.filesystem = options.filesystem ?? nodeProcFilesystem
    this.homeDirectory = options.homeDirectory ?? (process.env.HOME || process.cwd())
    this.procRoot = options.procRoot ?? '/proc'
  }

  async labelFor(processId: number): Promise<string | null> {
    if (!Number.isSafeInteger(processId) || processId <= 0) return null

    const conversationId = await this.findConversationId(processId)
    if (!conversationId) return null

    return this.readConversationTitle(conversationId)
  }

  private async findConversationId(processId: number): Promise<string | null> {
    const fdDirectory = join(this.procRoot, String(processId), 'fd')
    try {
      const descriptors = await this.filesystem.readdir(fdDirectory)
      for (const descriptor of descriptors) {
        try {
          const target = await this.filesystem.readlink(join(fdDirectory, descriptor))
          const match = target.match(CONVERSATION_PATH_PATTERN)
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

  private readConversationTitle(conversationId: string): string | null {
    const dbPath = join(this.homeDirectory, '.gemini', 'antigravity-cli', 'conversation_summaries.db')
    if (existsSync(dbPath)) {
      let db: InstanceType<typeof Database> | null = null
      try {
        db = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: 500 })
        const row = db
          .prepare('SELECT title, preview FROM conversation_summaries WHERE conversation_id = ?')
          .get(conversationId) as { preview?: string, title?: string } | undefined

        const rawLabel = row?.title?.trim() || row?.preview?.trim() || null
        const normalized = normalizeAgentLabel(rawLabel)
        if (normalized) return normalized
      }
      catch {
        // Continue to fallback transcript reader.
      }
      finally {
        db?.close()
      }
    }

    return this.readTranscriptTitle(conversationId)
  }

  private readTranscriptTitle(conversationId: string): string | null {
    const transcriptPath = join(
      this.homeDirectory,
      '.gemini',
      'antigravity-cli',
      'brain',
      conversationId,
      '.system_generated',
      'logs',
      'transcript.jsonl',
    )
    if (!existsSync(transcriptPath)) return null

    try {
      const content = readFileSync(transcriptPath, 'utf-8')
      const lines = content.split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        const parsed = JSON.parse(line) as { content?: string, type?: string }
        if (parsed.type === 'USER_INPUT' && typeof parsed.content === 'string') {
          const userRequestMatch = parsed.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/u)
          const rawText = userRequestMatch ? userRequestMatch[1]?.trim() : parsed.content.trim()
          const firstLine = rawText?.split('\n').map(l => l.trim()).find(Boolean)
          const label = normalizeAgentLabel(firstLine ?? null)
          if (label) return label
        }
      }
    }
    catch {
      // Transcript unreadable or invalid JSON
    }
    return null
  }
}
