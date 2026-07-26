import type { HistoryMessage } from '#shared/contracts/terminal'
import { SessionError } from '../../sessions/model/session-error'
import {
  normalizeHistoryScope,
  type HistoryScopeInput,
} from '../model/history-scope'
import type { HistoryRepository } from '../ports/history-repository'

interface HistoryServiceOptions {
  clock?: () => number
  repository: HistoryRepository
}

export class HistoryService {
  private readonly clock: () => number

  constructor(private readonly options: HistoryServiceOptions) {
    this.clock = options.clock ?? Date.now
  }

  listMessages(scope: HistoryScopeInput): HistoryMessage[] {
    return this.options.repository.list(normalizeHistoryScope(scope))
  }

  saveMessage(scope: HistoryScopeInput, message: string): HistoryMessage {
    const normalizedMessage = message.trimEnd()

    if (!normalizedMessage) {
      throw new SessionError('History message is required.')
    }

    return this.options.repository.save(
      normalizeHistoryScope(scope),
      normalizedMessage,
      this.clock(),
    )
  }
}
