import type { TmuxSession, TmuxWindow } from '#shared/contracts/terminal'
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

export function parseTmuxSessions(stdout: string): TmuxSession[] {
  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name = '', ...pathParts] = line.split('|')
      return {
        name,
        path: pathParts.join('|') || '~',
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
      const [id = '', index = '', name = '', active = '0', ...pathParts] = line.split('|')

      return {
        id,
        index: normalizeWindowIndex(index),
        name: name || `window-${index}`,
        active: active === '1',
        path: pathParts.join('|') || '~',
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
      const [id = '', index = '', name = '', active = '0', panePid = '', ...pathParts] = line.split('|')
      const parsedPanePid = Number(panePid)

      return {
        panePid: Number.isSafeInteger(parsedPanePid) && parsedPanePid > 0 ? parsedPanePid : null,
        window: {
          id,
          index: normalizeWindowIndex(index),
          name: name || `window-${index}`,
          active: active === '1',
          path: pathParts.join('|') || '~',
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
    || causeText?.includes('error connecting to'),
  )
}
