import { describe, expect, it } from 'vitest'
import type { GitCommit } from '../../../shared/contracts/git'
import { layoutGitGraph } from '../../../app/git/git-graph-layout'

function commit(hash: string, parents: string[]): GitCommit {
  return {
    hash: hash.repeat(40).slice(0, 40),
    shortHash: hash.repeat(8).slice(0, 8),
    parents: parents.map(parent => parent.repeat(40).slice(0, 40)),
    subject: hash,
    authorName: 'Test',
    authorEmail: 'test@example.test',
    authoredAt: '2026-01-01T00:00:00Z',
    references: [],
  }
}

describe('layoutGitGraph', () => {
  it('keeps a linear history in one lane', () => {
    const rows = layoutGitGraph([
      commit('a', ['b']),
      commit('b', ['c']),
      commit('c', []),
    ])

    expect(rows.map(row => ({ lane: row.lane, laneCount: row.laneCount }))).toEqual([
      { lane: 0, laneCount: 1 },
      { lane: 0, laneCount: 1 },
      { lane: 0, laneCount: 1 },
    ])
    expect(rows[0]?.segments).toEqual([
      expect.objectContaining({ from: 0, kind: 'outgoing', to: 0 }),
    ])
  })

  it('creates and rejoins lanes for a merge graph', () => {
    const rows = layoutGitGraph([
      commit('a', ['b', 'c']),
      commit('b', ['d']),
      commit('c', ['d']),
      commit('d', []),
    ])

    expect(rows[0]).toMatchObject({ lane: 0, laneCount: 2 })
    expect(rows[0]?.segments.filter(segment => segment.kind === 'outgoing')).toHaveLength(2)
    expect(rows[1]).toMatchObject({ lane: 0, laneCount: 2 })
    expect(rows[2]).toMatchObject({ lane: 1, laneCount: 2 })
    expect(rows[3]).toMatchObject({ lane: 0, laneCount: 1 })
  })

  it('keeps unrelated branch tips visible until they are consumed', () => {
    const rows = layoutGitGraph([
      commit('a', ['b']),
      commit('c', ['d']),
      commit('b', []),
      commit('d', []),
    ])

    expect(rows[1]).toMatchObject({ lane: 0, laneCount: 2 })
    expect(rows[1]?.segments.some(segment => segment.kind === 'through')).toBe(true)
    expect(rows[2]).toMatchObject({ lane: 1 })
  })
})
