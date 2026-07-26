import { createError } from 'h3'
import { WorkspaceDocumentError } from '../model/workspace-document'

const ERROR_STATUS = {
  'not-found': 404,
  'not-file': 400,
  'outside-workspace': 403,
  'unsupported-image': 415,
  'too-large': 413,
  'binary': 415,
} as const

export function throwWorkspaceDocumentHttpError(error: unknown): never {
  if (error instanceof WorkspaceDocumentError) {
    throw createError({
      statusCode: ERROR_STATUS[error.code],
      statusMessage: error.message,
    })
  }
  throw error
}
