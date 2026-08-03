import type { TmuxSession, TmuxWindow } from '#shared/contracts/terminal'
import { SessionError } from '../../model/session-error'
import {
  isMissingTmuxServerError,
  parseBitveinsHelperSessions,
  parseTmuxSessions,
  parseTmuxWindows,
  parseTmuxWindowsWithPanePids,
} from './tmux-output'
import {
  BITVEINS_SESSION_PREFIX,
  normalizeHelperSessionName,
  normalizeSessionName,
  normalizeTerminalTargetName,
  normalizeWindowIndex,
  normalizeWindowName,
} from '../../model/session-validation'
import type { TmuxGateway, WindowClientSession } from '../../ports/tmux-gateway'
import type { CommandRunner } from './command-runner'

interface TmuxCliAdapterOptions {
  clock?: () => number
  helperOwner: string
  randomId?: () => string
  runner: CommandRunner
  socketName?: string
}

const TMUX_TIMEOUT_MS = 10_000
const TMUX_MAX_BUFFER = 1024 * 1024

export class TmuxCliAdapter implements TmuxGateway {
  private readonly clock: () => number
  private readonly randomId: () => string

  constructor(private readonly options: TmuxCliAdapterOptions) {
    this.clock = options.clock ?? Date.now
    this.randomId = options.randomId ?? (() => Math.random().toString(36).slice(2, 8))
  }

  async listSessions(): Promise<TmuxSession[]> {
    try {
      return parseTmuxSessions(await this.run(['ls', '-F', '#{session_name}|#{session_path}']))
    }
    catch (error) {
      if (this.isMissingServer(error)) return []
      throw error
    }
  }

  async createSession(name: string, path: string): Promise<void> {
    await this.run(['new-session', '-d', '-s', normalizeSessionName(name), '-c', path])
  }

  async killSession(name: string): Promise<void> {
    await this.run(['kill-session', '-t', normalizeSessionName(name)])
  }

  async renameSession(name: string, nextName: string): Promise<void> {
    await this.run(['rename-session', '-t', normalizeSessionName(name), normalizeSessionName(nextName)])
  }

  async listWindows(name: string): Promise<TmuxWindow[]> {
    try {
      const windows = parseTmuxWindowsWithPanePids(await this.run([
        'list-windows',
        '-t',
        normalizeSessionName(name),
        '-F',
        '#{window_id}|#{window_index}|#{window_name}|#{window_active}|#{pane_pid}|#{pane_current_path}',
      ]))
      return this.withDetectedApplications(windows)
    }
    catch (error) {
      if (this.isMissingServer(error)) return []
      throw error
    }
  }

  async selectWindow(name: string, index: unknown): Promise<void> {
    await this.run(['select-window', '-t', `${normalizeSessionName(name)}:${normalizeWindowIndex(index)}`])
  }

  async createWindow(name: string, path: string): Promise<TmuxWindow> {
    const stdout = await this.run([
      'new-window',
      '-P',
      '-F',
      '#{window_id}|#{window_index}|#{window_name}|#{window_active}|#{pane_current_path}',
      '-t',
      normalizeSessionName(name),
      '-c',
      path,
    ])
    const [window] = parseTmuxWindows(stdout)

    if (!window) {
      throw new SessionError('tmux did not report the newly created window.')
    }

    return window
  }

  async killWindow(name: string, index: unknown): Promise<void> {
    await this.run(['kill-window', '-t', `${normalizeSessionName(name)}:${normalizeWindowIndex(index)}`])
  }

  async renameWindow(name: string, index: unknown, nextName: string): Promise<TmuxWindow | null> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    await this.run(['rename-window', '-t', `${sessionName}:${windowIndex}`, normalizeWindowName(nextName)])
    return (await this.listWindows(sessionName)).find(window => window.index === windowIndex) ?? null
  }

  async createWindowClientSession(name: string, index: unknown): Promise<WindowClientSession> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    const helperSessionName = `${BITVEINS_SESSION_PREFIX}${process.pid}_${this.clock().toString(36)}_${this.randomId()}`

    try {
      await this.run([
        'new-session', '-d', '-s', helperSessionName, '-t', sessionName, ';',
        'set-option', '-t', helperSessionName, '@bitveins_helper', '1', ';',
        'set-option', '-t', helperSessionName, '@bitveins_base', sessionName, ';',
        'set-option', '-t', helperSessionName, '@bitveins_owner', this.options.helperOwner, ';',
        'set-option', '-t', helperSessionName, 'status-left', `[${sessionName}] `, ';',
        'select-window', '-t', `${helperSessionName}:${windowIndex}`,
      ])
    }
    catch (error) {
      await this.killBitveinsHelperSession(helperSessionName).catch(() => undefined)
      throw error
    }

    return { helperSessionName, sessionName, windowIndex }
  }

  async captureWindowSnapshot(name: string, index: unknown, lines = 2000): Promise<string> {
    const start = `-${Math.max(1, Math.min(20_000, Math.floor(lines)))}`
    return this.run([
      'capture-pane',
      '-e',
      '-p',
      '-J',
      '-S',
      start,
      '-t',
      `${normalizeSessionName(name)}:${normalizeWindowIndex(index)}`,
    ])
  }

  async displaySessionPath(name: string): Promise<string | null> {
    try {
      const path = (await this.run([
        'display-message',
        '-p',
        '-t',
        normalizeSessionName(name),
        '#{session_path}',
      ])).trim()
      return path || null
    }
    catch (error) {
      if (this.isMissingServer(error)) return null
      throw error
    }
  }

  async prepareTerminalWheel(name: string, direction: 'down' | 'up'): Promise<boolean> {
    const sessionName = normalizeTerminalTargetName(name)
    const [paneInMode, mouseAnyFlag] = (await this.run([
      'display-message',
      '-p',
      '-t',
      sessionName,
      '#{pane_in_mode}|#{mouse_any_flag}',
    ])).trim().split('|')

    if (paneInMode === '1') {
      await this.run(['send-keys', '-N', '5', '-X', '-t', sessionName, `scroll-${direction}`])
      return true
    }
    if (mouseAnyFlag === '1' || direction === 'down') return false

    try {
      await this.run(['copy-mode', '-eH', '-t', sessionName])
    }
    catch (error) {
      if (
        !(error instanceof SessionError)
        || !error.causeText?.includes('copy-mode: unknown flag -H')
      ) {
        throw error
      }
      await this.run(['copy-mode', '-e', '-t', sessionName])
    }
    await this.run(['send-keys', '-N', '5', '-X', '-t', sessionName, 'scroll-up'])
    return true
  }

  async resetTerminalScroll(name: string): Promise<void> {
    const sessionName = normalizeTerminalTargetName(name)
    const paneInMode = (await this.run([
      'display-message',
      '-p',
      '-t',
      sessionName,
      '#{pane_in_mode}',
    ])).trim()

    if (paneInMode === '1') {
      await this.run(['send-keys', '-X', '-t', sessionName, 'cancel'])
    }
  }

  async killBitveinsHelperSession(name: string): Promise<void> {
    await this.run(['kill-session', '-t', normalizeHelperSessionName(name)])
  }

  async killBitveinsHelpersForBase(name: string): Promise<void> {
    const sessionName = normalizeSessionName(name)
    const helpers = await this.listBitveinsHelperSessions()
    await Promise.all(helpers
      .filter(helper => helper.base === sessionName)
      .map(helper => this.killBitveinsHelperSession(helper.name).catch(() => undefined)))
  }

  async killStaleBitveinsHelpers(
    activeHelpers: ReadonlySet<string> = new Set(),
    owner = this.options.helperOwner,
  ): Promise<void> {
    const helpers = await this.listBitveinsHelperSessions()
    await Promise.all(helpers
      .filter(helper => (!helper.owner || helper.owner === owner) && !activeHelpers.has(helper.name))
      .map(helper => this.killBitveinsHelperSession(helper.name).catch(() => undefined)))
  }

  async killAllBitveinsHelpers(): Promise<void> {
    const helpers = await this.listBitveinsHelperSessions()
    await Promise.all(helpers
      .map(helper => this.killBitveinsHelperSession(helper.name).catch(() => undefined)))
  }

  private async listBitveinsHelperSessions() {
    try {
      return parseBitveinsHelperSessions(await this.run([
        'list-sessions',
        '-F',
        '#{session_name}|#{@bitveins_helper}|#{@bitveins_base}|#{@bitveins_owner}',
      ]))
    }
    catch (error) {
      if (this.isMissingServer(error)) return []
      throw error
    }
  }

  private isMissingServer(error: unknown): boolean {
    return error instanceof SessionError && isMissingTmuxServerError(error.causeText)
  }

  private async withDetectedApplications(
    windows: ReturnType<typeof parseTmuxWindowsWithPanePids>,
  ): Promise<TmuxWindow[]> {
    if (!windows.some(window => window.panePid !== null)) {
      return windows.map(({ window }) => window)
    }

    try {
      const { stdout } = await this.options.runner.run(
        'ps',
        ['-eo', 'pid=,tpgid=,comm='],
        { maxBuffer: TMUX_MAX_BUFFER, timeoutMs: TMUX_TIMEOUT_MS },
      )
      const processes = new Map<number, { command: string, foregroundPid: number }>()

      for (const line of stdout.split('\n')) {
        const match = line.match(/^\s*(\d+)\s+(-?\d+)\s+(\S+)\s*$/)
        if (!match) continue
        processes.set(Number(match[1]), {
          command: match[3]!,
          foregroundPid: Number(match[2]),
        })
      }

      return windows.map(({ panePid, window }) => {
        const paneProcess = panePid === null ? undefined : processes.get(panePid)
        const foregroundProcess = paneProcess
          ? processes.get(paneProcess.foregroundPid)
          : undefined

        return foregroundProcess?.command === 'hermes'
          ? { ...window, application: 'hermes' as const }
          : window
      })
    }
    catch {
      return windows.map(({ window }) => window)
    }
  }

  private async run(args: readonly string[]): Promise<string> {
    const socketArgs = this.options.socketName ? ['-L', this.options.socketName] : []

    try {
      return (await this.options.runner.run('tmux', [...socketArgs, ...args], {
        maxBuffer: TMUX_MAX_BUFFER,
        timeoutMs: TMUX_TIMEOUT_MS,
      })).stdout
    }
    catch (error) {
      const causeText = error instanceof Error ? error.message : String(error)
      throw new SessionError('tmux command failed.', causeText)
    }
  }
}
