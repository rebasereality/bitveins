import { basename } from 'node:path'
import type {
  GitCommit,
  GitCommitDetails,
  GitFileChange,
  GitFileDiff,
  GitGraphResponse,
} from '#shared/contracts/git'
import type { CommandRunner } from '../../sessions/adapters/tmux/command-runner'
import { GitViewerError } from '../model/git-error'
import type { GitRepository } from '../ports/git-repository'

interface GitCliRepositoryOptions {
  maxDiffBytes?: number
  runner: CommandRunner
  timeoutMs?: number
}

interface RepositoryContext {
  branch: string
  detached: boolean
  root: string
}

interface NumberStat {
  additions: number | null
  deletions: number | null
  binary: boolean
}

const FIELD_SEPARATOR = '\u001f'
const DEFAULT_TIMEOUT_MS = 4_000
const DEFAULT_MAX_DIFF_BYTES = 2 * 1024 * 1024

function references(value: string): GitCommit['references'] {
  const result: GitCommit['references'] = []
  for (const raw of value.split(',').map(part => part.trim()).filter(Boolean)) {
    if (raw.startsWith('HEAD -> refs/heads/')) {
      result.push({ kind: 'head', name: raw.slice('HEAD -> refs/heads/'.length) })
    }
    else if (raw === 'HEAD') result.push({ kind: 'head', name: 'HEAD' })
    else if (raw.startsWith('refs/heads/')) {
      result.push({ kind: 'branch', name: raw.slice('refs/heads/'.length) })
    }
    else if (raw.startsWith('refs/remotes/')) {
      result.push({ kind: 'remote', name: raw.slice('refs/remotes/'.length) })
    }
    else if (raw.startsWith('tag: refs/tags/')) {
      result.push({ kind: 'tag', name: raw.slice('tag: refs/tags/'.length) })
    }
    else result.push({ kind: 'other', name: raw.replace(/^refs\//, '') })
  }
  return result
}

function parseCommitRecord(record: string): GitCommit {
  const [hash = '', parentText = '', authorName = '', authorEmail = '', authoredAt = '', subject = '', refs = '']
    = record.split(FIELD_SEPARATOR)
  if (!/^[0-9a-f]{40,64}$/i.test(hash)) {
    throw new GitViewerError('commit-not-found', 'Git returned an invalid commit record.')
  }
  return {
    hash,
    shortHash: hash.slice(0, 8),
    parents: parentText.split(' ').filter(Boolean),
    subject,
    authorName,
    authorEmail,
    authoredAt,
    references: references(refs),
  }
}

function parseNameStatus(output: string): Array<Pick<GitFileChange, 'path' | 'previousPath' | 'status'>> {
  const tokens = output.split('\0').filter((token, index, all) => token || index < all.length - 1)
  const changes: Array<Pick<GitFileChange, 'path' | 'previousPath' | 'status'>> = []
  for (let index = 0; index < tokens.length;) {
    const statusToken = tokens[index++] || ''
    const code = statusToken[0] || '?'
    const firstPath = tokens[index++]
    if (!firstPath) break
    if (code === 'R' || code === 'C') {
      const nextPath = tokens[index++]
      if (!nextPath) break
      changes.push({
        path: nextPath,
        previousPath: firstPath,
        status: code === 'R' ? 'renamed' : 'copied',
      })
      continue
    }
    changes.push({
      path: firstPath,
      status: code === 'A'
        ? 'added'
        : code === 'D'
          ? 'deleted'
          : code === 'M'
            ? 'modified'
            : code === 'T'
              ? 'type-changed'
              : 'unknown',
    })
  }
  return changes
}

function parseNumberStats(output: string): Map<string, NumberStat> {
  const tokens = output.split('\0')
  const stats = new Map<string, NumberStat>()
  for (let index = 0; index < tokens.length;) {
    const record = tokens[index++]
    if (!record) continue
    const [added = '-', deleted = '-', path = ''] = record.split('\t')
    let resultPath = path
    if (!resultPath) {
      index += 1 // Previous path for a rename or copy.
      resultPath = tokens[index++] || ''
    }
    if (!resultPath) continue
    const binary = added === '-' || deleted === '-'
    stats.set(resultPath, {
      additions: binary ? null : Number.parseInt(added, 10),
      deletions: binary ? null : Number.parseInt(deleted, 10),
      binary,
    })
  }
  return stats
}

export class GitCliRepository implements GitRepository {
  private readonly maxDiffBytes: number
  private readonly timeoutMs: number

  constructor(private readonly options: GitCliRepositoryOptions) {
    this.maxDiffBytes = options.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async list(path: string, offset: number, limit: number): Promise<GitGraphResponse> {
    const repository = await this.repository(path)
    const output = await this.git(repository.root, [
      'log',
      '-z',
      '--all',
      '--topo-order',
      '--date-order',
      '--decorate=full',
      `--skip=${offset}`,
      `--max-count=${limit + 1}`,
      `--format=%H${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%D`,
    ], 8 * 1024 * 1024)
    const commits = output.split('\0').filter(Boolean).map(parseCommitRecord)
    return {
      repository: basename(repository.root),
      branch: repository.branch,
      detached: repository.detached,
      commits: commits.slice(0, limit),
      hasMore: commits.length > limit,
    }
  }

  async details(path: string, commit: string): Promise<GitCommitDetails> {
    const repository = await this.repository(path)
    let output: string
    try {
      output = await this.git(repository.root, [
        'show',
        '-s',
        '-z',
        '--decorate=full',
        `--format=%H${FIELD_SEPARATOR}%P${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%D${FIELD_SEPARATOR}%B${FIELD_SEPARATOR}%cn${FIELD_SEPARATOR}%ce${FIELD_SEPARATOR}%cI`,
        commit,
      ], 4 * 1024 * 1024)
    }
    catch {
      throw new GitViewerError('commit-not-found', 'Commit was not found.')
    }
    const fields = output.replace(/\0$/, '').split(FIELD_SEPARATOR)
    if (fields.length < 11) throw new GitViewerError('commit-not-found', 'Commit was not found.')
    const base = parseCommitRecord(fields.slice(0, 7).join(FIELD_SEPARATOR))
    return {
      commit: {
        ...base,
        body: fields[7] || '',
        committerName: fields[8] || '',
        committerEmail: fields[9] || '',
        committedAt: fields[10] || '',
      },
      files: await this.files(repository.root, base),
    }
  }

  async diff(path: string, commit: string, filePath: string): Promise<GitFileDiff> {
    const repository = await this.repository(path)
    const details = await this.details(repository.root, commit)
    const file = details.files.find(change => change.path === filePath)
    if (!file) throw new GitViewerError('file-not-found', 'File is not part of this commit.')
    if (file.binary) return { ...file, commit, before: null, after: null }

    const parent = details.commit.parents[0]
    const beforePath = file.previousPath || file.path
    const before = file.status === 'added' || !parent
      ? null
      : await this.readBlob(repository.root, `${parent}:${beforePath}`)
    const after = file.status === 'deleted'
      ? null
      : await this.readBlob(repository.root, `${commit}:${file.path}`)
    if (before === undefined || after === undefined) {
      return { ...file, commit, binary: true, before: null, after: null }
    }
    return { ...file, commit, before, after }
  }

  private async repository(path: string): Promise<RepositoryContext> {
    try {
      const root = (await this.git(path, ['rev-parse', '--path-format=absolute', '--show-toplevel'])).trim()
      if (!root) throw new Error('missing root')
      try {
        const branch = (await this.git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).trim()
        return { branch, detached: false, root }
      }
      catch {
        const branch = (await this.git(root, ['rev-parse', '--short', 'HEAD'])).trim()
        return { branch, detached: true, root }
      }
    }
    catch (error) {
      if (error instanceof GitViewerError) throw error
      throw new GitViewerError('not-repository', 'This session is not attached to a Git repository.')
    }
  }

  private async files(root: string, commit: GitCommit): Promise<GitFileChange[]> {
    const parent = commit.parents[0]
    const baseArgs = parent
      ? ['diff', '--find-renames', parent, commit.hash, '--']
      : ['diff-tree', '--root', '--no-commit-id', '-r', '--find-renames', commit.hash, '--']
    const [names, numbers] = await Promise.all([
      this.git(root, [...baseArgs.slice(0, -1), '--name-status', '-z', '--'], 8 * 1024 * 1024),
      this.git(root, [...baseArgs.slice(0, -1), '--numstat', '-z', '--'], 8 * 1024 * 1024),
    ])
    const stats = parseNumberStats(numbers)
    return parseNameStatus(names).map((change) => {
      const numberStat = stats.get(change.path) || { additions: 0, deletions: 0, binary: false }
      return { ...change, ...numberStat }
    })
  }

  private async readBlob(root: string, object: string): Promise<string | undefined> {
    const type = (await this.git(root, ['cat-file', '-t', object])).trim()
    if (type !== 'blob') return undefined
    const size = Number.parseInt((await this.git(root, ['cat-file', '-s', object])).trim(), 10)
    if (!Number.isFinite(size) || size > this.maxDiffBytes) {
      throw new GitViewerError('too-large', 'File exceeds the 2 MiB diff limit.')
    }
    return this.git(root, ['show', object], this.maxDiffBytes + 1024)
  }

  private async git(path: string, args: readonly string[], maxBuffer?: number): Promise<string> {
    try {
      return (await this.options.runner.run('git', ['-C', path, ...args], {
        maxBuffer,
        timeoutMs: this.timeoutMs,
      })).stdout
    }
    catch (error) {
      if (error instanceof GitViewerError) throw error
      throw error
    }
  }
}
