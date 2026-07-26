declare module '#auth-utils' {
  interface User {
    id: 'bitveins'
    login: 'bitveins'
  }

  interface UserSession {
    authVersion?: string
    loggedInAt?: number
  }
}

export {}
