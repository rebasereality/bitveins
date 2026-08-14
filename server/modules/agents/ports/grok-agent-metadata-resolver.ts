export interface GrokAgentMetadataResolver {
  labelFor(processId: number, workspacePath?: string): Promise<string | null>
}
