import { describe, expect, it } from 'vitest'
import { gitChangedLines } from '../../../app/git/git-line-diff'

describe('gitChangedLines', () => {
  it('finds inserted and deleted lines', () => {
    expect(gitChangedLines('one\ntwo\nthree\n', 'one\nnew\nthree\nfour\n')).toEqual({
      before: [2],
      after: [2, 4],
    })
  })

  it('handles additions, deletions, and unchanged files', () => {
    expect(gitChangedLines('', 'one\ntwo\n')).toEqual({ before: [], after: [1, 2] })
    expect(gitChangedLines('one\ntwo\n', '')).toEqual({ before: [1, 2], after: [] })
    expect(gitChangedLines('same\n', 'same\n')).toEqual({ before: [], after: [] })
  })
})
