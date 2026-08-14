import { terminalClientEnvironment } from '../model/terminal-client-environment'
import type { PtyFactory, PtyProcess } from '../ports/pty-factory'
import type {
  TerminalAttachmentProcessFactory,
  TerminalAttachmentSize,
} from '../ports/terminal-attachment-process-factory'

interface TmuxTerminalAttachmentProcessFactoryOptions {
  cwd: string
  env: Record<string, string | undefined>
  ptyFactory: PtyFactory
  socketName?: string
}

export class TmuxTerminalAttachmentProcessFactory implements TerminalAttachmentProcessFactory {
  constructor(private readonly options: TmuxTerminalAttachmentProcessFactoryOptions) {}

  attach(sessionName: string, size: TerminalAttachmentSize): PtyProcess {
    const socketArgs = this.options.socketName ? ['-L', this.options.socketName] : []
    const {
      TMUX: _parentTmux,
      TMUX_PANE: _parentTmuxPane,
      ...hostEnvironment
    } = this.options.env

    return this.options.ptyFactory.spawn(
      'tmux',
      [...socketArgs, 'attach-session', '-t', sessionName],
      {
        cols: size.cols,
        cwd: this.options.cwd,
        env: terminalClientEnvironment(hostEnvironment),
        name: 'xterm-256color',
        rows: size.rows,
      },
    )
  }
}
