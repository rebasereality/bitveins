import type { TmuxAgent, TmuxAgentStatus } from '#shared/contracts/agents'
import type { TmuxWindow } from '~/types/session'

const AGENT_STATUS_PRIORITY: Record<TmuxAgentStatus, number> = {
  failed: 5,
  blocked: 4,
  working: 3,
  idle: 2,
  unknown: 1,
}

export function resolveWindowAgentStatus(
  window: TmuxWindow,
  sessionName: string | null,
  agentList: TmuxAgent[],
): TmuxAgentStatus | undefined {
  if (!sessionName || !agentList || agentList.length === 0) return undefined

  const matchingAgents = agentList.filter(
    agent => agent.sessionName === sessionName && (agent.windowId === window.id || agent.windowIndex === window.index),
  )
  if (matchingAgents.length === 0) return undefined

  return matchingAgents.reduce((highest, current) => {
    return AGENT_STATUS_PRIORITY[current.status] > AGENT_STATUS_PRIORITY[highest.status]
      ? current
      : highest
  }, matchingAgents[0]!).status
}
