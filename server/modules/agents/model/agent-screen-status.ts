import type { TmuxAgentKind, TmuxAgentStatus } from '#shared/contracts/agents'

const ANSI_PATTERN = /\u001B\[[0-9;?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B[@-Z\\-_]/gu

const ACTIVITY_GLYPHS = /^[\s]*(?:[\u2800-\u28FF✻✽✢])[\s]+/u

const BLOCKED_PATTERNS = [
  /(?:needs?|requires?) (?:your )?(?:input|permission|approval|confirmation)/iu,
  /waiting for (?:your )?(?:input|approval|confirmation)/iu,
  /(?:do you|would you) (?:want|like) to (?:allow|approve|continue|proceed|run)/iu,
  /press enter to (?:approve|confirm|continue|submit)/iu,
  /select (?:an|one) option/iu,
  /yes, and don['’]t ask again/iu,
  /submit\s*\/\s*skip/iu,
  /\(recommended\)/iu,
]

const FAILURE_PATTERNS = [
  /(?:^|\n)fatal:/iu,
  /authentication (?:error|failed|required)/iu,
  /api (?:error|request failed)/iu,
  /rate limit(?:ed| exceeded)/iu,
  /(?:connection|request) (?:failed|timed out)/iu,
]

const WORKING_FOOTER_PATTERNS = [
  /(?:^|\n)\s*(?:esc|escape|ctrl\+c)\s+to\s+(?:interrupt|cancel|abort|stop)/iu,
  /(?:^|\n)\s*(?:press|hit)\s+(?:esc|escape|ctrl\+c)\s+to/iu,
  /(?:^|\n)\s*cancel\s+with\s+(?:esc|escape|ctrl\+c)/iu,
  /(?:^|\n)\s*[\u2800-\u28FF✻✽✢]\s+(?:working|thinking|generating|running|analyzing|executing|searching|viewing|editing)(?:\.{3}|…|\s|\(|$)/iu,
  /(?:^|\n)\s*(?:running|calling|executing)\s+tool(?::|\s)/iu,
]

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

function getNonemptyLines(screen: string): string[] {
  return stripAnsi(screen)
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim())
}

function recentNonemptyLines(screen: string, count: number): string {
  return getNonemptyLines(screen)
    .slice(-count)
    .join('\n')
}

export function stripAgentActivityGlyph(title: string): string {
  return stripAnsi(title).replace(ACTIVITY_GLYPHS, '').trim()
}

export function classifyAgentScreenStatus(
  _kind: TmuxAgentKind,
  title: string,
  screen: string | null,
): TmuxAgentStatus {
  if (screen === null) return 'unknown'
  const cleanTitle = stripAnsi(title)

  const attentionRegion = recentNonemptyLines(screen, 8)
  if (BLOCKED_PATTERNS.some(pattern => pattern.test(attentionRegion))) return 'blocked'

  const failureRegion = recentNonemptyLines(screen, 6)
  if (FAILURE_PATTERNS.some(pattern => pattern.test(failureRegion))) return 'failed'

  if (ACTIVITY_GLYPHS.test(cleanTitle)) return 'working'

  // Working indicators (cancel hints, live spinners, tool execution) appear in the active bottom footer
  const footerRegion = recentNonemptyLines(screen, 4)
  if (WORKING_FOOTER_PATTERNS.some(pattern => pattern.test(footerRegion))) return 'working'

  return 'idle'
}
