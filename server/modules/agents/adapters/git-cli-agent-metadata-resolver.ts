import { basename, dirname, isAbsolute } from 'node:path'
import { tmuxAgentGitMetadataSchema, type TmuxAgentGitMetadata } from '#shared/contracts/agents'
import type { CommandRunner } from '../../sessions/adapters/tmux/command-runner'
import type { AgentGitMetadataResolver } from '../ports/agent-git-metadata-resolver'

interface GitCliAgentMetadataResolverOptions {
  cacheTtlMs?: number
  clock?: () => number
  runner: CommandRunner
  timeoutMs?: number
}

interface CacheEntry {
  expiresAt: number
  value: Promise<TmuxAgentGitMetadata | null>
}

const DEFAULT_CACHE_TTL_MS = 5_000
const DEFAULT_TIMEOUT_MS = 750
const MAX_CACHE_ENTRIES = 256

export class GitCliAgentMetadataResolver implements AgentGitMetadataResolver {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly cacheTtlMs: number
  private readonly clock: () => number
  private readonly timeoutMs: number

  constructor(private readonly options: GitCliAgentMetadataResolverOptions) {
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.clock = options.clock ?? Date.now
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  resolve(path: string): Promise<TmuxAgentGitMetadata | null> {
    if (!isAbsolute(path)) return Promise.resolve(null)
    const now = this.clock()
    const cached = this.cache.get(path)
    if (cached && cached.expiresAt > now) return cached.value

    this.prune(now)
    const value = this.read(path)
    this.cache.set(path, { expiresAt: now + this.cacheTtlMs, value })
    return value
  }

  private async read(path: string): Promise<TmuxAgentGitMetadata | null> {
    try {
      const repository = await this.runGit(path, [
        'rev-parse',
        '--path-format=absolute',
        '--show-toplevel',
        '--git-dir',
        '--git-common-dir',
      ])
      const [root, gitDirectory, commonDirectory] = repository.trimEnd().split('\n')
      if (!root || !gitDirectory || !commonDirectory) return null

      let detached = false
      let reference: string
      try {
        reference = (await this.runGit(path, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
      }
      catch {
        detached = true
        reference = (await this.runGit(path, ['rev-parse', '--short', 'HEAD'])).trim()
      }

      const linkedWorktree = gitDirectory !== commonDirectory
      const parsed = tmuxAgentGitMetadataSchema.safeParse({
        detached,
        linkedWorktree,
        reference,
        repository: linkedWorktree ? basename(dirname(commonDirectory)) : basename(root),
      })
      return parsed.success ? parsed.data : null
    }
    catch {
      return null
    }
  }

  private async runGit(path: string, args: readonly string[]): Promise<string> {
    return (await this.options.runner.run('git', ['-C', path, ...args], {
      timeoutMs: this.timeoutMs,
    })).stdout
  }

  private prune(now: number): void {
    for (const [path, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(path)
    }
    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!)
  }
}
