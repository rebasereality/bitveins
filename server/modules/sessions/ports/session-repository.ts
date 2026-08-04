export interface PersistedSession {
  createdAt: number
  id: string
  name: string
  path: string
  tmuxBound: boolean
}

export interface SessionRepository {
  clearSessionIdInvalid(id: string): void
  deletePath(name: string): void
  findById(id: string): PersistedSession | null
  findByName(name: string): PersistedSession | null
  findPath(name: string): string | null
  isSessionIdInvalid(id: string): boolean
  list(): PersistedSession[]
  markSessionIdInvalid(id: string, invalidatedAt: number): void
  renamePath(currentName: string, nextName: string, path: string): void
  saveIdentity(session: PersistedSession): void
  savePath(name: string, path: string, now: number, id?: string): void
}
