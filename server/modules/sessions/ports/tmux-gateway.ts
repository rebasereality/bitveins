import type { TmuxSession, TmuxWindow } from '#shared/contracts/terminal'

export interface WindowClientSession {
  helperSessionName: string
  sessionName: string
  windowIndex: number
}

export interface TmuxGateway {
  captureWindowSnapshot(name: string, index: unknown, lines?: number): Promise<string>
  createSession(name: string, path: string): Promise<void>
  createWindow(name: string, path: string): Promise<TmuxWindow>
  createWindowClientSession(name: string, index: unknown): Promise<WindowClientSession>
  displaySessionPath(name: string): Promise<string | null>
  killAllBitveinsHelpers(): Promise<void>
  killSession(name: string): Promise<void>
  killBitveinsHelperSession(name: string): Promise<void>
  killBitveinsHelpersForBase(name: string): Promise<void>
  killStaleBitveinsHelpers(activeHelpers?: ReadonlySet<string>, owner?: string): Promise<void>
  killWindow(name: string, index: unknown): Promise<void>
  listSessions(): Promise<TmuxSession[]>
  listWindows(name: string): Promise<TmuxWindow[]>
  prepareTerminalWheel(name: string, direction: 'down' | 'up'): Promise<boolean>
  resetTerminalScroll(name: string): Promise<void>
  renameSession(name: string, nextName: string): Promise<void>
  renameWindow(name: string, index: unknown, nextName: string): Promise<TmuxWindow | null>
  selectWindow(name: string, index: unknown): Promise<void>
}
