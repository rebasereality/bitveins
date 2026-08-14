import { describe, expect, it } from 'vitest'
import {
  transferSessionBaseName,
  transferSessionCandidate,
} from '../../../../../server/modules/sessions/model/transfer-session-name'

describe('Transfer session names', () => {
  it('creates a compact lowercase slug and transliterates accents', () => {
    expect(transferSessionBaseName('  Dépôt Documentation  ', '/workspace/docs'))
      .toBe('depot-documentation')
  })

  it('falls back to the path basename and then to transfer', () => {
    expect(transferSessionBaseName('日本語', '/workspace/Mon Projet')).toBe('mon-projet')
    expect(transferSessionBaseName('日本語', '/')).toBe('transfer')
  })

  it('keeps candidates within tmux limits when adding suffixes', () => {
    const baseName = transferSessionBaseName('a'.repeat(100), '/workspace')

    expect(baseName).toHaveLength(80)
    expect(transferSessionCandidate(baseName, 2)).toHaveLength(80)
    expect(transferSessionCandidate(baseName, 2)).toMatch(/-2$/)
  })

  it('uses deterministic ordinals', () => {
    expect(transferSessionCandidate('docs', 1)).toBe('docs')
    expect(transferSessionCandidate('docs', 0)).toBe('docs')
    expect(transferSessionCandidate('docs', 3)).toBe('docs-3')
    expect(transferSessionCandidate('---', 2)).toBe('transfer-2')
    expect(transferSessionBaseName('', '')).toBe('transfer')
    expect(transferSessionBaseName('---', '---')).toBe('transfer')
    expect(transferSessionBaseName('', '/workspace/my-project')).toBe('my-project')
  })
})
