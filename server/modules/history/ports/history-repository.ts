import type { HistoryMessage } from '#shared/contracts/terminal'
import type { HistoryScope } from '../model/history-scope'

export interface HistoryRepository {
  list(scope: HistoryScope): HistoryMessage[]
  save(scope: HistoryScope, message: string, createdAt: number): HistoryMessage
}
