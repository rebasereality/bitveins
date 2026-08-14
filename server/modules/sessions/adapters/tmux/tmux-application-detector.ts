import type { TmuxPane, TmuxWindow } from '#shared/contracts/terminal'
import {
  foregroundApplicationForPane,
  parseProcessCommandSnapshot,
} from '../../model/terminal-application'
import type { parseTmuxPanes, parseTmuxWindowsWithPanePids } from './tmux-output'
import type { CommandRunner } from './command-runner'

export interface TmuxApplicationDetectorOptions {
  maxBuffer: number
  runner: CommandRunner
  timeoutMs: number
}

export async function detectPaneApplications(
  panePids: readonly (number | null)[],
  options: TmuxApplicationDetectorOptions,
): Promise<Map<number, NonNullable<TmuxPane['application']>>> {
  const result = new Map<number, NonNullable<TmuxPane['application']>>()
  if (!panePids.some(pid => pid !== null)) return result
  try {
    const { stdout } = await options.runner.run('ps', ['-eo', 'pid=,tpgid=,comm='], {
      maxBuffer: options.maxBuffer,
      timeoutMs: options.timeoutMs,
    })
    const processes = parseProcessCommandSnapshot(stdout)
    for (const panePid of panePids) {
      if (panePid === null) continue
      const application = foregroundApplicationForPane(panePid, processes)
      if (application) result.set(panePid, application)
    }
  }
  catch {
    // Application labels are an optional UI enhancement.
  }
  return result
}

export async function withDetectedWindowApplications(
  windows: ReturnType<typeof parseTmuxWindowsWithPanePids>,
  options: TmuxApplicationDetectorOptions,
): Promise<TmuxWindow[]> {
  const applications = await detectPaneApplications(windows.map(window => window.panePid), options)
  return windows.map(({ panePid, window }) => {
    const application = panePid === null ? null : applications.get(panePid)
    return application ? { ...window, application } : window
  })
}

export async function withDetectedPanesApplications(
  panes: ReturnType<typeof parseTmuxPanes>,
  options: TmuxApplicationDetectorOptions,
): Promise<TmuxPane[]> {
  const applications = await detectPaneApplications(panes.map(({ panePid }) => panePid), options)
  return panes.map(({ pane, panePid }) => {
    const application = panePid === null ? undefined : applications.get(panePid)
    return application ? { ...pane, application } : pane
  })
}
