export interface CodexAgentMetadataResolver {
  labelFor(processId: number, hintedThreadId?: string): Promise<string | null>
}
