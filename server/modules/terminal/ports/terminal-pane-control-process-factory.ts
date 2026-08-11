import type { Disposable, PtyExitEvent } from './pty-factory'
import type { TerminalAttachmentSize } from './terminal-attachment-process-factory'

export interface TerminalPaneControlTarget {
  paneId: string
  sessionName: string
  windowIndex: number
}

export interface TerminalPaneControlProcess {
  activate(): void
  kill(): void
  onData(listener: (data: string) => void): Disposable
  onExit(listener: (event: PtyExitEvent) => void): Disposable
  resize(columns: number, rows: number): void
}

export interface TerminalPaneControlProcessFactory {
  attach(target: TerminalPaneControlTarget, size: TerminalAttachmentSize): TerminalPaneControlProcess
}
