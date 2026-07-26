import type { PtyProcess } from './pty-factory'

export interface TerminalAttachmentSize {
  cols: number
  rows: number
}

export interface TerminalAttachmentProcessFactory {
  attach(sessionName: string, size: TerminalAttachmentSize): PtyProcess
}
