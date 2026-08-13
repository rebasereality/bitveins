import { describe, expect, it } from 'vitest'
import {
  gitCommitDetailsSchema,
  gitDiffQuerySchema,
  gitFileDiffSchema,
  gitGraphQuerySchema,
  gitGraphResponseSchema,
} from '../../../shared/contracts/git'

const hash = 'a'.repeat(40)
const commit = {
  hash,
  shortHash: 'aaaaaaaa',
  parents: ['b'.repeat(40)],
  subject: 'Add Git graph',
  authorName: 'Guillten',
  authorEmail: 'guillten@example.test',
  authoredAt: '2026-08-13T16:00:00Z',
  references: [{ kind: 'head' as const, name: 'main' }],
}

describe('Git viewer contracts', () => {
  it('parses graph pagination and responses', () => {
    expect(gitGraphQuerySchema.parse({ limit: '80', offset: '0' })).toEqual({ limit: 80, offset: 0 })
    expect(gitGraphResponseSchema.parse({
      repository: 'bitveins',
      branch: 'main',
      detached: false,
      commits: [commit],
      hasMore: false,
    }).commits[0]?.hash).toBe(hash)
  })

  it('parses details and text or binary file diffs', () => {
    const change = {
      path: 'app/example.ts',
      status: 'modified' as const,
      additions: 2,
      deletions: 1,
      binary: false,
    }
    expect(gitCommitDetailsSchema.parse({
      commit: {
        ...commit,
        body: 'Add Git graph\n',
        committerName: 'Guillten',
        committerEmail: 'guillten@example.test',
        committedAt: '2026-08-13T16:00:00Z',
      },
      files: [change],
    }).files).toEqual([change])
    expect(gitFileDiffSchema.parse({
      ...change,
      commit: hash,
      before: 'old\n',
      after: 'new\n',
    })).toMatchObject({ before: 'old\n', after: 'new\n' })
  })

  it('rejects unsafe hashes, paths, and pagination bounds', () => {
    expect(gitGraphQuerySchema.safeParse({ limit: 201, offset: 0 }).success).toBe(false)
    expect(gitDiffQuerySchema.safeParse({ commit: 'HEAD', path: 'file.ts' }).success).toBe(false)
    expect(gitDiffQuerySchema.safeParse({ commit: hash, path: '' }).success).toBe(false)
  })
})
