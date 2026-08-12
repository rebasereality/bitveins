import type { Ref } from 'vue'
import type { TmuxSession, TmuxWindow } from '~/types/session'
import type { TmuxAgent } from '#shared/contracts/agents'

interface AgentTerminalTarget {
  focusPane: (paneId: string) => Promise<boolean>
}

interface TmuxAgentNavigationOptions {
  attachSession: (sessionName: string) => Promise<void>
  clearNavigationMetadata: () => void
  error: Ref<string | null>
  fetchWindows: () => Promise<void>
  refreshAgents: () => Promise<void>
  refreshSessions: () => Promise<void>
  selectWindow: (windowIndex: number) => Promise<void>
  sessions: Ref<TmuxSession[]>
  terminal: Ref<AgentTerminalTarget | null>
  windows: Ref<TmuxWindow[]>
}

export function useTmuxAgentNavigation(options: TmuxAgentNavigationOptions) {
  return async function openAgent(agent: TmuxAgent): Promise<void> {
    options.clearNavigationMetadata()
    options.error.value = null
    await options.refreshSessions()
    const session = options.sessions.value.find(candidate => candidate.id === agent.sessionId)
    if (!session) {
      options.error.value = 'The tmux session containing this agent is no longer available.'
      await options.refreshAgents()
      return
    }

    await options.attachSession(session.name)
    await options.fetchWindows()
    const targetWindow = options.windows.value.find(candidate => candidate.id === agent.windowId)
    if (!targetWindow) {
      options.error.value = 'The tmux window containing this agent is no longer available.'
      await options.refreshAgents()
      return
    }

    await options.selectWindow(targetWindow.index)
    const focused = await options.terminal.value?.focusPane(agent.paneId)
    if (!focused) {
      options.error.value = 'The tmux pane containing this agent is no longer available.'
      await options.refreshAgents()
    }
  }
}
