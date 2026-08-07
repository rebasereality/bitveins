export interface PushSessionMuteRepository {
  isMuted(endpoint: string, sessionId: string): boolean
  list(endpoint: string): string[]
  removeEndpoint(endpoint: string): void
  setMuted(endpoint: string, sessionId: string, muted: boolean, now: number): boolean
}
