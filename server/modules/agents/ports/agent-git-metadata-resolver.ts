import type { TmuxAgentGitMetadata } from '#shared/contracts/agents'

export interface AgentGitMetadataResolver {
  resolve(path: string): Promise<TmuxAgentGitMetadata | null>
}
