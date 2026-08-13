import { createError } from 'h3'
import { GitViewerError } from '../model/git-error'

export function throwGitViewerHttpError(error: unknown): never {
  if (!(error instanceof GitViewerError)) throw error

  const statusCode = error.code === 'not-repository'
    ? 404
    : error.code === 'too-large'
      ? 413
      : 404
  throw createError({ statusCode, statusMessage: error.message })
}
