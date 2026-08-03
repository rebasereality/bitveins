import { basename } from 'node:path'
import type { CommandRunner } from '../ports/command-runner'

export interface DetectedAttentionContext {
  paneId?: string
  project?: string
  sessionName?: string
  windowId?: string
}

export class TmuxAttentionContextDetector {
  constructor(private readonly commands: CommandRunner) {}

  async detect(environment: NodeJS.ProcessEnv): Promise<DetectedAttentionContext> {
    const pane = environment.TMUX_PANE
    if (!pane || !/^%\d+$/u.test(pane)) return {}

    const result = await this.commands.run('tmux', [
      'display-message',
      '-p',
      '-t',
      pane,
      '#{session_name}\t#{window_id}\t#{pane_id}\t#{pane_current_path}',
    ], { allowFailure: true })
    if (result.exitCode !== 0) return {}

    const [sessionName, windowId, paneId, currentPath] = result.stdout.trim().split('\t')
    if (!sessionName || !/^@\d+$/u.test(windowId ?? '') || !/^%\d+$/u.test(paneId ?? '')) {
      return {}
    }
    return {
      paneId,
      ...(currentPath ? { project: basename(currentPath) } : {}),
      sessionName,
      windowId,
    }
  }
}
