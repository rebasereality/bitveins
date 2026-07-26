import { describe, expect, it } from 'vitest'
import { resolutionFor } from '../../../../../server/modules/explorer/model/file-reference-resolution'

const reference = { path: 'src/file.ts', line: 4 }
const first = {
  canonicalPath: '/workspace/one/src/file.ts',
  absolutePath: '/workspace/one/src/file.ts',
  root: 'one',
  kind: 'text' as const,
  path: 'one/src/file.ts',
  name: 'file.ts',
  size: 12,
}

describe('resolutionFor', () => {
  it('represents missing, unique and ambiguous outcomes', () => {
    expect(resolutionFor(reference, [])).toEqual({ status: 'missing', reference })
    expect(resolutionFor(reference, [first])).toEqual({
      status: 'unique',
      reference,
      document: expect.not.objectContaining({ canonicalPath: expect.anything() }),
    })
    expect(resolutionFor(reference, [
      first,
      { ...first, canonicalPath: '/workspace/two/src/file.ts', root: 'two', path: 'two/src/file.ts' },
    ])).toMatchObject({ status: 'ambiguous', candidates: [{ root: 'one' }, { root: 'two' }] })
  })

  it('deduplicates the same canonical file', () => {
    expect(resolutionFor(reference, [first, { ...first, root: '.' }])).toMatchObject({
      status: 'unique',
      document: { root: '.' },
    })
  })
})
