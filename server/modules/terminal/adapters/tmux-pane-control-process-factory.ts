import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Disposable, PtyExitEvent } from '../ports/pty-factory'
import type { TerminalAttachmentSize } from '../ports/terminal-attachment-process-factory'
import type {
  TerminalPaneControlProcess,
  TerminalPaneControlProcessFactory,
  TerminalPaneControlTarget,
} from '../ports/terminal-pane-control-process-factory'
import { parseTmuxPaneOutput } from './tmux-control-protocol'

interface TmuxPaneControlProcessFactoryOptions {
  cwd: string
  env: Record<string, string | undefined>
  socketName?: string
}

class ChildTmuxPaneControlProcess implements TerminalPaneControlProcess {
  private buffer = ''
  private readonly dataListeners = new Set<(data: string) => void>()
  private exited = false
  private readonly exitListeners = new Set<(event: PtyExitEvent) => void>()
  private lastSize: TerminalAttachmentSize | null = null
  private resizeAuthority = false

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly paneId: string,
    private readonly requestActivation: (process: ChildTmuxPaneControlProcess) => void,
  ) {
    child.stdout.setEncoding('utf8')
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.stdout.on('data', (chunk: string) => this.consume(chunk))
    child.on('error', () => this.emitExit({ exitCode: 1 }))
    child.on('exit', (code, signal) => this.emitExit({
      exitCode: code ?? 1,
      ...(signal ? { signal: 1 } : {}),
    }))
  }

  activate(): void {
    this.requestActivation(this)
  }

  kill(): void {
    if (!this.exited) this.child.kill('SIGTERM')
  }

  onData(listener: (data: string) => void): Disposable {
    this.dataListeners.add(listener)
    return { dispose: () => this.dataListeners.delete(listener) }
  }

  onExit(listener: (event: PtyExitEvent) => void): Disposable {
    this.exitListeners.add(listener)
    return { dispose: () => this.exitListeners.delete(listener) }
  }

  resize(columns: number, rows: number): void {
    this.lastSize = { cols: columns, rows }
    this.applyRequestedSize()
  }

  setResizeAuthority(authority: boolean): void {
    this.resizeAuthority = authority
    if (authority) this.applyRequestedSize()
  }

  applyRequestedSize(): void {
    if (!this.resizeAuthority || !this.lastSize || this.exited || !this.child.stdin.writable) return
    this.child.stdin.write(`refresh-client -C ${this.lastSize.cols}x${this.lastSize.rows}\n`)
  }

  private consume(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/u, '')
      this.buffer = this.buffer.slice(newline + 1)
      const output = parseTmuxPaneOutput(line)
      if (output?.paneId === this.paneId) {
        for (const listener of this.dataListeners) listener(output.data)
      }
      newline = this.buffer.indexOf('\n')
    }
  }

  private emitExit(event: PtyExitEvent): void {
    if (this.exited) return
    this.exited = true
    for (const listener of this.exitListeners) listener(event)
    this.dataListeners.clear()
    this.exitListeners.clear()
  }
}

export class TmuxPaneControlProcessFactory implements TerminalPaneControlProcessFactory {
  private readonly authorities = new Map<string, ChildTmuxPaneControlProcess>()
  private readonly windowProcesses = new Map<string, Set<ChildTmuxPaneControlProcess>>()

  constructor(private readonly options: TmuxPaneControlProcessFactoryOptions) {}

  attach(target: TerminalPaneControlTarget, size: TerminalAttachmentSize): TerminalPaneControlProcess {
    const socketArgs = this.options.socketName ? ['-L', this.options.socketName] : []
    const { TMUX: _parentTmux, TMUX_PANE: _parentTmuxPane, ...hostEnvironment } = this.options.env
    const child = spawn(
      'tmux',
      [...socketArgs, '-C', 'attach-session', '-t', `${target.sessionName}:${target.windowIndex}`],
      {
        cwd: this.options.cwd,
        env: { ...hostEnvironment, TERM: 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    const windowKey = `${target.sessionName}:${target.windowIndex}`
    const processes = this.windowProcesses.get(windowKey) ?? new Set<ChildTmuxPaneControlProcess>()
    this.windowProcesses.set(windowKey, processes)
    const process = new ChildTmuxPaneControlProcess(
      child,
      target.paneId,
      candidate => this.claimResizeAuthority(windowKey, candidate),
    )
    processes.add(process)
    this.claimResizeAuthority(windowKey, process)
    process.onExit(() => this.release(windowKey, process))
    process.resize(size.cols, size.rows)
    return process
  }

  private claimResizeAuthority(windowKey: string, authority: ChildTmuxPaneControlProcess): void {
    const processes = this.windowProcesses.get(windowKey)
    if (!processes?.has(authority)) return
    this.authorities.set(windowKey, authority)
    for (const process of processes) process.setResizeAuthority(process === authority)
  }

  private release(windowKey: string, process: ChildTmuxPaneControlProcess): void {
    const processes = this.windowProcesses.get(windowKey)
    if (!processes) return
    const wasAuthority = this.authorities.get(windowKey) === process
    processes.delete(process)
    if (processes.size === 0) {
      this.authorities.delete(windowKey)
      this.windowProcesses.delete(windowKey)
      return
    }
    if (wasAuthority) {
      const fallback = Array.from(processes).at(-1)
      if (fallback) this.claimResizeAuthority(windowKey, fallback)
    }
  }
}
