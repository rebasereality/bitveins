import { tmuxAgentLabelSchema } from '#shared/contracts/agents'
import { BITVEINS_SESSION_PREFIX } from '../../sessions/model/session-validation'
import { normalizeCodexThreadId } from '../model/codex-thread-id'

export interface TmuxAgentPaneCandidate {
  codexThreadId?: string
  customLabel?: string
  paneId: string
  paneIndex: number
  panePid: number
  path: string
  sessionName: string
  windowId: string
  windowIndex: number
  windowName: string
}

function nonnegativeInteger(value: string): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function positiveInteger(value: string): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseTmuxAgentPaneCandidates(stdout: string): TmuxAgentPaneCandidate[] {
  const candidates: TmuxAgentPaneCandidate[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const separator = line.includes('\t') ? '\t' : (line.includes('\\t') ? '\\t' : '|')
    const [
      sessionName = '',
      windowId = '',
      windowIndexText = '',
      windowName = '',
      paneId = '',
      paneIndexText = '',
      panePidText = '',
      paneDead = '1',
      customLabelText = '',
      codexThreadIdText = '',
      ...pathParts
    ] = line.split(separator)
    const windowIndex = nonnegativeInteger(windowIndexText)
    const paneIndex = nonnegativeInteger(paneIndexText)
    const panePid = positiveInteger(panePidText)
    if (
      sessionName.startsWith(BITVEINS_SESSION_PREFIX)
      || !/^@[0-9]+$/u.test(windowId)
      || !/^%[0-9]+$/u.test(paneId)
      || windowIndex === null
      || paneIndex === null
      || panePid === null
      || paneDead === '1'
    ) continue

    const customLabel = tmuxAgentLabelSchema.safeParse(customLabelText)
    const codexThreadId = normalizeCodexThreadId(codexThreadIdText)
    candidates.push({
      ...(codexThreadId ? { codexThreadId } : {}),
      ...(customLabel.success ? { customLabel: customLabel.data } : {}),
      paneId,
      paneIndex,
      panePid,
      path: pathParts.join(separator) || '~',
      sessionName,
      windowId,
      windowIndex,
      windowName: windowName || `window-${windowIndex}`,
    })
  }
  return candidates
}

export function normalizeTmuxAgentTitle(value: string): string | null {
  const normalized = value.replace(/[\u0000-\u001F\u007F]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 80)
  return tmuxAgentLabelSchema.safeParse(normalized).success ? normalized : null
}
