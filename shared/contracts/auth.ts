export interface AuthSessionResponse {
  authenticated: boolean
  linuxUsername: string | null
  loggedInAt: number | null
}
