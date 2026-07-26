import { describe, expect, it } from 'vitest'
import {
  asyncPromptSubmittedKey,
  hasSubmittedAsyncPrompt,
  readSubmittedAsyncPrompt,
  saveSubmittedAsyncPrompt,
} from '../../../app/utils/async-prompt-recovery'

class MemoryStorage implements Storage {
  private items = new Map<string, string>()

  get length(): number {
    return this.items.size
  }

  clear(): void {
    this.items.clear()
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value)
  }
}

describe('async prompt recovery storage', () => {
  it('stores submitted prompts for the explicit restore action', () => {
    const storage = new MemoryStorage()
    const scopeKey = 'main:@1:0'
    const prompt = 'printf "large prompt"'

    saveSubmittedAsyncPrompt(storage, scopeKey, prompt)

    expect(storage.getItem(asyncPromptSubmittedKey(scopeKey))).toBe(prompt)
    expect(readSubmittedAsyncPrompt(storage, scopeKey)).toBe(prompt)
    expect(hasSubmittedAsyncPrompt(storage, scopeKey)).toBe(true)
  })

  it('reports no recoverable prompt for an empty or unrelated scope', () => {
    const storage = new MemoryStorage()

    saveSubmittedAsyncPrompt(storage, 'main:@1:0', 'last submitted')

    expect(readSubmittedAsyncPrompt(storage, 'other:@2:0')).toBe('')
    expect(hasSubmittedAsyncPrompt(storage, null)).toBe(false)
    expect(hasSubmittedAsyncPrompt(storage, 'other:@2:0')).toBe(false)
  })
})
