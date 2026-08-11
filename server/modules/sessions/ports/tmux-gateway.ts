import type { TmuxPane, TmuxWindow } from '#shared/contracts/terminal'

export interface DiscoveredTmuxSession {
  name: string
  path: string
  sessionId?: string
}

export interface WindowClientSession {
  helperSessionName: string
  sessionName: string
  windowIndex: number
}

export interface TmuxPaneViewport {
  cursorVisible: boolean
  cursorX: number
  cursorY: number
  data: string
  inMode: boolean
  scrollPosition: number
}

export interface TmuxGateway {
  capturePaneViewport(paneId: unknown): Promise<TmuxPaneViewport>
  captureWindowSnapshot(name: string, index: unknown, lines?: number, paneId?: unknown): Promise<string>
  clearSessionId(name: string): Promise<void>
  createSession(name: string, path: string): Promise<void>
  createWindow(name: string, path: string): Promise<TmuxWindow>
  createWindowClientSession(name: string, index: unknown): Promise<WindowClientSession>
  displaySessionPath(name: string): Promise<string | null>
  findSessionNameByWindowId(windowId: string): Promise<string | null>
  killAllBitveinsHelpers(): Promise<void>
  killSession(name: string): Promise<void>
  killBitveinsHelperSession(name: string): Promise<void>
  killBitveinsHelpersForBase(name: string): Promise<void>
  killStaleBitveinsHelpers(activeHelpers?: ReadonlySet<string>, owner?: string): Promise<void>
  killWindow(name: string, index: unknown): Promise<void>
  listSessions(): Promise<DiscoveredTmuxSession[]>
  listPanes(name: string, index: unknown): Promise<TmuxPane[]>
  listWindows(name: string): Promise<TmuxWindow[]>
  prepareTerminalWheel(name: string, direction: 'down' | 'up', lineCount?: 1): Promise<boolean>
  resetTerminalScroll(name: string): Promise<void>
  renameSession(name: string, nextName: string): Promise<void>
  renameWindow(name: string, index: unknown, nextName: string): Promise<TmuxWindow | null>
  resizePane(name: string, index: unknown, paneId: unknown, dimension: 'height' | 'width', size: unknown): Promise<TmuxPane[]>
  selectWindow(name: string, index: unknown): Promise<void>
  setSessionId(name: string, id: string): Promise<void>
  splitWindow(name: string, index: unknown, paneId: unknown, direction: 'horizontal' | 'vertical'): Promise<TmuxPane[]>
  killPane(name: string, index: unknown, paneId: unknown): Promise<TmuxPane[]>
  selectPane(name: string, index: unknown, paneId: unknown): Promise<void>
  sendPaneInput(paneId: unknown, data: string): Promise<void>
  sendPaneInputBinary(paneId: unknown, data: string): Promise<void>
}
