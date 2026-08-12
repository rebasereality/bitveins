import type { TmuxAgentKind, TmuxAgentStatus } from '#shared/contracts/agents'

const ACTIVITY_GLYPHS = /^[\s]*(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✽✢●◐◓◑◒◉◌◍◎])[\s]+/u

const BLOCKED_PATTERNS = [
  /(?:needs?|requires?) (?:your )?(?:input|permission|approval|confirmation)/iu,
  /waiting for (?:your )?(?:input|approval|confirmation)/iu,
  /(?:do you|would you) (?:want|like) to (?:allow|approve|continue|proceed|run)/iu,
  /press enter to (?:approve|confirm|continue|submit)/iu,
  /select (?:an|one) option/iu,
  /yes, and don['’]t ask again/iu,
]

const FAILURE_PATTERNS = [
  /(?:^|\n)fatal:/iu,
  /authentication (?:error|failed|required)/iu,
  /api (?:error|request failed)/iu,
  /rate limit(?:ed| exceeded)/iu,
  /(?:connection|request) (?:failed|timed out)/iu,
]

const WORKING_PATTERNS = [
  /esc to interrupt/iu,
  /ctrl\+c to interrupt/iu,
  /(?:^|\n)\s*(?:thinking|working|generating|running)(?:\.{3}|…)?\s*$/iu,
  /(?:^|\n)\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏✻✽✢]\s+/u,
]

function recentNonemptyLines(screen: string, count: number): string {
  return screen
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim())
    .slice(-count)
    .join('\n')
}

export function stripAgentActivityGlyph(title: string): string {
  return title.replace(ACTIVITY_GLYPHS, '').trim()
}

export function classifyAgentScreenStatus(
  _kind: TmuxAgentKind,
  title: string,
  screen: string | null,
): TmuxAgentStatus {
  if (screen === null) return 'unknown'
  const attentionRegion = recentNonemptyLines(screen, 14)
  if (BLOCKED_PATTERNS.some(pattern => pattern.test(attentionRegion))) return 'blocked'

  const failureRegion = recentNonemptyLines(screen, 8)
  if (FAILURE_PATTERNS.some(pattern => pattern.test(failureRegion))) return 'failed'

  if (ACTIVITY_GLYPHS.test(title)) return 'working'
  const activityRegion = recentNonemptyLines(screen, 10)
  if (WORKING_PATTERNS.some(pattern => pattern.test(activityRegion))) return 'working'
  return 'idle'
}
