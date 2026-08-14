import type { PromptDraftRepository } from '../../sessions/ports/prompt-draft-repository'
import type { TmuxPaneViewport } from '../../sessions/ports/tmux-gateway'
import type { Disposable, PtyProcess } from '../ports/pty-factory'
import type { TerminalAttachmentProcessFactory } from '../ports/terminal-attachment-process-factory'
import type {
  TerminalPaneControlProcess,
  TerminalPaneControlProcessFactory,
} from '../ports/terminal-pane-control-process-factory'
import type { ServerMessage } from '#shared/contracts/terminal'

export interface ReliableInputDeduplicator {
  deliver(
    id: string,
    target: string,
    operation: () => Promise<void> | void,
  ): Promise<void>
}

export interface TerminalSessionOperations {
  applyClientAppearance?(sessionName: string, appearance: 'dark' | 'light'): Promise<void>
  capturePaneViewport(paneId: unknown): Promise<TmuxPaneViewport>
  createWindow(name: string): Promise<unknown>
  createWindowClientSession(name: string, index: unknown): Promise<{
    helperSessionName: string
    sessionName: string
    windowIndex: number
  }>
  killBitveinsHelperSession(name: string): Promise<void>
  killWindow(name: string, index: unknown): Promise<void>
  listPanes(name: string, index: unknown): Promise<Array<{ id: string }>>
  prepareTerminalWheel(sessionName: string, direction: 'down' | 'up', lineCount?: 1): Promise<boolean>
  resetTerminalScroll(sessionName: string): Promise<void>
  selectWindow(name: string, index: unknown): Promise<void>
  sendPaneInput(paneId: unknown, data: string): Promise<void>
  sendPaneInputBinary(paneId: unknown, data: string): Promise<void>
}

export interface TerminalPeerSessionOptions {
  attachmentProcesses: TerminalAttachmentProcessFactory
  paneControlProcesses: TerminalPaneControlProcessFactory
  broadcastPromptDraft?: (draft: {
    clientId: string
    draft: string
    revision: number
    sessionName: string
    updatedAt: number
    windowId: string
  }) => void
  broadcastPromptDraftCleared?: (info: {
    clientId: string
    sessionName: string
    windowId: string
  }) => void
  broadcastPromptFocusClaimed?: (info: {
    clientId: string
    sessionName: string
    windowId: string
  }) => void
  broadcastPromptFocusReleased?: (info: {
    clientId: string
    sessionName: string
    windowId: string
  }) => void
  onHelperActivated: (name: string) => void
  onHelperReleased: (name: string) => void
  promptDrafts?: PromptDraftRepository
  reliableInputs: ReliableInputDeduplicator
  send: (message: ServerMessage) => void
  sessions: TerminalSessionOperations
  wait?: (delay: number) => Promise<void>
}

export interface Attachment {
  dataSubscription?: Disposable
  exitSubscription?: Disposable
  helperReleased: boolean
  helperSessionName?: string
  label: string
  paneId?: string
  process: PtyProcess | TerminalPaneControlProcess
  reliableInputTarget: string
  scrollActive?: boolean
  tmuxTarget: string
}
