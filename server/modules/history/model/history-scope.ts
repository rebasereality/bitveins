import { SessionError } from '../../sessions/model/session-error'
import { normalizeSessionName } from '../../sessions/model/session-validation'

export interface HistoryScope {
  sessionName: string
  windowId: string
  windowIndex: number
}

export interface HistoryScopeInput {
  sessionName: unknown
  windowId: unknown
  windowIndex: unknown
}

function normalizeWindowId(windowId: unknown): string {
  if (typeof windowId !== 'string' || !/^@\d+$/.test(windowId)) {
    throw new SessionError('A valid tmux window id is required.')
  }

  return windowId
}

function normalizeWindowIndex(windowIndex: unknown): number {
  const parsed = typeof windowIndex === 'number' ? windowIndex : Number(windowIndex)

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
    throw new SessionError('A valid tmux window index is required.')
  }

  return parsed
}

export function normalizeHistoryScope(scope: HistoryScopeInput): HistoryScope {
  return {
    sessionName: normalizeSessionName(scope.sessionName),
    windowId: normalizeWindowId(scope.windowId),
    windowIndex: normalizeWindowIndex(scope.windowIndex),
  }
}
