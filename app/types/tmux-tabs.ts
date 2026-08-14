import type { TmuxAgentStatus } from '#shared/contracts/agents'

export interface TmuxWindowTabItem {
  agentStatus?: TmuxAgentStatus
  label: string
  name: string
  title: string
  value: string
  windowIndex: number
}
