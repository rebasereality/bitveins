import { tmuxAgentListSchema, tmuxAgentSchema, type TmuxAgent } from '#shared/contracts/agents'
import { apiErrorMessage } from '~/utils/api-error'

export function useTmuxAgents(handleAuthError: (error: unknown) => void) {
  const agents = ref<TmuxAgent[]>([])
  const error = ref<string | null>(null)
  const loading = ref(true)
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let refreshing = false

  async function refresh(): Promise<void> {
    if (refreshing) return
    refreshing = true
    try {
      const response = tmuxAgentListSchema.parse(await $fetch('/api/agents'))
      agents.value = response.agents
      error.value = null
    }
    catch (cause) {
      error.value = apiErrorMessage(cause, 'Unable to inspect tmux agents.')
      handleAuthError(cause)
    }
    finally {
      loading.value = false
      refreshing = false
    }
  }

  async function rename(paneId: string, label: string | null): Promise<void> {
    try {
      const response = await $fetch<{ agent: unknown }>(`/api/agents/${paneId.slice(1)}`, {
        method: 'PATCH',
        body: { label },
      })
      const agent = tmuxAgentSchema.parse(response.agent)
      agents.value = agents.value.map(candidate => candidate.paneId === agent.paneId ? agent : candidate)
      error.value = null
    }
    catch (cause) {
      error.value = apiErrorMessage(cause, 'Unable to rename tmux agent.')
      handleAuthError(cause)
    }
  }

  onMounted(() => {
    void refresh()
    refreshTimer = setInterval(() => void refresh(), 3_000)
  })

  onBeforeUnmount(() => {
    if (refreshTimer) clearInterval(refreshTimer)
    refreshTimer = null
  })

  return { agents, error, loading, refresh, rename }
}
