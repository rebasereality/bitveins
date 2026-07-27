import { describe, expect, it } from 'vitest'
import { parseMediaByteRange } from '../../../../../server/modules/explorer/model/media-byte-range'

describe('parseMediaByteRange', () => {
  it.each([
    [undefined, null],
    ['bytes=0-499', { start: 0, end: 499 }],
    ['bytes=500-', { start: 500, end: 999 }],
    ['bytes=-250', { start: 750, end: 999 }],
    ['bytes=900-2000', { start: 900, end: 999 }],
  ])('parses %s', (header, expected) => {
    expect(parseMediaByteRange(header, 1000)).toEqual(expected)
  })

  it.each([
    'items=0-10',
    'bytes=',
    'bytes=0-1,4-5',
    'bytes=1000-',
    'bytes=20-10',
    'bytes=-0',
    'bytes=invalid-10',
    'bytes=999999999999999999999-',
  ])('rejects an unsatisfiable range: %s', (header) => {
    expect(() => parseMediaByteRange(header, 1000)).toThrow(expect.objectContaining({
      code: 'invalid-range',
    }))
  })
})
