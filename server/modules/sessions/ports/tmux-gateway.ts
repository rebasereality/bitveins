import type { TmuxWindow } from '#shared/contracts/terminal'

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

export interface TmuxGateway {
  captureWindowSnapshot(name: string, index: unknown, lines?: number): Promise<string>
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
  listWindows(name: string): Promise<TmuxWindow[]>
  prepareTerminalWheel(name: string, direction: 'down' | 'up', lineCount?: 1): Promise<boolean>
  resetTerminalScroll(name: string): Promise<void>
  renameSession(name: string, nextName: string): Promise<void>
  renameWindow(name: string, index: unknown, nextName: string): Promise<TmuxWindow | null>
  selectWindow(name: string, index: unknown): Promise<void>
  setSessionId(name: string, id: string): Promise<void>
}
