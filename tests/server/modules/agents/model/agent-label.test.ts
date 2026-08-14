import { describe, expect, it } from 'vitest'
import { normalizeAgentLabel } from '../../../../../server/modules/agents/model/agent-label'

describe('normalizeAgentLabel', () => {
  it('returns null for non-string values', () => {
    expect(normalizeAgentLabel(null)).toBeNull()
    expect(normalizeAgentLabel(undefined)).toBeNull()
    expect(normalizeAgentLabel(123)).toBeNull()
    expect(normalizeAgentLabel({})).toBeNull()
  })

  it('normalizes valid strings and trims extra whitespace / control characters', () => {
    expect(normalizeAgentLabel('  hello \t\n world \u0007 ')).toBe('hello world')
  })

  it('truncates strings longer than 80 characters', () => {
    const longString = 'a'.repeat(100)
    const result = normalizeAgentLabel(longString)
    expect(result).toBe('a'.repeat(80))
  })

  it('returns null for empty strings after trimming', () => {
    expect(normalizeAgentLabel('   ')).toBeNull()
    expect(normalizeAgentLabel('')).toBeNull()
  })
})
