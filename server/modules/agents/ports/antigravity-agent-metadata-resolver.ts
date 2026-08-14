export interface AntigravityAgentMetadataResolver {
  labelFor(processId: number): Promise<string | null>
}
