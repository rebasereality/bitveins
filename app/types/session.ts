export type {
  HistoryMessage,
  ServerMessage,
  TmuxSession,
  TmuxWindow,
} from '#shared/contracts/terminal'

export type InputMode = 'async' | 'live'

export type TerminalConnectionState = 'attached' | 'attaching' | 'connecting' | 'detached' | 'offline' | 'reconnecting'
