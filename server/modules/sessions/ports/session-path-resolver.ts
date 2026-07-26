export interface SessionPathResolver {
  normalize(path: string): string
}
