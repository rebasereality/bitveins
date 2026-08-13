export interface CodexThreadMetadata {
  name: string | null
  preview: string
}

export interface CodexThreadMetadataReader {
  dispose(): void
  read(executable: string, threadId: string): Promise<CodexThreadMetadata | null>
}
