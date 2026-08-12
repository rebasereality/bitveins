import type { TmuxPane, TmuxWindow } from '#shared/contracts/terminal'
import type { TmuxAgent } from '#shared/contracts/agents'
import { tmuxAgentLabelSchema } from '#shared/contracts/agents'
import { classifyAgentScreenStatus, stripAgentActivityGlyph } from '../../../agents/model/agent-screen-status'
import { detectAgentProcess, tmuxAgentDisplayName } from '../../../agents/model/agent-process-detection'
import { normalizeTmuxAgentTitle, parseTmuxAgentPaneCandidates } from '../../../agents/adapters/tmux-agent-output'
import { SessionError } from '../../model/session-error'
import {
  isMissingTmuxServerError,
  parseBitveinsHelperSessions,
  parseTmuxSessions,
  parseTmuxPanes,
  parseTmuxWindows,
  parseTmuxWindowsWithPanePids,
} from './tmux-output'
import {
  BITVEINS_SESSION_PREFIX,
  normalizeHelperSessionName,
  normalizePaneId,
  normalizePaneSize,
  normalizeSessionName,
  normalizeTerminalTarget,
  normalizeWindowId,
  normalizeWindowIndex,
  normalizeWindowName,
} from '../../model/session-validation'
import type { DiscoveredTmuxSession, TmuxGateway, WindowClientSession } from '../../ports/tmux-gateway'
import type { CommandRunner } from './command-runner'
import { captureTmuxPaneViewport } from './tmux-pane-viewport'

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

  async listSessions(): Promise<DiscoveredTmuxSession[]> {
    try {
      return parseTmuxSessions(await this.run(['ls', '-F', '#{session_name}|#{@bitveins_session_id}|#{session_path}']))
    }
    catch (error) {
      if (this.isMissingServer(error)) return []
      throw error
    }
  }

  async findSessionNameByWindowId(id: string): Promise<string | null> {
    const windowId = normalizeWindowId(id)
    try {
      const output = await this.run([
        'list-windows',
        '-a',
        '-F',
        '#{session_name}|#{window_id}',
      ])
      const sessionNames = new Set<string>()
      for (const line of output.split('\n')) {
        const match = /^(.*)\|(@\d+)$/.exec(line.trim())
        if (!match || match[2] !== windowId) continue

        try {
          sessionNames.add(normalizeSessionName(match[1]))
        }
        catch {
          // Ignore helper and externally-created session names outside Bitveins' contract.
        }
      }

      return sessionNames.size === 1 ? sessionNames.values().next().value ?? null : null
    }
    catch (error) {
      if (this.isMissingServer(error)) return null
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

  async setSessionId(name: string, id: string): Promise<void> {
    await this.run(['set-option', '-t', normalizeSessionName(name), '@bitveins_session_id', id])
  }

  async clearSessionId(name: string): Promise<void> {
    await this.run(['set-option', '-u', '-t', normalizeSessionName(name), '@bitveins_session_id'])
  }

  async listWindows(name: string): Promise<TmuxWindow[]> {
    try {
      const windows = parseTmuxWindowsWithPanePids(await this.run([
        'list-windows',
        '-t',
        normalizeSessionName(name),
        '-F',
        '#{window_id}|#{window_index}|#{window_name}|#{window_active}|#{pane_pid}|#{window_panes}|#{pane_current_path}',
      ]))
      return this.withDetectedApplications(windows)
    }
    catch (error) {
      if (this.isMissingServer(error)) return []
      throw error
    }
  }

  async listPanes(name: string, index: unknown): Promise<TmuxPane[]> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    const panes = parseTmuxPanes(await this.run([
      'list-panes', '-t', `${sessionName}:${windowIndex}`, '-F',
      '#{pane_id}|#{pane_index}|#{pane_active}|#{pane_left}|#{pane_top}|#{pane_width}|#{pane_height}|#{window_width}|#{window_height}|#{pane_pid}|#{pane_current_path}',
    ]))
    return this.withDetectedPaneApplications(panes)
  }

  async listAgents(): Promise<TmuxAgent[]> {
    let candidates
    try {
      candidates = parseTmuxAgentPaneCandidates(await this.run([
        'list-panes', '-a', '-F',
        '#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_pid}\t#{pane_dead}\t#{@bitveins_agent_label}\t#{pane_current_path}',
      ]))
    }
    catch (error) {
      if (this.isMissingServer(error)) return []
      throw error
    }
    if (candidates.length === 0) return []

    let processSnapshot = ''
    try {
      processSnapshot = (await this.options.runner.run(
        'ps',
        ['-eo', 'pid=,ppid=,pgid=,tpgid=,args='],
        { maxBuffer: TMUX_MAX_BUFFER, timeoutMs: TMUX_TIMEOUT_MS },
      )).stdout
    }
    catch {
      return []
    }

    const detected = candidates.flatMap((candidate) => {
      const process = detectAgentProcess(candidate.panePid, processSnapshot)
      return process ? [{ candidate, process }] : []
    })

    const agents = await Promise.all(detected.map(async ({ candidate, process }) => {
      const [rawTitle, screen] = await Promise.all([
        this.run(['display-message', '-p', '-t', candidate.paneId, '#{pane_title}']).catch(() => ''),
        this.run(['capture-pane', '-e', '-p', '-J', '-t', candidate.paneId]).catch(() => null),
      ])
      const title = stripAgentActivityGlyph(normalizeTmuxAgentTitle(rawTitle) ?? '')
      const defaultLabel = title || candidate.windowName || tmuxAgentDisplayName(process.kind)
      const label = candidate.customLabel ?? defaultLabel
      return {
        ...(candidate.customLabel ? { customLabel: candidate.customLabel } : {}),
        defaultLabel,
        id: candidate.paneId,
        kind: process.kind,
        label,
        paneId: candidate.paneId,
        paneIndex: candidate.paneIndex,
        path: candidate.path,
        sessionName: candidate.sessionName,
        status: classifyAgentScreenStatus(process.kind, rawTitle, screen),
        windowId: candidate.windowId,
        windowIndex: candidate.windowIndex,
        windowName: candidate.windowName,
      } satisfies TmuxAgent
    }))

    return agents.sort((left, right) => (
      left.sessionName.localeCompare(right.sessionName)
      || left.windowIndex - right.windowIndex
      || left.paneIndex - right.paneIndex
    ))
  }

  async selectWindow(name: string, index: unknown): Promise<void> {
    await this.run(['select-window', '-t', `${normalizeSessionName(name)}:${normalizeWindowIndex(index)}`])
  }

  async createWindow(name: string, path: string): Promise<TmuxWindow> {
    const stdout = await this.run([
      'new-window',
      '-P',
      '-F',
      '#{window_id}|#{window_index}|#{window_name}|#{window_active}|#{window_panes}|#{pane_current_path}',
      '-t',
      `${normalizeSessionName(name)}:`,
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

  async splitWindow(
    name: string,
    index: unknown,
    paneId: unknown,
    direction: 'horizontal' | 'vertical',
  ): Promise<TmuxPane[]> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    const target = normalizePaneId(paneId)
    const panes = await this.listPanes(sessionName, windowIndex)
    if (!panes.some(pane => pane.id === target)) throw new SessionError('Tmux pane is no longer available.')
    const flag = direction === 'horizontal' ? '-h' : '-v'
    await this.run(['split-window', flag, '-c', '#{pane_current_path}', '-t', target])
    return this.listPanes(sessionName, windowIndex)
  }

  async killPane(name: string, index: unknown, paneId: unknown): Promise<TmuxPane[]> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    const target = normalizePaneId(paneId)
    const panes = await this.listPanes(sessionName, windowIndex)
    if (panes.length <= 1) throw new SessionError('The final pane cannot be closed.')
    if (!panes.some(pane => pane.id === target)) throw new SessionError('Tmux pane is no longer available.')
    await this.run(['kill-pane', '-t', target])
    return this.listPanes(sessionName, windowIndex)
  }

  async selectPane(name: string, index: unknown, paneId: unknown): Promise<void> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    const target = normalizePaneId(paneId)
    const panes = await this.listPanes(sessionName, windowIndex)
    if (!panes.some(pane => pane.id === target)) throw new SessionError('Tmux pane is no longer available.')
    await this.run(['select-pane', '-t', target])
  }

  async resizePane(
    name: string,
    index: unknown,
    paneId: unknown,
    dimension: 'height' | 'width',
    size: unknown,
  ): Promise<TmuxPane[]> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    const target = normalizePaneId(paneId)
    const panes = await this.listPanes(sessionName, windowIndex)
    if (!panes.some(pane => pane.id === target)) throw new SessionError('Tmux pane is no longer available.')
    await this.run(['resize-pane', dimension === 'width' ? '-x' : '-y', String(normalizePaneSize(size)), '-t', target])
    return this.listPanes(sessionName, windowIndex)
  }

  async sendPaneInput(paneId: unknown, data: string): Promise<void> {
    const target = normalizePaneId(paneId)
    const chunks = data.split('\0')
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index] ?? ''
      if (chunk) await this.run(['send-keys', '-t', target, '-l', '--', chunk])
      if (index < chunks.length - 1) await this.run(['send-keys', '-t', target, '-H', '00'])
    }
  }

  async sendPaneInputBinary(paneId: unknown, data: string): Promise<void> {
    const target = normalizePaneId(paneId)
    const bytes = Array.from(data, character => character.charCodeAt(0).toString(16).padStart(2, '0'))
    if (bytes.length > 0) await this.run(['send-keys', '-t', target, '-H', ...bytes])
  }

  async renameWindow(name: string, index: unknown, nextName: string): Promise<TmuxWindow | null> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    await this.run(['rename-window', '-t', `${sessionName}:${windowIndex}`, normalizeWindowName(nextName)])
    return (await this.listWindows(sessionName)).find(window => window.index === windowIndex) ?? null
  }

  async renameAgent(paneId: unknown, label: string | null): Promise<void> {
    const target = normalizePaneId(paneId)
    if (label === null) {
      await this.run(['set-option', '-pu', '-t', target, '@bitveins_agent_label'])
      return
    }
    const normalized = tmuxAgentLabelSchema.parse(label)
    await this.run(['set-option', '-p', '-t', target, '@bitveins_agent_label', normalized])
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

  async captureWindowSnapshot(name: string, index: unknown, lines = 2000, paneId?: unknown): Promise<string> {
    const sessionName = normalizeSessionName(name)
    const windowIndex = normalizeWindowIndex(index)
    const target = paneId === undefined
      ? `${sessionName}:${windowIndex}`
      : normalizePaneId(paneId)
    if (paneId !== undefined) {
      const panes = await this.listPanes(sessionName, windowIndex)
      if (!panes.some(pane => pane.id === target)) throw new SessionError('Tmux pane is no longer available.')
    }
    const start = `-${Math.max(1, Math.min(20_000, Math.floor(lines)))}`
    return this.run([
      'capture-pane',
      '-e',
      '-p',
      '-J',
      '-S',
      start,
      '-t',
      target,
    ])
  }

  async capturePaneViewport(paneId: unknown) {
    return captureTmuxPaneViewport(args => this.run(args), normalizePaneId(paneId))
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

  async prepareTerminalWheel(name: string, direction: 'down' | 'up', lineCount?: 1): Promise<boolean> {
    const sessionName = normalizeTerminalTarget(name)
    const scrollLineCount = String(lineCount ?? 5)
    const [paneInMode, mouseAnyFlag] = (await this.run([
      'display-message',
      '-p',
      '-t',
      sessionName,
      '#{pane_in_mode}|#{mouse_any_flag}',
    ])).trim().split('|')

    if (paneInMode === '1') {
      await this.run(['send-keys', '-N', scrollLineCount, '-X', '-t', sessionName, `scroll-${direction}`])
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
    await this.run(['send-keys', '-N', scrollLineCount, '-X', '-t', sessionName, 'scroll-up'])
    return true
  }

  async resetTerminalScroll(name: string): Promise<void> {
    const sessionName = normalizeTerminalTarget(name)
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

  private async withDetectedPaneApplications(
    panes: ReturnType<typeof parseTmuxPanes>,
  ): Promise<TmuxPane[]> {
    const applications = await this.detectApplications(panes.map(({ panePid }) => panePid))
    return panes.map(({ pane, panePid }) => (
      panePid !== null && applications.get(panePid) === 'hermes'
        ? { ...pane, application: 'hermes' as const }
        : pane
    ))
  }

  private async detectApplications(panePids: readonly (number | null)[]): Promise<Map<number, string>> {
    const result = new Map<number, string>()
    if (!panePids.some(pid => pid !== null)) return result
    try {
      const { stdout } = await this.options.runner.run('ps', ['-eo', 'pid=,tpgid=,comm='], {
        maxBuffer: TMUX_MAX_BUFFER,
        timeoutMs: TMUX_TIMEOUT_MS,
      })
      const processes = new Map<number, { command: string, foregroundPid: number }>()
      for (const line of stdout.split('\n')) {
        const match = line.match(/^\s*(\d+)\s+(-?\d+)\s+(\S+)\s*$/)
        if (!match) continue
        processes.set(Number(match[1]), { command: match[3]!, foregroundPid: Number(match[2]) })
      }
      for (const panePid of panePids) {
        if (panePid === null) continue
        const paneProcess = processes.get(panePid)
        const command = paneProcess ? processes.get(paneProcess.foregroundPid)?.command : undefined
        if (command) result.set(panePid, command)
      }
    }
    catch {
      // Application labels are an optional UI enhancement.
    }
    return result
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
