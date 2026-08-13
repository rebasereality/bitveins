export interface CodexProcessMetadata {
  executable: string
  threadId: string | null
}

export interface CodexProcessInspector {
  inspect(processId: number): Promise<CodexProcessMetadata | null>
}
