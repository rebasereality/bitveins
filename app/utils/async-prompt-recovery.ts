export function asyncPromptSubmittedKey(scopeKey: string): string {
  return `bitveins_async_submitted_${scopeKey}`
}

export function readSubmittedAsyncPrompt(storage: Storage, scopeKey: string): string {
  return storage.getItem(asyncPromptSubmittedKey(scopeKey)) || ''
}

export function hasSubmittedAsyncPrompt(storage: Storage, scopeKey: string | null): boolean {
  return Boolean(scopeKey && storage.getItem(asyncPromptSubmittedKey(scopeKey)))
}

export function saveSubmittedAsyncPrompt(storage: Storage, scopeKey: string, prompt: string): void {
  storage.setItem(asyncPromptSubmittedKey(scopeKey), prompt)
}
