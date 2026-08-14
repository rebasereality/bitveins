export interface PromptDraft {
  draft: string
  revision: number
  sessionName: string
  updatedAt: number
  windowId: string
}

export interface SavePromptDraftInput {
  draft: string
  now: number
  revision?: number
  sessionName: string
  windowId: string
}

export interface PromptDraftRepository {
  clearDraft(sessionName: string, windowId: string): void
  getDraft(sessionName: string, windowId: string): PromptDraft | null
  listDrafts(sessionName: string): Record<string, string>
  saveDraft(input: SavePromptDraftInput): PromptDraft
}
