interface RootPreferenceState {
  version: 1
  roots: Record<string, string>
}

export interface RootPreferenceStorage {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

const STORAGE_KEY = 'bitveins.pathLinkRoots'

function cleanRoot(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const root = value.trim().replaceAll('\\', '/').replace(/^\.\/+/, '')
  if (
    root.length > 4096
    || root.startsWith('/')
    || root.split('/').includes('..')
  ) {
    return null
  }
  return root || '.'
}

function emptyState(): RootPreferenceState {
  return { version: 1, roots: {} }
}

export function pathLinkRootScope(sessionName: string, windowId: string): string {
  return `${sessionName}\u0000${windowId}`
}

export class PathLinkRootRepository {
  constructor(private readonly storage: RootPreferenceStorage) {}

  get(scope: string): string | null {
    return this.read().roots[scope] ?? null
  }

  hasAny(): boolean {
    return Object.keys(this.read().roots).length > 0
  }

  set(scope: string, root: string): boolean {
    const clean = cleanRoot(root)
    if (!clean) return false
    const state = this.read()
    state.roots[scope] = clean
    this.write(state)
    return true
  }

  forget(scope: string): void {
    const state = this.read()
    const { [scope]: _forgotten, ...roots } = state.roots
    this.write({ ...state, roots })
  }

  forgetAll(): void {
    this.storage.removeItem(STORAGE_KEY)
  }

  private read(): RootPreferenceState {
    const raw = this.storage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()

    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || !('version' in parsed) || parsed.version !== 1 || !('roots' in parsed)) {
        return emptyState()
      }
      if (typeof parsed.roots !== 'object' || parsed.roots === null || Array.isArray(parsed.roots)) {
        return emptyState()
      }

      const roots: Record<string, string> = {}
      for (const [scope, value] of Object.entries(parsed.roots)) {
        const root = cleanRoot(value)
        if (root) roots[scope] = root
      }
      return { version: 1, roots }
    }
    catch {
      return emptyState()
    }
  }

  private write(state: RootPreferenceState): void {
    if (Object.keys(state.roots).length === 0) {
      this.storage.removeItem(STORAGE_KEY)
      return
    }
    this.storage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
}
