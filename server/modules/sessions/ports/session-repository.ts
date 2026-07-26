export interface SessionRepository {
  deletePath(name: string): void
  findPath(name: string): string | null
  renamePath(currentName: string, nextName: string, path: string, now: number): void
  savePath(name: string, path: string, now: number): void
}
