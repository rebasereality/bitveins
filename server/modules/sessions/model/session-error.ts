export class SessionError extends Error {
  constructor(message: string, public readonly causeText?: string) {
    super(message)
    this.name = 'SessionError'
  }
}
