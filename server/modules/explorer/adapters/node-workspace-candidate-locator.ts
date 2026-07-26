import { readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { LocatedExplorerDocument } from '../model/file-reference-resolution'
import type { WorkspaceCandidateLocator } from '../ports/workspace-candidate-locator'
import type { WorkspaceDocumentRepository } from '../ports/workspace-document-repository'

const IGNORED_DIRECTORIES = new Set([
  '.cache',
  '.git',
  '.local',
  '.nuxt',
  '.output',
  'dist',
  'node_modules',
])
const MAX_DIRECTORIES = 800
const MAX_DEPTH = 5
const MAX_SCAN_MS = 250
const MAX_RESULTS = 32
const LOCATE_CONCURRENCY = 16
const ROOT_MARKERS = new Set(['.git', 'package.json', 'pnpm-workspace.yaml'])

interface RootCacheEntry {
  expiresAt: number
  roots: string[]
}

function within(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function normalizedRelative(root: string, path: string): string {
  const rel = relative(root, path).replaceAll('\\', '/')
  return rel || '.'
}

export class NodeWorkspaceCandidateLocator implements WorkspaceCandidateLocator {
  private readonly rootCache = new Map<string, RootCacheEntry>()

  constructor(
    private readonly documents: Pick<WorkspaceDocumentRepository, 'describe'>,
  ) {}

  async locateRemembered(
    sessionRoot: string,
    rememberedRoot: string,
    path: string,
  ): Promise<LocatedExplorerDocument | null> {
    const canonicalSessionRoot = await realpath(sessionRoot)
    const base = resolve(canonicalSessionRoot, rememberedRoot)
    if (!within(canonicalSessionRoot, base)) return null
    return this.locate(canonicalSessionRoot, base, path)
  }

  async locateAll(
    sessionRoot: string,
    currentPath: string,
    path: string,
  ): Promise<LocatedExplorerDocument[]> {
    const root = await realpath(sessionRoot)
    const absoluteReference = this.absoluteReference(path)

    if (absoluteReference) {
      const candidate = await this.locateAbsolute(root, absoluteReference)
      return candidate ? [candidate] : []
    }

    const roots = await this.discoverRoots(root)
    const bases = [currentPath, root, ...roots]
    const [baseCandidates, suffixCandidates] = await Promise.all([
      this.locateFromBases(root, bases, path),
      this.findSuffixCandidates(root, path),
    ])
    const located = [
      ...baseCandidates.filter(candidate => candidate !== null),
      ...suffixCandidates,
    ]
    const unique = new Map<string, LocatedExplorerDocument>()
    for (const candidate of located) {
      if (!unique.has(candidate.canonicalPath)) unique.set(candidate.canonicalPath, candidate)
      if (unique.size >= MAX_RESULTS) break
    }
    return [...unique.values()]
  }

  async listProjectRoots(sessionRoot: string): Promise<string[]> {
    const root = await realpath(sessionRoot)
    return (await this.discoverRoots(root))
      .slice(0, MAX_RESULTS)
      .map(path => normalizedRelative(root, path))
  }

  private absoluteReference(path: string): string | null {
    if (path === '~') return homedir()
    if (path.startsWith('~/')) return resolve(homedir(), path.slice(2))
    return isAbsolute(path) ? resolve(path) : null
  }

  private async locateAbsolute(
    sessionRoot: string,
    path: string,
  ): Promise<LocatedExplorerDocument | null> {
    if (!within(sessionRoot, path)) return null
    return this.toLocated(sessionRoot, sessionRoot, path)
  }

  private async locate(
    sessionRoot: string,
    basePath: string,
    requestedPath: string,
  ): Promise<LocatedExplorerDocument | null> {
    let canonicalBase: string
    try {
      canonicalBase = await realpath(resolve(basePath))
    }
    catch {
      return null
    }
    if (!within(sessionRoot, canonicalBase)) return null
    return this.toLocated(sessionRoot, canonicalBase, resolve(canonicalBase, requestedPath))
  }

  private async locateFromBases(
    sessionRoot: string,
    bases: string[],
    requestedPath: string,
  ): Promise<LocatedExplorerDocument[]> {
    const candidates: LocatedExplorerDocument[] = []
    const uniqueBases = [...new Set(bases)]
    const startedAt = Date.now()

    for (
      let offset = 0;
      offset < uniqueBases.length
      && candidates.length < MAX_RESULTS
      && Date.now() - startedAt < MAX_SCAN_MS;
      offset += LOCATE_CONCURRENCY
    ) {
      const batch = uniqueBases.slice(offset, offset + LOCATE_CONCURRENCY)
      const located = await Promise.all(
        batch.map(base => this.locate(sessionRoot, base, requestedPath)),
      )
      candidates.push(...located.filter(candidate => candidate !== null))
    }

    return candidates.slice(0, MAX_RESULTS)
  }

  private async toLocated(
    sessionRoot: string,
    root: string,
    target: string,
  ): Promise<LocatedExplorerDocument | null> {
    if (!within(sessionRoot, target)) return null
    try {
      const canonicalPath = await realpath(target)
      if (!within(sessionRoot, canonicalPath) || !(await stat(canonicalPath)).isFile()) return null
      const metadata = await this.documents.describe(sessionRoot, normalizedRelative(sessionRoot, canonicalPath))
      return {
        ...metadata,
        absolutePath: canonicalPath,
        canonicalPath,
        root: normalizedRelative(sessionRoot, root),
      }
    }
    catch {
      return null
    }
  }

  private async discoverRoots(sessionRoot: string): Promise<string[]> {
    const cached = this.rootCache.get(sessionRoot)
    if (cached && cached.expiresAt > Date.now()) return cached.roots

    const roots = new Set<string>([sessionRoot])
    const queue: Array<{ path: string, depth: number }> = [{ path: sessionRoot, depth: 0 }]
    const startedAt = Date.now()
    let visited = 0

    while (queue.length > 0 && visited < MAX_DIRECTORIES && Date.now() - startedAt < MAX_SCAN_MS) {
      const current = queue.shift()!
      visited += 1
      let entries
      try {
        entries = await readdir(current.path, { withFileTypes: true })
      }
      catch {
        continue
      }

      if (entries.some(entry => ROOT_MARKERS.has(entry.name))) {
        roots.add(current.path)
      }
      if (current.depth >= MAX_DEPTH) continue

      for (const entry of entries) {
        if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue
        queue.push({ path: join(current.path, entry.name), depth: current.depth + 1 })
      }
    }

    const discovered = [...roots]
    this.rootCache.set(sessionRoot, { expiresAt: Date.now() + 30_000, roots: discovered })
    return discovered
  }

  private async findSuffixCandidates(
    sessionRoot: string,
    requestedPath: string,
  ): Promise<LocatedExplorerDocument[]> {
    const candidates: LocatedExplorerDocument[] = []
    const queue: Array<{ path: string, depth: number }> = [{ path: sessionRoot, depth: 0 }]
    const startedAt = Date.now()
    let visited = 0

    while (
      queue.length > 0
      && visited < MAX_DIRECTORIES
      && candidates.length < MAX_RESULTS
      && Date.now() - startedAt < MAX_SCAN_MS
    ) {
      const current = queue.shift()!
      visited += 1
      const candidate = await this.toLocated(
        sessionRoot,
        current.path,
        resolve(current.path, requestedPath),
      )
      if (candidate) candidates.push(candidate)
      if (current.depth >= MAX_DEPTH) continue

      let entries
      try {
        entries = await readdir(current.path, { withFileTypes: true })
      }
      catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue
        queue.push({ path: join(current.path, entry.name), depth: current.depth + 1 })
      }
    }

    return candidates
  }
}
