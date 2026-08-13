export type GitErrorCode = 'not-repository' | 'commit-not-found' | 'file-not-found' | 'too-large'

export class GitViewerError extends Error {
  constructor(
    readonly code: GitErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'GitViewerError'
  }
}
