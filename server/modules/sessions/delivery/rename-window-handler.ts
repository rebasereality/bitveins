import { renameWindowBodySchema } from '#shared/contracts/api'
import { rethrowSessionError } from '../../../utils/http-errors'
import { parseRequest } from '../../../utils/request-validation'
import type { TmuxWindow } from '#shared/contracts/terminal'

interface RenameWindowOperations {
  renameWindow(name: string, index: unknown, nextName: string): Promise<TmuxWindow | null>
}

export interface RenameWindowRequest {
  body: unknown
  index?: string
  sessionName?: string
}

export function createRenameWindowHandler(sessions: RenameWindowOperations) {
  return async (request: RenameWindowRequest) => {
    try {
      const body = parseRequest(renameWindowBodySchema, request.body)

      return {
        window: await sessions.renameWindow(
          request.sessionName ?? '',
          request.index,
          body.name,
        ),
      }
    }
    catch (error: unknown) {
      rethrowSessionError(error)
    }
  }
}
