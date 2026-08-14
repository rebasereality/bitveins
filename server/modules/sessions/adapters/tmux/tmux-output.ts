import type { TmuxPane, TmuxWindow } from '#shared/contracts/terminal'
import type { DiscoveredTmuxSession } from '../../ports/tmux-gateway'
import { BITVEINS_SESSION_PREFIX, normalizeWindowIndex } from '../../model/session-validation'

export interface BitveinsHelperSession {
  base: string
  name: string
  owner: string
}

export interface TmuxWindowWithPanePid {
  panePid: number | null
  window: TmuxWindow
}

export interface TmuxPaneWithPid {
  pane: TmuxPane
  panePid: number | null
}

function positiveInteger(value: string, fallback = 1): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nonnegativeInteger(value: string): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}

export function parseTmuxPanes(stdout: string): TmuxPaneWithPid[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        id = '', index = '', active = '0', left = '', top = '', width = '', height = '',
        windowWidth = '', windowHeight = '', panePid = '', ...pathParts
      ] = line.split('|')
      const parsedPanePid = Number(panePid)
      return {
        panePid: Number.isSafeInteger(parsedPanePid) && parsedPanePid > 0 ? parsedPanePid : null,
        pane: {
          id,
          index: nonnegativeInteger(index),
          active: active === '1',
          left: nonnegativeInteger(left),
          top: nonnegativeInteger(top),
          width: positiveInteger(width),
          height: positiveInteger(height),
          windowWidth: positiveInteger(windowWidth),
          windowHeight: positiveInteger(windowHeight),
          path: pathParts.join('|') || '~',
        },
      }
    })
    .sort((left, right) => left.pane.index - right.pane.index)
}

export function parseTmuxSessions(stdout: string): DiscoveredTmuxSession[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|')
      const name = parts.shift() ?? ''
      const hasOptionField = parts.length >= 2
      const sessionId = hasOptionField ? parts.shift() ?? '' : ''
      return {
        name,
        ...(sessionId ? { sessionId } : {}),
        path: parts.join('|') || '~',
      }
    })
    .filter(session => !session.name.startsWith(BITVEINS_SESSION_PREFIX))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function parseTmuxWindows(stdout: string): TmuxWindow[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = '', index = '', name = '', active = '0', panesCount = '1', ...pathParts] = line.split('|')
      const parsedPanes = Number(panesCount)

      return {
        id,
        index: normalizeWindowIndex(index),
        name: name || `window-${index}`,
        active: active === '1',
        path: pathParts.join('|') || '~',
        panesCount: Number.isSafeInteger(parsedPanes) && parsedPanes > 0 ? parsedPanes : 1,
      }
    })
    .sort((a, b) => a.index - b.index)
}

export function parseTmuxWindowsWithPanePids(stdout: string): TmuxWindowWithPanePid[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = '', index = '', name = '', active = '0', panePid = '', panesCount = '1', ...pathParts] = line.split('|')
      const parsedPanePid = Number(panePid)
      const parsedPanes = Number(panesCount)

      return {
        panePid: Number.isSafeInteger(parsedPanePid) && parsedPanePid > 0 ? parsedPanePid : null,
        window: {
          id,
          index: normalizeWindowIndex(index),
          name: name || `window-${index}`,
          active: active === '1',
          path: pathParts.join('|') || '~',
          panesCount: Number.isSafeInteger(parsedPanes) && parsedPanes > 0 ? parsedPanes : 1,
        },
      }
    })
    .sort((a, b) => a.window.index - b.window.index)
}

export function parseBitveinsHelperSessions(stdout: string): BitveinsHelperSession[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', helper = '', base = '', owner = ''] = line.split('|')
      return { base, helper, name, owner }
    })
    .filter(session => session.helper === '1' || session.name.startsWith(BITVEINS_SESSION_PREFIX))
    .map(({ base, name, owner }) => ({ base, name, owner }))
}

export function isMissingTmuxServerError(causeText?: string): boolean {
  return Boolean(
    causeText?.includes('no server running')
    || causeText?.includes('failed to connect to server')
    || causeText?.includes('error connecting to')
    || causeText?.includes('server exited unexpectedly'),
  )
}
