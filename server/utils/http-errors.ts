import { createError } from 'h3'
import { SessionError } from '../modules/sessions/model/session-error'

export function rethrowSessionError(error: unknown): never {
  if (error instanceof SessionError) {
    throw createError({
      statusCode: 400,
      statusMessage: error.message,
      data: error.causeText,
    })
  }

  throw error
}
